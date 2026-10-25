#!/usr/bin/env node
// Canvas comparison helper for redesign v7 (docs/design/v7/PROMPT.md §13.4). Always run under the shared browser lock:
//   flock /workspace/gx-projects/logs/browser.lock node scripts/design/canvas.mjs <command> ...
//
// Commands:
//   frames [--out docs/design/v7/frames] [--only <name>]
//       Renders the canvas preview pages (docs/design/v7/preview/*.html) with system Chrome: home-1440-light,
//       home-1440-dark, hover-1440-light, step-1440-light, open-1440-light (viewport 1440×900) and phone-390-light
//       (390×844), each as `<name>.webp` (full page) and `<name>-fold.webp` (first screen only); `--only` renders one.
//   shoot --url <url> --out <file.webp> [--width 1440] [--height 900] [--theme light|dark] [--full] [--actions <list>]
//       Screenshots any page (the app) at the same viewport and theme as a canvas frame. `--actions` runs steps before
//       the shot, separated by ";": click:<selector>, press:<key> (on the focused element), focus:<selector>,
//       mouse:<x>,<y>, upload:<selector>|<file> (a file input), wait:<selector>. E.g. the Step state:
//       'click:[aria-label^="6 Read"];click:[aria-label^="Inspect vitest"];mouse:0,0'. `--fake-ai` answers
//       /api/structure with fixed titles (fake-model-1), for the AI titles state.
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
  else if (key === 'fake-ai') opts.fakeAi = true;
  else opts[key] = rest[++i];
}

const FRAMES = [
  ['home-1440-light', 'Home.html', 1440, 900, 'light'],
  ['home-1440-dark', 'HomeDark.html', 1440, 900, 'dark'],
  ['hover-1440-light', 'Hover.html', 1440, 900, 'light'],
  ['step-1440-light', 'Step.html', 1440, 900, 'light'],
  ['open-1440-light', 'Open.html', 1440, 900, 'light'],
  ['phone-390-light', 'Phone.html', 390, 844, 'light'],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--disable-dev-shm-usage', '--disable-gpu', '--allow-file-access-from-files'],
});

const TITLES = ['sub-question', 'hypothesis', 'evidence', 'dead end', 'decision', 'answer'];
async function shoot(url, { width, height, theme, full, out, foldOut, actions, fakeAi }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce' });
  const tab = await ctx.newPage();
  if (fakeAi) {
    await tab.route('**/api/structure', (route) => {
      const steps = route.request().postDataJSON()?.steps ?? [];
      const labels = steps.map((st, i) => ({ stepId: st.id, label: TITLES[Math.floor((i * TITLES.length) / steps.length)], confidence: 0.8 }));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: 'fake-model-1', cached: false, labels, links: [] }) });
    });
  }
  await tab.goto(url, { waitUntil: 'networkidle' });
  await tab.evaluate(() => document.fonts.ready);
  for (const step of (actions ?? '').split(';').filter(Boolean)) {
    const [verb, ...arg] = step.split(':');
    const a = arg.join(':');
    if (verb === 'click') await tab.click(a);
    else if (verb === 'focus') await tab.focus(a);
    else if (verb === 'press') await tab.keyboard.press(a);
    else if (verb === 'mouse') await tab.mouse.move(...a.split(',').map(Number));
    else if (verb === 'upload') await tab.setInputFiles(a.split('|')[0], resolve(root, a.split('|')[1]));
    else if (verb === 'wait') await tab.waitForSelector(a, { timeout: 15_000 });
    else throw new Error(`unknown action: ${step}`);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await tab.screenshot({ type: 'webp', quality: 82, fullPage: Boolean(full) }));
  if (foldOut) writeFileSync(foldOut, await tab.screenshot({ type: 'webp', quality: 82 }));
  await ctx.close();
}

try {
  if (command === 'frames') {
    const out = resolve(root, opts.out ?? 'docs/design/v7/frames');
    for (const [name, file, width, height, theme] of FRAMES.filter(([n]) => !opts.only || n === opts.only)) {
      const url = pathToFileURL(join(root, 'docs/design/v7/preview', file)).href;
      await shoot(url, { width, height, theme, full: true, out: join(out, `${name}.webp`), foldOut: join(out, `${name}-fold.webp`) });
      console.log(`frame ${name} -> ${join(out, name)}.webp`);
    }
  } else if (command === 'shoot') {
    if (!opts.url || !opts.out) throw new Error('shoot needs --url and --out');
    await shoot(opts.url, { width: Number(opts.width ?? 1440), height: Number(opts.height ?? 900), theme: opts.theme ?? 'light', full: opts.full, out: resolve(opts.out), actions: opts.actions, fakeAi: opts.fakeAi });
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
