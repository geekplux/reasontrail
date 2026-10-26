// Polish flow (v7 phase 35): the after set of every page at 1440×900 and 390×844 (viewport shots, the first screen),
// a full-page shot at 1440 for the long pages, and dark for the home, the Step state and the local viewer; light
// theme, reduced motion, WebP. Writes <out>/after/ (or <out>/before/ with --before). The pages with a canvas frame are
// also shot and paired by scripts/design/canvas.mjs (docs/screenshots/phase-35/README.md). Not part of `--flows all`.
// Usage: pnpm check:browser --flows polish --out docs/screenshots/phase-35
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { watchContext } from '../lib.mjs';

const treeReady = (page) => page.waitForSelector('.hero-tree svg.tree[role="img"]', { timeout: 15_000 });
const listReady = (page) => page.waitForSelector('.gl [role="treeitem"]', { timeout: 15_000 });
const opened = (page) => page.waitForSelector('[data-testid="opened"] .gl [role="treeitem"]', { timeout: 15_000 });
const gardenReady = (page) => page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 15_000 });

/** Views whose full page is shot at 1440 as well (the rest fit, or are one screen of controls). */
const FULL = new Set(['home', 'step', 'opened', 'chat-map', 'how', 'cli-viewer']);
/** Views shot in dark too. */
const DARK = ['home', 'step', 'cli-viewer'];

export async function run({ context, baseURL, root, outDir, before, log, fail }) {
  const dir = join(outDir, before ? 'before' : 'after');
  const tmp = join(root, '.tmp', 'polish');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'home'), { recursive: true });
  mkdirSync(dir, { recursive: true });

  // The local viewer: a file:// map of a fixture, written by the built CLI in a sandboxed HOME.
  const cli = join(root, 'cli', 'dist', 'cli.mjs');
  const cliOut = join(tmp, 'trouble.html');
  const fixture = join(root, 'fixtures', 'sessions', 'claude-code', 'trouble.jsonl');
  if (existsSync(cli)) {
    const r = spawnSync(process.execPath, [cli, fixture, '--no-open', '--out', cliOut], { env: { PATH: process.env.PATH, HOME: join(tmp, 'home'), TMPDIR: tmp }, encoding: 'utf8', timeout: 20_000 });
    if (r.status !== 0) fail(`cli: exit ${r.status}: ${r.stderr}`);
  } else fail('cli/dist/cli.mjs is missing: run pnpm build:cli');
  const chatText = readFileSync(join(root, 'fixtures', 'chats', 'pasted-chatgpt.txt'), 'utf8');

  // Each view puts `page` in its state.
  const views = [
    ['home', async (page) => { await page.goto(`${baseURL}/`); await treeReady(page); }],
    ['step', async (page) => { await page.goto(`${baseURL}/?session=verify-fail-fix&step=s41`); await page.locator('aside.detail[data-step="s41"]').waitFor({ timeout: 15_000 }); }],
    ['open', async (page) => { await page.goto(`${baseURL}/?view=open`); await page.locator('input[type="file"]').first().waitFor({ state: 'attached' }); }],
    ['opened', async (page) => {
      await page.goto(`${baseURL}/?view=open`);
      await page.setInputFiles('input[type="file"]', fixture);
      await opened(page);
    }],
    ['chat-import', async (page) => { await page.goto(`${baseURL}/?view=chat`); await page.locator('#chat-text').waitFor(); }],
    ['chat-map', async (page) => {
      await page.goto(`${baseURL}/?view=chat`);
      await page.locator('#chat-text').fill(chatText);
      await page.getByRole('button', { name: 'Map this conversation' }).click();
      await opened(page);
    }],
    ['how', async (page) => { await page.goto(`${baseURL}/?view=how`); await treeReady(page); }],
    ['install', async (page) => { await page.goto(`${baseURL}/?view=install`); await page.waitForSelector('.install'); }],
    ['garden', async (page) => { await page.goto(`${baseURL}/?sample=lighthouse`); await gardenReady(page); }],
    ['lens', async (page) => { await page.goto(`${baseURL}/?session=planner-pivot&step=s12&sample=lens-planner-pivot-1`); await gardenReady(page); }],
    ['share-dialog', async (page) => {
      await page.goto(`${baseURL}/`);
      await listReady(page);
      const button = page.getByRole('button', { name: 'Share', exact: true });
      // The phone keeps Share in the actions row after the final answer.
      await button.first().click();
      await page.getByRole('dialog', { name: 'Save a shareable copy' }).waitFor({ timeout: 10_000 });
    }],
    ['cli-viewer', async (page) => {
      if (!existsSync(cliOut)) throw new Error('no CLI output');
      await page.context().setOffline(true);
      await page.goto(pathToFileURL(cliOut).href, { waitUntil: 'load' });
      await listReady(page);
    }],
  ];

  const browser = context.browser();
  const shoot = async (page, name, fullPage = false) => {
    const path = join(dir, `${name}.webp`);
    writeFileSync(path, await page.screenshot({ type: 'webp', quality: 80, fullPage }));
    log(`screenshot ${path}`);
  };
  const settle = async (page, keepFocus) => {
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    if (!keepFocus) await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
    await page.waitForTimeout(300);
  };
  const missing = [];

  for (const [width, height, scheme, only] of [[1440, 900, 'light'], [390, 844, 'light'], [1440, 900, 'dark', DARK], [390, 844, 'dark', ['home']]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce' });
    const problems = [];
    watchContext(ctx, baseURL, problems);
    for (const [view, go] of views.filter(([v]) => !only || only.includes(v))) {
      const name = `${view}-${width}-${scheme}`;
      const page = await ctx.newPage();
      try {
        await go(page);
        await settle(page, view === 'share-dialog');
        await shoot(page, name);
        if (width === 1440 && scheme === 'light' && FULL.has(view)) await shoot(page, `${view}-1440-light-full`, true);
      } catch (err) {
        missing.push(name);
        fail(`${name}: ${err instanceof Error ? err.message : err}`);
      } finally {
        await ctx.setOffline(false);
        await page.close();
      }
    }
    for (const p of problems) fail(`${width} ${scheme}: ${p}`);
    await ctx.close();
  }
  log(missing.length ? `not captured: ${missing.join(', ')}` : `all views captured into ${dir}`);
}
