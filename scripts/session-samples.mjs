#!/usr/bin/env node
// pnpm samples:sessions (PLAN phase 15, D28): turn the sessions listed in tools/session-samples.json into committed,
// redacted, trimmed sample graphs under src/sessions/samples/<id>.graph.json, each with its `expect` block (M2).
// Runs the built CLI (`cli.mjs <file> --share --json --trim <from>:<to>`). When a session file is not on this
// machine the entry is skipped with a message and the committed JSON stays authoritative.
// Two extra, deterministic scrubs on top of the CLI's redaction: an entry's `hide` map replaces the text of the
// listed steps (ids after trimming) with a short note, and every term of the local, gitignored `.redact-denylist`
// (the same file `pnpm audit:samples` checks) is replaced with "[private]" in every string of the graph.
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

/** Replace the text (and shell command) of the steps in `hide` ({ stepId: why }) with a short note. Throws on an unknown id. */
export function hideSteps(graph, hide = {}) {
  for (const [id, why] of Object.entries(hide)) {
    const step = graph.steps.find((s) => s.id === id);
    if (!step) throw new Error(`hide: no step ${id}`);
    step.text = `[Left out of this sample: ${why}.]`;
    if (step.tool?.command) step.tool.command = step.text;
  }
  return graph;
}

/** Where an entry's transcript lives under `home`: the main session file, or one subagent's file. */
export function sessionFile(entry, home) {
  const dir = join(home, '.claude', 'projects', entry.project);
  return entry.agent ? join(dir, entry.session, 'subagents', `agent-${entry.agent}.jsonl`) : join(dir, `${entry.session}.jsonl`);
}

/** Problems with one sample's JSON text against the phase 15 limits (empty when fine). */
export function checkSample(text) {
  const g = JSON.parse(text);
  const problems = [];
  if (Buffer.byteLength(text) > LIMITS.bytes) problems.push(`${Math.round(Buffer.byteLength(text) / 1024)} KB > 250 KB`);
  if (g.steps.length > LIMITS.steps) problems.push(`${g.steps.length} steps > ${LIMITS.steps}`);
  if (g.trouble.length < 1) problems.push('no trouble marker');
  return problems;
}

function main() {
  const { samples } = JSON.parse(readFileSync(join(ROOT, 'tools/session-samples.json'), 'utf8'));
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
    const graph = scrub(hideSteps(JSON.parse(json), entry.hide), terms);
    graph.expect = expectFor(graph);
    const text = `${JSON.stringify(graph)}\n`;
    const problems = checkSample(text);
    writeFileSync(out, text);
    const kinds = [...new Set(graph.trouble.map((t) => t.kind))].join(', ');
    console.log(`${entry.id}: ${graph.steps.length} steps, ${Math.round(Buffer.byteLength(text) / 1024)} KB, ${graph.lanes.length} lanes, trouble ${graph.trouble.length} (${kinds})${problems.length ? `  PROBLEM: ${problems.join('; ')}` : ''}`);
    if (problems.length) failed++;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
