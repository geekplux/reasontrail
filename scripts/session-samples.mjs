#!/usr/bin/env node
// pnpm samples:sessions (PLAN phase 15, D28): turn the sessions listed in tools/session-samples.json into committed,
// redacted, trimmed sample graphs under src/sessions/samples/<id>.graph.json, each with its `expect` block (M2).
// Runs the built CLI (`cli.mjs <file> --share --json --trim <from>:<to>`). When a session file is not on this
// machine the entry is skipped with a message and the committed JSON stays authoritative.
// Two extra, deterministic scrubs on top of the CLI's redaction: an entry's `hide` map replaces the text of the
// listed steps (ids after trimming) with a short note, and every term of the local, gitignored `.redact-denylist`
// (the same file `pnpm audit:samples` checks) is replaced with "[private]" in every string of the graph. Last, the
// global `rewrite` rules of tools/session-samples.json (names, house-rule sentences) apply to every string.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CLI = join(ROOT, 'cli/dist/cli.mjs');
const OUT = join(ROOT, 'src/sessions/samples');
/** Limits from PLAN phase 15, AC1. */
export const LIMITS = { steps: 400, bytes: 250 * 1024 };
const TASK_WORDS = 8;
const TOP_FILES = 3;

/** The M2 glance answers for a graph: task first words, top changed files, trouble count, final status. */
export function expectFor(graph) {
  const check = graph.outcome.lastVerification;
  return {
    task: graph.title.split(/\s+/).slice(0, TASK_WORDS).join(' '),
    files: graph.outcome.files.slice(0, TOP_FILES).map((f) => f.path),
    trouble: graph.trouble.length,
    final: check ? (check.ok ? 'ok' : 'error') : 'unknown',
  };
}

/** Terms of a denylist file (one per line, `#` comments), longest first so overlapping terms are replaced whole. */
export function readDenylist(text) {
  return text.split('\n').map((t) => t.trim()).filter((t) => t && !t.startsWith('#')).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A copy of `value` with every denylist term (case-insensitive) replaced in string values; keys are kept. */
export function scrub(value, terms) {
  if (terms.length === 0) return value;
  const re = new RegExp(terms.map(escape).join('|'), 'gi');
  const walk = (v) => {
    if (typeof v === 'string') return v.replace(re, '[private]');
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

/**
 * A copy of `value` with the global `rewrite` rules applied to every string value: every sentence or line holding an
 * `omitSentencesWith` term (case-insensitive) becomes `omission`, then every name (word boundary, case-sensitive)
 * becomes its replacement, capitalised at the start of a sentence. Keys are kept.
 */
export function rewrite(value, rules = {}) {
  const names = Object.entries(rules.names ?? {});
  const omit = rules.omitSentencesWith ?? [];
  const sentence = omit.length ? new RegExp(`(?:[^\\s.!?][^\\n.!?]*?)?\\b(?:${omit.map(escape).join('|')})[^\\n.!?]*[.!?]?`, 'gi') : null;
  const fix = (s) => {
    let out = sentence ? s.replace(sentence, rules.omission ?? '[omitted]') : s;
    for (const [name, to] of names) {
      out = out.replace(new RegExp(`\\b${escape(name)}\\b`, 'g'), (_, at, all) => (at === 0 || /[.!?\n]\s*$/.test(all.slice(Math.max(0, at - 4), at)) ? to[0].toUpperCase() + to.slice(1) : to));
    }
    return out;
  };
  const walk = (v) => {
    if (typeof v === 'string') return fix(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

/** Replace the text (and shell command) of the steps in `hide` ({ stepId: why }) with a short note. Throws on an unknown id. */
export function hideSteps(graph, hide = {}) {
  for (const [id, why] of Object.entries(hide)) {
    const step = graph.steps.find((s) => s.id === id);
    if (!step) throw new Error(`hide: no step ${id}`);
    step.text = `[Left out of this sample: ${why}.]`;
    if (step.tool?.command) step.tool.command = step.text;
    // The raw record sits on the first step of the record: blank it wherever it holds this step.
    for (const s of graph.steps) if (s.rawText && s.raw.file === step.raw.file && s.raw.line === step.raw.line) s.rawText = step.text;
  }
  return graph;
}

/** Raw-record caps tried in turn (chars), largest first; 0 drops the raw records (the CLI keeps ≤ 1 KB each). */
const RAW_CAPS = [1024, 768, 512, 384, 256, 0];

/** The CLI's cut note (shared/session/raw.ts `cutNote`): its record text and how many characters it left out. */
const CUT = /…\n\[cut (\d+) characters; full record at [^\n]*\]$/;
const uncut = (t) => {
  const m = CUT.exec(t);
  return m ? { body: t.slice(0, m.index), total: m.index + Number(m[1]) } : { body: t, total: t.length };
};

/** Clip every `rawText` to the largest cap that keeps the sample within `bytes`, with the CLI's cut note (counting
 * from the full record). Deterministic; returns the cap. */
export function fitRaw(graph, bytes = LIMITS.bytes) {
  const full = graph.steps.map((s) => (s.rawText === undefined ? undefined : uncut(s.rawText)));
  for (const cap of RAW_CAPS) {
    graph.steps.forEach((s, i) => {
      const t = full[i];
      if (t === undefined) return;
      if (cap === 0) delete s.rawText;
      else if (t.total <= cap) s.rawText = t.body;
      else s.rawText = `${t.body.slice(0, cap)}…\n[cut ${t.total - cap} characters; full record at ${s.raw.file}:${s.raw.line}]`;
    });
    if (Buffer.byteLength(`${JSON.stringify(graph)}\n`) <= bytes) return cap;
  }
  return 0;
}

/** Where an entry's transcript lives under `home`: the main session file, or one subagent's file. */
export function sessionFile(entry, home) {
  const dir = join(home, '.claude', 'projects', entry.project);
  return entry.agent ? join(dir, entry.session, 'subagents', `agent-${entry.agent}.jsonl`) : join(dir, `${entry.session}.jsonl`);
}

/** A subagent lane whose report ends on FAIL or CHANGES REQUESTED: something going wrong a sample can show without a
 * detected pattern (scratch-file churn no longer counts, phase 16). */
export function failedLane(g) {
  const mainLane = g.lanes?.[0]?.id;
  return (g.lanes ?? []).some((l) => {
    if (l.id === mainLane) return false;
    const last = (g.steps ?? []).filter((s) => s.laneId === l.id && s.kind === 'assistant' && s.text).pop();
    const lines = (last?.text ?? '').split('\n');
    return /\b(FAIL|CHANGES REQUESTED)\b/.test(lines[0] ?? '') || lines.some((t) => /^\W*\w[\w -]{0,30}:\W*(FAIL|CHANGES REQUESTED)\b/.test(t));
  });
}

/** Problems with one sample's JSON text against the phase 15 limits (empty when fine). */
export function checkSample(text) {
  const g = JSON.parse(text);
  const problems = [];
  if (Buffer.byteLength(text) > LIMITS.bytes) problems.push(`${Math.round(Buffer.byteLength(text) / 1024)} KB > 250 KB`);
  if (g.steps.length > LIMITS.steps) problems.push(`${g.steps.length} steps > ${LIMITS.steps}`);
  if (g.trouble.length < 1 && !failedLane(g)) problems.push('no trouble marker or failed verdict');
  return problems;
}

function main() {
  const { samples, rewrite: rules } = JSON.parse(readFileSync(join(ROOT, 'tools/session-samples.json'), 'utf8'));
  if (!existsSync(CLI)) {
    console.error('samples:sessions: cli/dist/cli.mjs is missing; run pnpm build:cli first.');
    return 1;
  }
  const denyFile = join(ROOT, '.redact-denylist');
  const terms = existsSync(denyFile) ? readDenylist(readFileSync(denyFile, 'utf8')) : [];
  let failed = 0;
  for (const entry of samples) {
    const file = sessionFile(entry, homedir());
    const out = join(OUT, `${entry.id}.graph.json`);
    if (!existsSync(file)) {
      console.log(`${entry.id}: skipped, session ${entry.session.slice(0, 8)}${entry.agent ? `/${entry.agent}` : ''} is not on this machine (the committed ${relative(ROOT, out)} stays as is).`);
      continue;
    }
    const json = execFileSync(process.execPath, [CLI, file, '--share', '--json', '--trim', entry.steps], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const graph = rewrite(scrub(hideSteps(JSON.parse(json), entry.hide), terms), rules);
    graph.expect = expectFor(graph);
    const cap = fitRaw(graph);
    const text = `${JSON.stringify(graph)}\n`;
    const problems = checkSample(text);
    writeFileSync(out, text);
    const kinds = [...new Set(graph.trouble.map((t) => t.kind))].join(', ');
    console.log(`${entry.id}: ${graph.steps.length} steps, ${Math.round(Buffer.byteLength(text) / 1024)} KB, ${graph.lanes.length} lanes, trouble ${graph.trouble.length} (${kinds}), raw ≤ ${cap} chars${problems.length ? `  PROBLEM: ${problems.join('; ')}` : ''}`);
    if (problems.length) failed++;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
