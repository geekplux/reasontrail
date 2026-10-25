// The reasontrail CLI (PLAN C1–C5, D26, D37): find a session, parse it locally, write one self-contained HTML file.
// No server, zero runtime dependencies, and no network unless the user passes --ai and confirms (X5).
import { closeSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ProviderError } from '../../shared/llm/types';
import { normalizeSession } from '../../shared/session/adapter';
import { buildGraph } from '../../shared/session/build/graph';
import { attachRaw } from '../../shared/session/raw';
import { redactGraph, redactSession, redactText } from '../../shared/session/redact';
import { buildBatches } from '../../shared/session/structure';
import { sendBatches, structureMessage, summarize } from '../../shared/structureClient';
import { trimSession } from '../../shared/session/trim';
import type { SessionGraph } from '../../shared/session/types';
import type { ViewerPayload } from '../../src/map/loadGraph';
import { parseArgs } from './args';
import { renderHtmlParts } from './html';
import { installSkill } from './installSkill';
import { listSessions, locate, readSession, type LocateContext } from './locate/index';
import { DEFAULT_AI_ENDPOINT, EXIT, HELP, PKG_NAME, VERSION } from './meta';
import { openFile } from './open';

export interface RunContext extends LocateContext {
  out: (line: string) => void;
  err: (line: string) => void;
  /** Path of the viewer template (cli/dist/viewer.html next to the built CLI). */
  template: string;
  open?: (file: string) => boolean;
  /** Path of the running CLI (for install-skill); defaults to cli.mjs next to the template. */
  cli?: string;
  /** `--ai`: the HTTP client (tests pass a fake or point --api at a local server). */
  fetch?: typeof fetch;
  /** `--ai`: whether a person can answer the confirmation; without one, --ai needs --yes. */
  isTTY?: boolean;
  /** `--ai`: asks a yes/no question on the terminal. */
  confirm?: (question: string) => Promise<boolean>;
}

const safe = (id: string) => id.replace(/[^\w.-]/g, '-').slice(0, 80) || 'session';
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pad = (n: number) => String(n).padStart(2, '0');
/** A `--list` start time: local `YYYY-MM-DD HH:MM` for every source, or "-" when unknown. */
export function listTime(at: string | undefined): string {
  const d = at ? new Date(at) : undefined;
  if (!d || Number.isNaN(d.getTime())) return '-'.padEnd(16);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Exit code; a promise only with --ai, which waits for the confirmation and the endpoint. */
export function run(argv: readonly string[], ctx: RunContext): number | Promise<number> {
  if (argv[0] === 'install-skill') return installSkill(argv.slice(1), { ...ctx, cli: ctx.cli ?? join(dirname(ctx.template), 'cli.mjs') });
  const opts = parseArgs(argv);
  if ('error' in opts) {
    ctx.err(`${PKG_NAME}: ${opts.error}\nRun "${PKG_NAME} --help" for usage.`);
    return EXIT.usage;
  }
  if (opts.mode === 'help') return ctx.out(HELP), EXIT.ok;
  if (opts.mode === 'version') return ctx.out(VERSION), EXIT.ok;

  if (opts.mode === 'list') {
    const list = listSessions(opts, ctx);
    if (list.length === 0) return ctx.err(`${PKG_NAME}: no sessions found for ${ctx.cwd}`), EXIT.notFound;
    const w = Math.max(...list.map((s) => s.id.length));
    for (const s of list) ctx.out(`${s.id.padEnd(w)}  ${s.source.padEnd(11)}  ${listTime(s.startedAt)}  ${kb(s.size)}  ${s.title.slice(0, 72)}`);
    return EXIT.ok;
  }

  const found = locate(opts, ctx);
  if ('error' in found) return ctx.err(`${PKG_NAME}: ${found.error}`), EXIT.notFound;
  const { ref, how } = found;
  ctx.err(`Session: ${ref.file} (${how})`);

  let session;
  let files;
  try {
    files = readSession(ref).files;
    session = normalizeSession({ files });
  } catch (e) {
    return ctx.err(`${PKG_NAME}: could not read ${ref.file}: ${e instanceof Error ? e.message : String(e)}`), EXIT.unreadable;
  }
  if (!session) return ctx.err(`${PKG_NAME}: this doesn't look like a Claude Code, Grok Build or Codex session.`), EXIT.unreadable;
  if (opts.trim) session = trimSession(session, opts.trim);

  // Files are re-read here (see readSession); one that vanished since only costs its raw records.
  const withRaw = (graph: SessionGraph, o?: Parameters<typeof attachRaw>[2]) => {
    try {
      return attachRaw(graph, files, o);
    } catch {
      return graph;
    }
  };
  let payload: ViewerPayload;
  if (!opts.share) payload = { graph: withRaw(buildGraph(session)), meta: { version: VERSION } };
  else {
    // Redact before building (clipped titles never hold a cut-off secret), then the graph (drops, derived fields),
    // then attach raw records: each is cut to its cap first and only the kept part is redacted (once).
    const r: Record<string, number> = {};
    const red = redactGraph(buildGraph(redactSession(session, r)));
    const graph = withRaw(red.graph, { redact: (t) => redactText(t) }); // the same text the counts already saw
    for (const [k, v] of Object.entries(red.summary.replaced)) r[k] = (r[k] ?? 0) + v;
    const n = (pred: (k: string) => boolean) => Object.entries(r).reduce((sum, [k, v]) => sum + (pred(k) ? v : 0), 0);
    const total = n(() => true);
    payload = { graph, meta: { version: VERSION, shared: { replaced: total } } };
    ctx.err(`Redacted: ${n((k) => k.startsWith('secret:'))} secrets, ${n((k) => k === 'email')} emails, ${n((k) => k === 'home-path')} paths; ${red.summary.dropped} non-conversation records dropped.`);
  }

  if (opts.json) return ctx.out(JSON.stringify(payload.graph)), EXIT.ok;
  const write = (p: ViewerPayload, sent = false) => writeMap(p, sent, opts, ctx, ref);
  if (!opts.ai) return write(payload);
  // The batches come from a graph built on redacted text, so no secret is clipped before redaction (buildBatches).
  const aiGraph = opts.share ? payload.graph : buildGraph(redactSession(session));
  return addLabels(payload, aiGraph, opts, ctx).then((r) => (typeof r === 'number' ? r : write(r.payload, r.sent)));
}

/** Prints what --ai will send, asks (unless --yes), sends, and returns the payload with the overlay if it worked. */
async function addLabels(
  payload: ViewerPayload,
  graph: SessionGraph,
  opts: { api?: string; yes: boolean },
  ctx: RunContext,
): Promise<number | { payload: ViewerPayload; sent: boolean }> {
  const endpoint = opts.api ?? DEFAULT_AI_ENDPOINT;
  const batches = buildBatches(graph);
  const s = summarize(batches, endpoint);
  if (s.batches === 0) return ctx.err('AI titles: this session has no step text to send; the map is written without AI titles.'), { payload, sent: false };
  ctx.err(`AI titles (--ai) will send ${s.steps} step summaries in ${s.batches} request${s.batches === 1 ? '' : 's'} (${s.characters} characters) to ${endpoint}.`);
  ctx.err('Only redacted text is sent: secrets, emails and home paths are replaced, and each step becomes one line of at most 300 characters.');
  ctx.err(s.caching);
  ctx.err('AI titles are a model\'s suggestions, shown as an overlay on the map that you can switch off.');
  if (!opts.yes) {
    if (!ctx.isTTY) return ctx.err(`${PKG_NAME}: --ai sends data, so it asks first; run it in a terminal or add --yes.`), EXIT.usage;
    if (!(await (ctx.confirm ?? askTerminal)('Send them? [y/N] '))) return ctx.err('Nothing was sent; the map is written without AI titles.'), { payload, sent: false };
  }
  try {
    const overlay = await sendBatches(endpoint, batches, {
      ...(ctx.fetch ? { fetch: ctx.fetch } : {}),
      onProgress: (k, n) => n > 1 && ctx.err(`Sending batch ${k} of ${n}…`),
    });
    ctx.err(`AI titles: ${plural(overlay.labels.length, 'step title')} and ${plural(overlay.links.length, 'claim link')}, suggested by ${overlay.model}.`);
    return { payload: { ...payload, labels: overlay }, sent: true };
  } catch (e) {
    const err = e instanceof ProviderError ? e : new ProviderError('upstream_error', String(e));
    const why = err.code === 'unavailable' ? `${endpoint} could not be reached or has no AI titles; the map still works.` : structureMessage(err.code, err.retryAfterSec);
    ctx.err(`No AI titles: ${why} The map is written without them.`);
    return { payload, sent: true };
  }
}

async function askTerminal(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

function writeMap(payload: ViewerPayload, sent: boolean, opts: { out?: string; share: boolean; open: boolean }, ctx: RunContext, ref: { id: string; source: string }): number {
  let template: string;
  try {
    template = readFileSync(ctx.template, 'utf8');
  } catch {
    return ctx.err(`${PKG_NAME}: the viewer template is missing (${ctx.template}); run pnpm build:cli`), EXIT.unreadable;
  }
  const id = safe(payload.graph.source.sessionId || ref.id);
  const file = opts.out
    ? isAbsolute(opts.out) ? opts.out : resolve(ctx.cwd, opts.out)
    : opts.share ? join(ctx.cwd, `${PKG_NAME}-${id.slice(0, 8)}.html`) : join(tmpdir(), PKG_NAME, `${ref.source}-${id}.html`);
  const parts = renderHtmlParts(template, payload);
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, 'w');
  try {
    for (const part of parts) writeFileSync(fd, part); // at the fd's position, looping until all is written
  } finally {
    closeSync(fd);
  }
  ctx.out(file);
  ctx.err(`Map: ${kb(parts.reduce((n, p) => n + Buffer.byteLength(p), 0))}, ${payload.graph.steps.length} steps. Generated on your machine; ${sent ? 'only the redacted step summaries above were sent' : 'nothing was uploaded'}.`);
  if (opts.open && (ctx.open ?? openFile)(file)) ctx.err('Opened in your browser.');
  else ctx.err(`Open it in a browser: ${pathToFileURL(file).href}`);
  return EXIT.ok;
}

function isEntry(): boolean {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1] as string) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntry()) {
  const code = run(process.argv.slice(2), {
    home: homedir(),
    cwd: process.cwd(),
    env: process.env,
    out: (l) => process.stdout.write(`${l}\n`),
    err: (l) => process.stderr.write(`${l}\n`),
    template: join(dirname(fileURLToPath(import.meta.url)), 'viewer.html'),
    cli: fileURLToPath(import.meta.url),
    isTTY: Boolean(process.stdin.isTTY),
  });
  if (typeof code === 'number') process.exitCode = code;
  else void code.then((c) => (process.exitCode = c));
}
