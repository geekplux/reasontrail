// Polish flow (phase 25): the calm-layout screenshot set. Every view at 1440×900 and 390×844 (viewport shots: the first
// screen is what the calm rules judge), one full-page shot per view at 1440, plus the map glance in dark; light theme,
// reduced motion, WebP. Writes <out>/before/ with --before, else <out>/after/. Not part of `--flows all`.
// Usage: pnpm check:browser --flows polish [--before] --out docs/screenshots/phase-25
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { watchContext } from '../lib.mjs';

const mapReady = (page) => page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });
const gardenReady = (page) => page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 15_000 });

export async function run({ context, baseURL, root, outDir, before, log, fail }) {
  const dir = join(outDir, before ? 'before' : 'after');
  const tmp = join(root, '.tmp', 'polish');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'home'), { recursive: true });
  mkdirSync(dir, { recursive: true });

  // The CLI viewer: a file:// map of a fixture, written in a sandboxed HOME.
  const cli = join(root, 'cli', 'dist', 'cli.mjs');
  const cliOut = join(tmp, 'trouble.html');
  if (existsSync(cli)) {
    const fixture = join(root, 'fixtures', 'sessions', 'claude-code', 'trouble.jsonl');
    const r = spawnSync(process.execPath, [cli, fixture, '--no-open', '--out', cliOut], { env: { PATH: process.env.PATH, HOME: join(tmp, 'home'), TMPDIR: tmp }, encoding: 'utf8', timeout: 20_000 });
    if (r.status !== 0) fail(`cli: exit ${r.status}: ${r.stderr}`);
  } else fail('cli/dist/cli.mjs is missing: run pnpm build:cli');
  const chatText = readFileSync(join(root, 'fixtures', 'chats', 'pasted-chatgpt.txt'), 'utf8');

  /** Saves the next download triggered by `act` into the tmp dir. */
  const download = async (page, act) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), act()]);
    const file = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`);
    await dl.saveAs(file);
    return file;
  };
  const shareDialog = async (page) => {
    await page.goto(`${baseURL}/`, { waitUntil: 'load' });
    await mapReady(page);
    await page.getByRole('button', { name: 'Save shareable copy…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save a shareable copy' });
    await dialog.waitFor();
    return dialog;
  };

  // Each view puts `page` in its state; returning a page captures that one instead (closed after the shots).
  const views = [
    ['map-glance', async (page) => { await page.goto(`${baseURL}/`); await mapReady(page); }],
    ['outline', async (page) => { await page.goto(`${baseURL}/?view=outline`); await page.waitForSelector('[data-testid="map"][data-view="outline"]', { timeout: 15_000 }); }],
    ['detail-panel', async (page) => {
      await page.goto(`${baseURL}/`);
      await mapReady(page);
      await page.locator('[role="application"] [data-nav^="ep:"]').first().click();
      await page.locator('[data-testid="detail-panel"]').waitFor({ timeout: 5_000 });
    }],
    ['showcase-open', async (page) => { await page.goto(`${baseURL}/?view=open`); await page.locator('input[type="file"]').first().waitFor({ state: 'attached' }); }],
    ['install', async (page) => { await page.goto(`${baseURL}/?view=install`); await page.waitForSelector('.install'); }],
    ['lens', async (page) => { await page.goto(`${baseURL}/?session=planner-pivot&step=s12&sample=lens-planner-pivot-1`); await gardenReady(page); }],
    ['chat-import', async (page) => { await page.goto(`${baseURL}/?view=chat`); await page.locator('#chat-text').waitFor(); }],
    ['chat-map', async (page) => {
      await page.goto(`${baseURL}/?view=chat`);
      await page.locator('#chat-text').fill(chatText);
      await page.getByRole('button', { name: 'Map this conversation' }).click();
      await mapReady(page);
    }],
    ['share-dialog', async (page) => { await shareDialog(page); }],
    ['share-card', async (page) => {
      const dialog = await shareDialog(page);
      const png = readFileSync(await download(page, () => dialog.getByRole('button', { name: 'Download map card (PNG)' }).click()));
      const view = await page.context().newPage();
      await view.setContent(`<body style="margin:0;background:#fff"><img alt="map card" style="display:block;width:100%;max-width:1200px;height:auto" src="data:image/png;base64,${png.toString('base64')}"></body>`);
      await view.locator('img').evaluate((img) => img.decode());
      return view;
    }],
    ['share-opened', async (page) => {
      const dialog = await shareDialog(page);
      const file = await download(page, () => dialog.getByRole('button', { name: 'Download HTML' }).click());
      const view = await page.context().newPage();
      await page.context().setOffline(true);
      await view.goto(pathToFileURL(file).href, { waitUntil: 'load' });
      await mapReady(view);
      return view;
    }],
    ['garden', async (page) => { await page.goto(`${baseURL}/?sample=lighthouse`); await gardenReady(page); }],
    ['cli-viewer', async (page) => {
      if (!existsSync(cliOut)) throw new Error('no CLI output');
      await page.goto(pathToFileURL(cliOut).href, { waitUntil: 'load' });
      await mapReady(page);
    }],
  ];

  const browser = context.browser();
  const shoot = async (target, name, fullPage = false) => {
    const path = join(dir, `${name}.webp`);
    writeFileSync(path, await target.screenshot({ type: 'webp', quality: 80, fullPage }));
    log(`screenshot ${path}`);
  };
  const settle = async (target, keepFocus) => {
    await target.evaluate(() => document.fonts.ready);
    if (!keepFocus) await target.evaluate(() => { if (!document.activeElement?.closest('dialog')) document.activeElement?.blur(); window.scrollTo(0, 0); });
    await target.waitForTimeout(300);
  };
  const missing = [];

  for (const [width, height, scheme, only] of [[1440, 900, 'light'], [390, 844, 'light'], [1440, 900, 'dark', ['map-glance']]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce', acceptDownloads: true });
    const problems = [];
    watchContext(ctx, baseURL, problems);
    for (const [view, go] of views.filter(([v]) => !only || only.includes(v))) {
      const name = `${view}${scheme === 'dark' ? '-dark' : ''}-${width}`;
      const page = await ctx.newPage();
      try {
        const other = await go(page);
        const target = other ?? page;
        await settle(target, view === 'detail-panel' || view === 'share-dialog');
        await shoot(target, name);
        if (width === 1440 && scheme === 'light') await shoot(target, `${view}-1440-full`, true);
        if (other) await other.close();
      } catch (err) {
        missing.push(name);
        fail(`${name}: ${err instanceof Error ? err.message : err}`);
      } finally {
        await ctx.setOffline(false);
        await page.close();
      }
    }
    for (const p of problems) fail(`${width}${scheme === 'dark' ? ' dark' : ''}: ${p}`);
    await ctx.close();
  }
  log(missing.length ? `not captured: ${missing.join(', ')}` : `all views captured into ${dir}`);
}
