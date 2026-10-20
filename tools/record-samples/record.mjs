#!/usr/bin/env node
// Records token-garden sample gardens (docs/llm-provider.md §4 and §8).
// One-off tool with its own package.json; see README.md in this folder.
//
//   node record.mjs                                  # all prompts in prompts.json -> ../../src/samples
//   node record.mjs --only cat --out /tmp/rerecord   # one garden from prompts.json
//   node record.mjs --prompt "The kettle" --id kettle --title "The kettle"
//   node record.mjs --provider worker --url http://127.0.0.1:8787
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = 'onnx-community/SmolLM2-135M-ONNX';
const MODEL_REVISION = 'd0ae6834f1df45e0e95b5fdae95e536f9ca7cd3f'; // pinned so re-recording is reproducible
const DTYPE = 'q8';
const TOP_FETCH = 20; // candidates read per position before filtering down to k
const WORKER_K_MAX = 8; // the Worker caps k at 8 (docs/llm-provider.md §5)
const MAX_BYTES = 15 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const USAGE = `Usage: node record.mjs [options]
  --provider local-onnx|worker   model source (default local-onnx)
  --url <url>                    Worker base URL for --provider worker (default http://127.0.0.1:8787)
  --prompts <file>               prompt list (default prompts.json next to this script)
  --only <id>                    record just this id from the prompt list
  --prompt <text> --id <id> --title <title>   record a single ad-hoc garden
  --k <n>                        branches per fork (default 5)
  --full-depth <n>               expand every node down to this depth (default 2)
  --spine-depth <n>              extend the most probable paths to this depth (default 6)
  --spine-paths <n>              how many paths to extend (default 2)
  --out <dir>                    output directory (default ../../src/samples)
  --cache-dir <dir>              model download cache (default ./.cache)
  --date <YYYY-MM-DD>            recordedAt value (default: today, UTC)`;

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      provider: { type: 'string', default: 'local-onnx' },
      url: { type: 'string', default: 'http://127.0.0.1:8787' },
      prompts: { type: 'string', default: join(HERE, 'prompts.json') },
      only: { type: 'string' },
      prompt: { type: 'string' },
      id: { type: 'string' },
      title: { type: 'string' },
      k: { type: 'string', default: '5' },
      'full-depth': { type: 'string', default: '2' },
      'spine-depth': { type: 'string', default: '6' },
      'spine-paths': { type: 'string', default: '2' },
      out: { type: 'string', default: resolve(HERE, '../../src/samples') },
      'cache-dir': { type: 'string', default: join(HERE, '.cache') },
      date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const int = (name, min, max) => {
    const n = Number(values[name]);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} must be an integer ${min}-${max}`);
    return n;
  };
  if (!['local-onnx', 'worker'].includes(values.provider)) throw new Error('--provider must be local-onnx or worker');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error('--date must be YYYY-MM-DD');
  const opts = {
    help: values.help ?? false,
    provider: values.provider,
    url: values.url.replace(/\/+$/, ''),
    k: int('k', 1, values.provider === 'worker' ? WORKER_K_MAX : TOP_FETCH),
    fullDepth: int('full-depth', 0, 4),
    spineDepth: int('spine-depth', 0, 12),
    spinePaths: int('spine-paths', 0, 10),
    out: resolve(values.out),
    cacheDir: resolve(values['cache-dir']),
    date: values.date,
  };
  if (values.prompt !== undefined) {
    if (!values.id || !values.title) throw new Error('--prompt needs --id and --title');
    opts.gardens = [{ id: values.id, title: values.title, prompt: values.prompt }];
  } else {
    const list = JSON.parse(readFileSync(values.prompts, 'utf8'));
    opts.gardens = values.only ? list.filter((g) => g.id === values.only) : list;
    if (opts.gardens.length === 0) throw new Error(`no prompt with id "${values.only}" in ${values.prompts}`);
  }
  for (const g of opts.gardens) {
    if (!ID_RE.test(g.id)) throw new Error(`bad id "${g.id}" (lowercase letters, digits, dashes)`);
    if (typeof g.title !== 'string' || !g.title.trim()) throw new Error(`garden ${g.id}: missing title`);
    if (typeof g.prompt !== 'string' || g.prompt.length < 1 || g.prompt.length > 280) throw new Error(`garden ${g.id}: prompt must be 1-280 chars`);
  }
  return opts;
}

const round3 = (x) => {
  const r = Math.round(x * 1000) / 1000;
  return r === 0 ? 0 : r; // no -0
};
const byLogprobThenToken = (a, b) => b.logprob - a.logprob || (a.token < b.token ? -1 : a.token > b.token ? 1 : 0);

/** Filters raw candidates to the stored top-k: drop empty/special/U+FFFD, merge duplicate text, round, sort, slice. */
export function finalizeChoices(candidates, k) {
  const merged = new Map();
  for (const { token, logprob } of candidates) {
    if (!token || token.includes('�') || !Number.isFinite(logprob)) continue;
    const prev = merged.get(token);
    merged.set(token, prev === undefined ? logprob : Math.max(prev, logprob) + Math.log1p(Math.exp(-Math.abs(prev - logprob))));
  }
  return [...merged]
    .map(([token, logprob]) => ({ token, logprob: Math.min(0, round3(logprob)) }))
    .sort(byLogprobThenToken)
    .slice(0, k);
}

/** SmolLM2-135M base (q8) on CPU via transformers.js: one forward pass per prefix, full distribution. */
async function localOnnxProvider(cacheDir) {
  const { AutoModelForCausalLM, AutoTokenizer, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.cacheDir = cacheDir;
  const common = { cache_dir: cacheDir, revision: MODEL_REVISION };
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL, common);
  const model = await AutoModelForCausalLM.from_pretrained(MODEL, {
    ...common,
    dtype: DTYPE,
    device: 'cpu',
    // One thread: onnxruntime's parallel reductions can differ in the last bits between runs.
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: 'sequential' },
  });
  const decodeCache = new Map();
  const decode = (id) => {
    if (!decodeCache.has(id)) {
      const text = tokenizer.decode([id], { skip_special_tokens: true, clean_up_tokenization_spaces: false });
      decodeCache.set(id, text); // special tokens decode to '' and are dropped with the empties
    }
    return decodeCache.get(id);
  };
  return {
    model: { provider: 'local-onnx', name: MODEL, dtype: DTYPE },
    async nextTokens(prefix, k) {
      const inputs = tokenizer(prefix);
      const { logits } = await model(inputs);
      const [, seq, vocab] = logits.dims;
      const row = logits.data.subarray((seq - 1) * vocab, seq * vocab);
      let max = -Infinity;
      for (let i = 0; i < vocab; i++) if (row[i] > max) max = row[i];
      let sum = 0;
      for (let i = 0; i < vocab; i++) sum += Math.exp(row[i] - max);
      const logZ = max + Math.log(sum);
      // Top TOP_FETCH ids by logit; ties broken by id so the selection is deterministic.
      const top = [];
      for (let i = 0; i < vocab; i++) {
        if (top.length === TOP_FETCH && row[i] <= row[top[TOP_FETCH - 1]]) continue;
        let j = top.length < TOP_FETCH ? top.length : TOP_FETCH - 1;
        top[j] = i;
        while (j > 0 && row[top[j - 1]] < row[i]) {
          top[j] = top[j - 1];
          top[--j] = i;
        }
      }
      return finalizeChoices(top.map((id) => ({ token: decode(id), logprob: row[id] - logZ })), k);
    },
    async dispose() {
      await model.dispose();
    },
  };
}

/** The deployed (or `wrangler dev`) Worker: POST /api/next-tokens (docs/llm-provider.md §5). */
function workerProvider(baseUrl) {
  const state = { modelName: undefined };
  return {
    get model() {
      return { provider: 'worker', name: state.modelName ?? 'unknown' };
    },
    async nextTokens(prefix, k) {
      for (let attempt = 1; ; attempt++) {
        const res = await fetch(`${baseUrl}/api/next-tokens`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prefix, k: WORKER_K_MAX }),
          signal: AbortSignal.timeout(30_000),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(body.tokens)) {
          if (state.modelName && body.model !== state.modelName) throw new Error(`model changed mid-recording: ${state.modelName} -> ${body.model}`);
          state.modelName = body.model;
          return finalizeChoices(body.tokens, k);
        }
        const code = body?.error?.code ?? `http_${res.status}`;
        if (res.status === 429 && attempt <= 3) {
          const wait = Math.min(60, Number(res.headers.get('retry-after')) || 5);
          log(`  rate limited, waiting ${wait}s`);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        throw new Error(`Worker error ${code}: ${body?.error?.message ?? res.statusText}`);
      }
    },
    async dispose() {},
  };
}

/** Recording policy: every node to fullDepth, then the spinePaths most probable paths to spineDepth. */
export async function recordGarden(provider, { prompt, k, fullDepth, spineDepth, spinePaths }) {
  const nodes = new Map();
  const cum = new Map([['', 0]]); // cumulative logprob of each key
  const expand = async (key) => {
    if (!nodes.has(key)) {
      const list = await provider.nextTokens(prompt + key, k);
      if (list.length === 0) throw new Error(`no usable tokens after ${JSON.stringify(prompt + key)}`);
      nodes.set(key, list);
      for (const c of list) if (!cum.has(key + c.token)) cum.set(key + c.token, cum.get(key) + c.logprob);
    }
    return nodes.get(key);
  };
  let frontier = [''];
  for (let depth = 0; depth <= fullDepth; depth++) {
    const next = [];
    for (const key of frontier) for (const c of await expand(key)) next.push(key + c.token);
    frontier = depth < fullDepth ? next : next.filter((key) => !nodes.has(key));
  }
  // frontier now holds the (unexpanded) children of the deepest full level, at depth fullDepth + 1.
  const spines = frontier
    .map((key) => ({ key, lp: cum.get(key) }))
    .sort((a, b) => b.lp - a.lp || (a.key < b.key ? -1 : 1))
    .slice(0, spineDepth > fullDepth ? spinePaths : 0);
  for (const spine of spines) {
    let key = spine.key;
    for (let depth = fullDepth + 1; depth <= spineDepth; depth++) {
      const list = await expand(key);
      key += list[0].token;
    }
  }
  return orderNodes(nodes);
}

/** Pre-order walk from the root in rank order, so the file reads like an outline and key order is stable. */
function orderNodes(nodes) {
  const ordered = [];
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key) || !nodes.has(key)) return;
    seen.add(key);
    ordered.push([key, nodes.get(key)]);
    for (const c of nodes.get(key)) visit(key + c.token);
  };
  visit('');
  return ordered;
}

/** Deterministic JSON in the committed style: one choice per line, fixed key order. */
export function serialize(garden) {
  const s = JSON.stringify;
  const model = Object.entries(garden.model).map(([key, v]) => `    ${s(key)}: ${s(v)}`);
  const nodes = garden.nodes.map(
    ([key, list]) => `    ${s(key)}: [\n${list.map((c) => `      { "token": ${s(c.token)}, "logprob": ${s(c.logprob)} }`).join(',\n')}\n    ]`,
  );
  return [
    '{',
    `  "schemaVersion": 1,`,
    `  "id": ${s(garden.id)},`,
    `  "title": ${s(garden.title)},`,
    `  "prompt": ${s(garden.prompt)},`,
    `  "model": {\n${model.join(',\n')}\n  },`,
    `  "recordedAt": ${s(garden.recordedAt)},`,
    `  "k": ${garden.k},`,
    `  "nodes": {\n${nodes.join(',\n')}\n  }`,
    '}',
    '',
  ].join('\n');
}

/** Structural self-check before writing (PLAN D9); src/samples/validate.ts in the app is the authoritative gate. */
export function checkGarden(garden, text, { fullDepth, spineDepth, spinePaths }) {
  const problems = [];
  const nodes = new Map(garden.nodes);
  if (garden.schemaVersion !== 1) problems.push('schemaVersion must be 1');
  if (!garden.prompt || garden.prompt.length > 280) problems.push('prompt must be 1-280 chars');
  if (!nodes.has('')) problems.push('missing root node ""');
  for (const [key, list] of nodes) {
    const where = `node ${JSON.stringify(key)}`;
    if (!Array.isArray(list) || list.length < 1 || list.length > garden.k) problems.push(`${where}: needs 1-${garden.k} choices`);
    if (new Set(list.map((c) => c.token)).size !== list.length) problems.push(`${where}: duplicate tokens`);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (typeof c.token !== 'string' || !c.token || c.token.includes('�')) problems.push(`${where}: bad token ${JSON.stringify(c.token)}`);
      if (!Number.isFinite(c.logprob) || c.logprob > 0) problems.push(`${where}: bad logprob ${c.logprob}`);
      if (i > 0 && byLogprobThenToken(list[i - 1], c) > 0) problems.push(`${where}: not sorted`);
    }
    if (list.reduce((sum, c) => sum + Math.exp(c.logprob), 0) > 1 + 1e-3) problems.push(`${where}: probabilities sum above 1`);
  }
  // Every node above fullDepth has all its children expanded.
  const walk = (key, depth) => {
    if (depth >= fullDepth) return;
    for (const c of nodes.get(key) ?? []) {
      if (!nodes.has(key + c.token)) problems.push(`node ${JSON.stringify(key + c.token)} (depth ${depth + 1}) not expanded`);
      else walk(key + c.token, depth + 1);
    }
  };
  if (nodes.has('')) walk('', 0);
  // Count expanded keys at spineDepth, reached through expanded ancestors only.
  if (spineDepth > fullDepth && spinePaths > 0) {
    let level = [''];
    for (let d = 0; d < spineDepth; d++) level = level.flatMap((key) => (nodes.get(key) ?? []).map((c) => key + c.token).filter((ch) => nodes.has(ch)));
    if (new Set(level).size < spinePaths) problems.push(`only ${level.length} expanded node(s) at depth ${spineDepth}, wanted ${spinePaths}`);
  }
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) problems.push(`file is ${bytes} bytes > ${MAX_BYTES}`);
  return problems;
}

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

/** Peak resident memory of this process in MB (Linux VmHWM; falls back to current RSS). */
function peakRssMb() {
  try {
    const m = /VmHWM:\s+(\d+) kB/.exec(readFileSync('/proc/self/status', 'utf8'));
    if (m) return Math.round(Number(m[1]) / 1024);
  } catch {
    // not Linux
  }
  return Math.round(process.memoryUsage().rss / 1048576);
}

async function main() {
  const opts = parseOptions(process.argv.slice(2));
  if (opts.help) {
    log(USAGE);
    return;
  }
  const t0 = performance.now();
  log(`provider ${opts.provider}${opts.provider === 'worker' ? ` (${opts.url})` : ` (${MODEL} ${DTYPE}, cache ${opts.cacheDir})`}`);
  const provider = opts.provider === 'worker' ? workerProvider(opts.url) : await localOnnxProvider(opts.cacheDir);
  log(`ready in ${((performance.now() - t0) / 1000).toFixed(1)}s, peak RSS ${peakRssMb()} MB`);
  mkdirSync(opts.out, { recursive: true });
  let failed = false;
  try {
    for (const g of opts.gardens) {
      const t1 = performance.now();
      let calls = 0;
      const counting = {
        nextTokens: (prefix, k) => {
          calls++;
          return provider.nextTokens(prefix, k);
        },
      };
      const nodes = await recordGarden(counting, { prompt: g.prompt, ...opts });
      const garden = { schemaVersion: 1, id: g.id, title: g.title, prompt: g.prompt, model: provider.model, recordedAt: opts.date, k: opts.k, nodes };
      const text = serialize(garden);
      const parsed = JSON.parse(text); // check what will actually be read back, not the in-memory copy
      const problems = checkGarden({ ...parsed, nodes: Object.entries(parsed.nodes) }, text, opts);
      const secs = ((performance.now() - t1) / 1000).toFixed(1);
      if (problems.length) {
        failed = true;
        log(`x ${g.id}: not written\n  - ${problems.join('\n  - ')}`);
        continue;
      }
      const file = join(opts.out, `${g.id}.json`);
      writeFileSync(file, text);
      log(`ok ${g.id}: ${nodes.length} nodes, ${calls} calls, ${Buffer.byteLength(text)} bytes, ${secs}s, peak RSS ${peakRssMb()} MB -> ${file}`);
      log(`   root: ${nodes[0][1].map((c) => `${JSON.stringify(c.token)} ${(Math.exp(c.logprob) * 100).toFixed(1)}%`).join(', ')}`);
    }
  } finally {
    await provider.dispose();
  }
  log(`done in ${((performance.now() - t0) / 1000).toFixed(1)}s, peak RSS ${peakRssMb()} MB`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    log(`error: ${err.message}`);
    process.exitCode = 1;
  });
}
