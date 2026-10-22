#!/usr/bin/env node
// Hero GIF (PLAN D18), dev-only and never run in CI: builds the site, serves it with `vite preview`, opens one system
// Chrome at 1280×720, and records the map of the default sample: the map as it opens, the pointer moving to the
// numbered trouble marker, the click that opens its details, the next piece of evidence, and Esc back to the map.
// The frames are encoded with the system ffmpeg into docs/brand/hero.gif (looping, ≤ 2.5 MB).
// Without ffmpeg it stops with a message, and the README keeps the still docs/brand/hero.webp.
// The skill itself runs in an agent's terminal, which a browser cannot record: the GIF shows the map only.
// Usage: pnpm brand:hero-gif [--no-build]
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { killGroup, killGroupSync, startPreview, viteBin, waitForHttp } from '../browser/lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'docs', 'brand', 'hero.gif');
const tmp = join(root, '.tmp', 'hero-gif');
const MAX_BYTES = 2.5 * 1024 * 1024;
const SESSION = 'implementer-checks'; // the README hero's sample: one error streak, then every check passes
const port = Number(process.env.TG_PORT ?? 4318);
const baseURL = `http://127.0.0.1:${port}`;

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error('hero-gif: ffmpeg was not found on PATH, so no GIF was made. The README keeps docs/brand/hero.webp.\nInstall ffmpeg (e.g. `apt install ffmpeg` or `brew install ffmpeg`) and run `pnpm brand:hero-gif` again.');
  process.exit(1);
}

let server;
let browser;
const cleanup = async () => {
  if (browser) await browser.close().catch(() => {});
  if (server) await killGroup(server.child.pid);
  rmSync(tmp, { recursive: true, force: true });
};
process.on('exit', () => server && killGroupSync(server.child.pid));
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => cleanup().finally(() => process.exit(130)));

/** A visible pointer for the recording only (headless screenshots have none). */
const POINTER = `(() => {
  const el = document.createElement('div');
  el.id = 'rt-pointer';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:22px;height:22px;transform:translate(1000px,640px)';
  el.innerHTML = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M2 2 L2 18 L6.5 13.8 L9.6 20.5 L12.4 19.2 L9.4 12.6 L15.5 12.6 Z" fill="#1c2620" stroke="#fffdf7" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.append(el);
})()`;

try {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  if (!process.argv.includes('--no-build')) {
    const build = spawnSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: 'inherit' });
    if (build.status !== 0) throw new Error(`build failed (exit ${build.status})`);
  }
  server = startPreview(port);
  await waitForHttp(`${baseURL}/`, server.child);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: 'light' });
  const page = await ctx.newPage();

  const frames = []; // [file, seconds]
  const shot = async (seconds) => {
    const file = join(tmp, `${String(frames.length).padStart(3, '0')}.png`);
    await page.screenshot({ path: file });
    frames.push([file, seconds]);
  };
  let at = { x: 1000, y: 640 };
  const moveTo = async (x, y, steps = 10) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
      const p = { x: at.x + (x - at.x) * e, y: at.y + (y - at.y) * e };
      await page.evaluate(({ x: px, y: py }) => (document.getElementById('rt-pointer').style.transform = `translate(${px}px,${py}px)`), p);
      await page.mouse.move(p.x, p.y);
      await shot(0.06);
    }
    at = { x, y };
  };

  await page.goto(`${baseURL}/?session=${SESSION}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(POINTER);
  await page.waitForTimeout(400);
  await shot(1.6);

  const blaze = page.locator('[data-nav^="blaze:"]').first();
  await blaze.scrollIntoViewIfNeeded();
  const box = await blaze.boundingBox();
  if (!box) throw new Error('no trouble marker on the map');
  await moveTo(box.x + box.width / 2, box.y + box.height / 2);
  await shot(0.5);
  await page.mouse.down();
  await page.mouse.up();
  await page.locator('[data-testid="detail-panel"]').waitFor({ timeout: 5_000 });
  await page.waitForTimeout(80);
  await shot(0.08);
  await page.waitForTimeout(250);
  await shot(2.4);
  await page.keyboard.press('ArrowRight'); // the next piece of evidence: the second failed run
  await page.waitForTimeout(250);
  await shot(2.2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await shot(1.6);
  await ctx.close();

  // ffmpeg concat list: each frame with its duration; the last file is repeated so its duration counts.
  const list = frames.map(([f, s]) => `file '${f}'\nduration ${s}`).join('\n') + `\nfile '${frames.at(-1)[0]}'\n`;
  writeFileSync(join(tmp, 'frames.txt'), list);
  const filter = 'fps=12,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle';
  const ff = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'frames.txt'), '-vf', filter, '-loop', '0', out], { stdio: 'inherit', timeout: 120_000, killSignal: 'SIGKILL' });
  if (ff.status !== 0) throw new Error(`ffmpeg failed (exit ${ff.status ?? ff.signal})`);
  const size = statSync(out).size;
  console.log(`hero-gif: wrote ${out} (${frames.length} frames, ${(size / 1024 / 1024).toFixed(2)} MB)`);
  if (size > MAX_BYTES) throw new Error(`hero.gif is ${size} bytes, over the 2.5 MB limit`);
} catch (err) {
  console.error(`hero-gif: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await cleanup();
  console.log(`hero-gif: cleanup done (browser closed, preview pgid ${server?.child.pid ?? 'none'} stopped, ${tmp} removed)`);
}
