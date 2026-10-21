#!/usr/bin/env node
// Scripted evals for the reasontrail skill (`pnpm skill:evals`): runs kit/run.mjs once per case in cases.json, each in
// a fresh sandbox (HOME, TMPDIR and project folder under the system temp folder), with fixture sessions, --no-open,
// a clean environment (the real CLAUDE_CODE_SESSION_ID never leaks in) and the network blocked.
// Usage: node run-evals.mjs [--keep] [case-id ...]   (--keep leaves the sandboxes and prints where they are)
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SKILL = resolve(HERE, '..');
const REPO = resolve(SKILL, '../..');
const FIXTURES = join(REPO, 'fixtures/sessions/claude-code');
export const CLI = process.env.REASONTRAIL_CLI || join(REPO, 'cli/dist/cli.mjs');
export const CASES = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8')).cases;

/** Run one case. Returns { problems, root } and removes the sandbox unless `keep`. */
export function runCase(c, { keep = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'reasontrail-eval-')));
  const home = join(root, 'home');
  const cwd = join(root, 'work', c.folder ?? 'notes-app');
  const tmp = join(root, c.tmp ?? 'tmp');
  const store = join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
  for (const d of [store, cwd, tmp]) mkdirSync(d, { recursive: true });
  for (const s of c.sessions ?? []) {
    const file = join(store, `${s.id}.jsonl`);
    copyFileSync(join(FIXTURES, `${s.fixture}.jsonl`), file);
    if (existsSync(join(FIXTURES, s.fixture))) cpSync(join(FIXTURES, s.fixture), join(store, s.id), { recursive: true });
    utimesSync(file, s.mtime, s.mtime);
  }
  for (const w of c.write ?? []) writeFileSync(join(store, `${w.id}.jsonl`), w.text);

  const env = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    TMPDIR: tmp,
    REASONTRAIL_CLI: CLI,
    NODE_OPTIONS: `--import=${pathToFileURL(join(HERE, 'no-network.mjs')).href}`,
    ...c.env,
  };
  const res = spawnSync(process.execPath, [join(SKILL, 'kit/run.mjs'), '--no-open', ...(c.args ?? [])], { cwd, env, encoding: 'utf8', timeout: 30_000 });
  const problems = [];
  const e = c.expect;
  const lines = res.stdout ? res.stdout.split('\n').filter(Boolean) : [];
  if (res.error) problems.push(`spawn failed: ${res.error.message}`);
  if (res.status !== e.exit) problems.push(`exit ${res.status}, expected ${e.exit}`);
  if (res.stderr.includes('NETWORK BLOCKED')) problems.push('attempted a network request');
  for (const s of e.stderr ?? []) if (!res.stderr.includes(s)) problems.push(`stderr lacks "${s}"`);
  if (e.session && !res.stderr.includes(`${e.session}.jsonl (`)) problems.push(`did not map session ${e.session}`);
  if (e.exit !== 0) {
    if (lines.length) problems.push(`stdout should be empty, got: ${lines.join(' | ')}`);
  } else if (lines.length !== 1 || !/^MAP: \S/.test(lines[0])) {
    problems.push(`stdout must be exactly one "MAP: <path>" line, got: ${JSON.stringify(res.stdout)}`);
  } else {
    const map = lines[0].slice('MAP: '.length);
    const dir = e.mapIn === 'cwd' ? cwd : join(tmp, 'reasontrail');
    if (dirname(map) !== dir) problems.push(`map written to ${map}, expected it in ${dir}`);
    const html = existsSync(map) ? readFileSync(map, 'utf8') : undefined;
    if (!html) problems.push(`map file missing: ${map}`);
    else for (const s of e.html ?? []) if (!html.includes(s)) problems.push(`map lacks "${s}"`);
  }
  if (problems.length) problems.push(`stderr was: ${res.stderr.trim().replaceAll('\n', ' | ')}`);
  if (!keep) rmSync(root, { recursive: true, force: true });
  return { problems, root };
}

/** Processes whose command line mentions a sandbox: there must be none once the runs are over. */
export function leftovers(prefix = join(tmpdir(), 'reasontrail-eval-')) {
  const ps = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  if (ps.status !== 0) return [];
  return ps.stdout.split('\n').filter((l) => l.includes(prefix) && !l.includes('ps -eo'));
}

function main(argv) {
  if (!existsSync(CLI)) {
    console.error(`skill:evals: the CLI is not built (${CLI}). Run pnpm build:cli first.`);
    return 1;
  }
  const keep = argv.includes('--keep');
  const only = argv.filter((a) => !a.startsWith('--'));
  let failed = 0;
  for (const c of CASES.filter((x) => only.length === 0 || only.includes(x.id))) {
    const { problems, root } = runCase(c, { keep });
    failed += problems.length ? 1 : 0;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${c.id}: ${c.about}${keep ? `  (${root})` : ''}`);
    for (const p of problems) console.log(`     - ${p}`);
  }
  const left = leftovers();
  if (left.length) console.log(`FAIL processes left running:\n${left.join('\n')}`);
  console.log(failed || left.length ? `skill:evals: ${failed} case(s) failed` : 'skill:evals: all cases passed, no network, no process left');
  return failed || left.length ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
