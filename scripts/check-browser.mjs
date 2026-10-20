#!/usr/bin/env node
// Headless-browser check: build, start `vite preview` in its own process group, run flows in ONE system
// Chrome, fail on console errors / non-same-origin requests / axe serious+critical, and ALWAYS clean up.
// Usage: pnpm check:browser [--flows a,b|all] [--out <dir>] [--no-build] [--fail-after-launch]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { killGroup, killGroupSync, parseArgs, startPreview, viteBin, waitForHttp, watchContext } from './browser/lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flowsDir = join(root, 'scripts', 'browser', 'flows');
const BRAND_FLOWS = new Set(['hero', 'gallery', 'brand']); // write to committed paths; never part of "all"

const opts = parseArgs(process.argv.slice(2));
const port = Number(process.env.TG_PORT ?? 4317);
const baseURL = `http://127.0.0.1:${port}`;
const outDir = resolve(root, opts.out);
const available = readdirSync(flowsDir).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
const flows = opts.flows === 'all' ? available.filter((f) => !BRAND_FLOWS.has(f)) : opts.flows.split(',');
for (const f of flows) if (!available.includes(f)) throw new Error(`unknown flow: ${f} (have: ${available.join(', ')})`);

let server;
let browser;
let cleaned;
const problems = [];

function cleanup() {
  cleaned ??= (async () => {
    if (browser) await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 5_000))]);
    if (server) await killGroup(server.child.pid);
    console.log(`cleanup: browser closed, server pgid ${server?.child.pid ?? 'none'} terminated`);
  })();
  return cleaned;
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => cleanup().finally(() => process.exit(code)));
}
process.on('exit', () => server && killGroupSync(server.child.pid));

try {
  if (opts.build) {
    const build = spawnSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: 'inherit' });
    if (build.status !== 0) throw new Error(`build failed (exit ${build.status})`);
  }
  mkdirSync(outDir, { recursive: true });
  server = startPreview(port);
  console.log(`preview: pid/pgid ${server.child.pid} on ${baseURL}`);
  await waitForHttp(`${baseURL}/`, server.child).catch((err) => {
    console.error(server.output.join(''));
    throw err;
  });

  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    handleSIGINT: false, // our handlers close the browser AND the preview server
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  if (opts.failAfterLaunch) throw new Error('--fail-after-launch: simulated failure after browser launch');

  for (const name of flows) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    watchContext(context, baseURL, problems);
    const page = await context.newPage();
    const log = (msg) => console.log(`[${name}] ${msg}`);
    const fail = (msg) => problems.push(`[${name}] ${msg}`);
    const shot = async (file) => {
      const path = join(outDir, `${file}.png`);
      await page.screenshot({ path });
      log(`screenshot ${path}`);
    };
    try {
      const flow = await import(pathToFileURL(join(flowsDir, `${name}.mjs`)).href);
      await flow.run({ page, context, baseURL, shot, log, fail });
      log('done');
    } catch (err) {
      fail(`threw: ${err instanceof Error ? err.stack : err}`);
    } finally {
      await context.close();
    }
  }
} catch (err) {
  problems.push(`harness: ${err instanceof Error ? err.message : err}`);
} finally {
  await cleanup();
}

if (problems.length > 0) {
  console.error(`check:browser FAILED (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log(`check:browser passed: ${flows.join(', ')}`);
}
