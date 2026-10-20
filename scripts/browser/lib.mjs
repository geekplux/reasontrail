// Helpers for scripts/check-browser.mjs: argument parsing, the detached preview server and its cleanup.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
export const viteBin = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');

/** Parses `[--flows a,b|all] [--out <dir>] [--no-build] [--fail-after-launch]`. */
export function parseArgs(argv) {
  const opts = { flows: 'all', out: '.tmp/screenshots', build: true, failAfterLaunch: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === '--flows') opts.flows = value();
    else if (arg === '--out') opts.out = value();
    else if (arg === '--no-build') opts.build = false;
    else if (arg === '--fail-after-launch') opts.failAfterLaunch = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/** Starts `vite preview` detached in its own process group; returns the child (pid = pgid) and its output buffer. */
export function startPreview(port) {
  const args = [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  const keep = (chunk) => output.push(String(chunk));
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  return { child, output };
}

/** Polls `url` until it answers 200, the child exits, or `timeoutMs` passes. */
export async function waitForHttp(url, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`preview server exited early (code ${child.exitCode})`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not answer 200 at ${url} within ${timeoutMs} ms`);
}

function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

/** SIGTERM the process group, then SIGKILL after `graceMs` if anything is still alive. */
export async function killGroup(pgid, graceMs = 3_000) {
  if (!groupAlive(pgid)) return;
  try {
    process.kill(-pgid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && groupAlive(pgid)) await new Promise((r) => setTimeout(r, 100));
  if (groupAlive(pgid)) {
    try {
      process.kill(-pgid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

/** Synchronous last-resort kill for process 'exit' handlers. */
export function killGroupSync(pgid) {
  try {
    process.kill(-pgid, 'SIGKILL');
  } catch {
    // already gone
  }
}

/** Collects console errors, page errors, failed and non-same-origin requests on a browser context. */
export function watchContext(context, origin, problems) {
  context.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (new URL(url).origin !== origin) problems.push(`non-same-origin request: ${url}`);
  });
  context.on('requestfailed', (req) => problems.push(`request failed: ${req.url()} (${req.failure()?.errorText})`));
  context.on('response', (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  context.on('page', (page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  });
}

/** A committed sample garden (src/samples/<id>.json), so flows derive tokens and numbers instead of hard-coding them. */
export function loadSample(id) {
  return JSON.parse(readFileSync(new URL(`../../src/samples/${id}.json`, import.meta.url), 'utf8'));
}
