#!/usr/bin/env node
// Headless-browser check: build, start `vite preview` in its own process group, run flows in ONE system
// Chrome, fail on console errors / non-same-origin requests / axe serious+critical, and ALWAYS clean up.
// Usage: pnpm check:browser [--flows a,b|all] [--out <dir>] [--no-build] [--fail-after-launch] [--file <path>] [--before] [--headers]
// --file opens one local HTML file (e.g. a CLI map) instead: no build, no server; flow "file" checks it.
// --before tells the polish flow to write <out>/before/ instead of <out>/after/.
// --headers serves dist/ with scripts/serve-dist.mjs, which applies public/_headers (the CSP) like Cloudflare does.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { killGroup, killGroupSync, parseArgs, startPreview, viteBin, waitForHttp, watchContext } from './browser/lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flowsDir = join(root, 'scripts', 'browser', 'flows');
const BRAND_FLOWS = new Set(['hero', 'gallery', 'brand', 'polish', 'wordmark']); // write to committed paths; never part of "all"

const opts = parseArgs(process.argv.slice(2));
const port = Number(process.env.TG_PORT ?? 4317);
const baseURL = `http://127.0.0.1:${port}`;
const outDir = resolve(root, opts.out);
const available = readdirSync(flowsDir).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
const fileURL = opts.file ? pathToFileURL(resolve(opts.file)).href : undefined;
if (opts.file && !existsSync(resolve(opts.file))) throw new Error(`--file: no such file: ${opts.file}`);
const flows = opts.file ? ['file'] : opts.flows === 'all' ? available.filter((f) => !BRAND_FLOWS.has(f) && f !== 'file') : opts.flows.split(',');
for (const f of flows) if (!available.includes(f)) throw new Error(`unknown flow: ${f} (have: ${available.join(', ')})`);
if (flows.includes('file') && !opts.file) throw new Error('flow "file" needs --file <path>');

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
  if (opts.build && !opts.file) {
    const build = spawnSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: 'inherit' });
    if (build.status !== 0) throw new Error(`build failed (exit ${build.status})`);
    if (flows.includes('cli') || flows.includes('polish')) {
      const cli = spawnSync('pnpm', ['run', 'build:cli'], { cwd: root, stdio: 'inherit' });
      if (cli.status !== 0) throw new Error(`build:cli failed (exit ${cli.status})`);
    }
  }
  mkdirSync(outDir, { recursive: true });
  if (!opts.file) {
    server = startPreview(port, opts.headers);
    console.log(`${opts.headers ? 'serve-dist' : 'preview'}: pid/pgid ${server.child.pid} on ${baseURL}`);
    await waitForHttp(`${baseURL}/`, server.child).catch((err) => {
      console.error(server.output.join(''));
      throw err;
    });
  }

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
    // `target` is the page by default, or any Playwright locator/page (e.g. an element, or a page in another context).
    const shot = async (file, target = page) => {
      const path = join(outDir, `${file}.png`);
      await target.screenshot({ path });
      log(`screenshot ${path}`);
    };
    try {
      const flow = await import(pathToFileURL(join(flowsDir, `${name}.mjs`)).href);
      await flow.run({ page, context, baseURL, fileURL, root, outDir, before: opts.before, shot, log, fail });
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
