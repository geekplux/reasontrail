#!/usr/bin/env node
// Canvas comparison helper for redesign v7 (docs/design/v7/PROMPT.md §13.4). Always run under the shared browser lock:
//   flock /workspace/gx-projects/logs/browser.lock node scripts/design/canvas.mjs <command> ...
//
// Commands:
//   frames [--out docs/design/v7/frames]
//       Renders the canvas preview pages (docs/design/v7/preview/*.html) with system Chrome: home-1440-light,
//       home-1440-dark, hover-1440-light, step-1440-light (viewport 1440×900) and phone-390-light (390×844),
//       each as `<name>.webp` (full page) and `<name>-fold.webp` (first screen only).
//   shoot --url <url> --out <file.webp> [--width 1440] [--height 900] [--theme light|dark] [--full]
//       Screenshots any page (the app) at the same viewport and theme as a canvas frame.
//   pair --canvas <file> --app <file> --out <file.webp> [--title <short text, at most 24 characters>]
//       Puts the canvas frame (left) and the app screenshot (right) side by side in one WebP.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [command, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const key = rest[i].replace(/^--/, '');
  if (key === 'full') opts.full = true;
  else opts[key] = rest[++i];
}

const FRAMES = [
  ['home-1440-light', 'Home.html', 1440, 900, 'light'],
  ['home-1440-dark', 'HomeDark.html', 1440, 900, 'dark'],
  ['hover-1440-light', 'Hover.html', 1440, 900, 'light'],
  ['step-1440-light', 'Step.html', 1440, 900, 'light'],
  ['phone-390-light', 'Phone.html', 390, 844, 'light'],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--disable-dev-shm-usage', '--disable-gpu', '--allow-file-access-from-files'],
});

async function shoot(url, { width, height, theme, full, out, foldOut }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce' });
  const tab = await ctx.newPage();
  await tab.goto(url, { waitUntil: 'networkidle' });
  await tab.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await tab.screenshot({ type: 'webp', quality: 82, fullPage: Boolean(full) }));
  if (foldOut) writeFileSync(foldOut, await tab.screenshot({ type: 'webp', quality: 82 }));
  await ctx.close();
}

try {
  if (command === 'frames') {
    const out = resolve(root, opts.out ?? 'docs/design/v7/frames');
    for (const [name, file, width, height, theme] of FRAMES) {
      const url = pathToFileURL(join(root, 'docs/design/v7/preview', file)).href;
      await shoot(url, { width, height, theme, full: true, out: join(out, `${name}.webp`), foldOut: join(out, `${name}-fold.webp`) });
      console.log(`frame ${name} -> ${join(out, name)}.webp`);
    }
  } else if (command === 'shoot') {
    if (!opts.url || !opts.out) throw new Error('shoot needs --url and --out');
    await shoot(opts.url, { width: Number(opts.width ?? 1440), height: Number(opts.height ?? 900), theme: opts.theme ?? 'light', full: opts.full, out: resolve(opts.out) });
    console.log(`shot ${opts.url} -> ${opts.out}`);
  } else if (command === 'pair') {
    if (!opts.canvas || !opts.app || !opts.out) throw new Error('pair needs --canvas, --app and --out');
    const src = (file) => `data:image/${extname(file).slice(1) === 'png' ? 'png' : 'webp'};base64,${readFileSync(resolve(file)).toString('base64')}`;
    // The captions are "Canvas" and "App"; a short title (e.g. "Home 1440 light") may follow the first one.
    const title = (opts.title ?? '').replace(/[<&]/g, '').trim();
    const caption = title && title.length <= 24 ? `Canvas: ${title}` : 'Canvas';
    const html = `<!doctype html><html><body style="margin:0;background:#fff;color:#1c2024;font:600 28px Geist, system-ui, -apple-system, 'Segoe UI', sans-serif">
      <div style="display:flex;gap:24px;padding:24px;align-items:flex-start">
        <figure style="margin:0"><figcaption style="padding:0 0 12px">${caption}</figcaption><img id="a" src="${src(opts.canvas)}" style="display:block;outline:1px solid #ccc"></figure>
        <figure style="margin:0"><figcaption style="padding:0 0 12px">App</figcaption><img id="b" src="${src(opts.app)}" style="display:block;outline:1px solid #ccc"></figure>
      </div></body></html>`;
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const tab = await ctx.newPage();
    await tab.setContent(html, { waitUntil: 'load' });
    const size = await tab.evaluate(async () => {
      await Promise.all([...document.images].map((i) => i.decode()));
      return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
    });
    await tab.setViewportSize(size);
    mkdirSync(dirname(resolve(opts.out)), { recursive: true });
    writeFileSync(resolve(opts.out), await tab.screenshot({ type: 'webp', quality: 80, fullPage: true }));
    await ctx.close();
    console.log(`pair -> ${opts.out}`);
  } else {
    throw new Error('usage: canvas.mjs frames | shoot | pair (see the header comment)');
  }
} finally {
  await browser.close();
}
