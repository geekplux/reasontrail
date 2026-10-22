#!/usr/bin/env node
// README rendering check (PLAN phase 26, S1): render README.md with GitHub's own Markdown API (`gh api /markdown`),
// wrap it in a page with GitHub-like light CSS and a <base> at the repo root, open it from file:// in the one headless
// Chrome, and check that the first screen at 1440×900 shows the wordmark, pitch, hero, demo link and quick start.
// Writes readme-above-fold.webp, readme-full.webp and readme-mobile.webp into --out (default .tmp/readme).
// Usage: node scripts/browser/readme-shot.mjs [--out <dir>]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outArg = process.argv.indexOf('--out');
const out = resolve(root, outArg > 0 ? process.argv[outArg + 1] : '.tmp/readme');
mkdirSync(out, { recursive: true });

const body = execFileSync('gh', ['api', '-X', 'POST', '/markdown', '-f', 'mode=gfm', '-f', 'context=geekplux/reasontrail', '-F', `text=@${join(root, 'README.md')}`], { encoding: 'utf8' });
const css = `body{margin:0;background:#fff;color:#1f2328;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}
.markdown-body{box-sizing:border-box;max-width:920px;margin:24px auto;padding:32px;border:1px solid #d1d9e0;border-radius:6px}
h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em;font-weight:600;margin:24px 0 16px}h1{font-size:2em}h2{font-size:1.5em}
a{color:#0969da}p,ul,ol,pre,blockquote,table{margin:0 0 16px}img{max-width:100%;box-sizing:content-box}
code{font:85% ui-monospace,SFMono-Regular,Menlo,monospace;background:#818b981f;padding:.2em .4em;border-radius:6px}
pre{background:#f6f8fa;padding:16px;border-radius:6px;overflow:auto;line-height:1.45}pre code{background:none;padding:0;font-size:85%}
blockquote{padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0}
@media (max-width:600px){.markdown-body{margin:0;border:0;padding:16px}}`;
const page = join(out, 'readme.html');
writeFileSync(page, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<base href="${pathToFileURL(root).href}/"><title>README</title><style>${css}</style></head><body><article class="markdown-body">${body}</article></body></html>`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu', '--allow-file-access-from-files'] });
const problems = [];
try {
  for (const [name, width, height] of [['readme-above-fold', 1440, 900], ['readme-mobile', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'light' });
    const tab = await ctx.newPage();
    tab.on('requestfailed', (r) => problems.push(`${name}: failed ${r.url()}`));
    await tab.goto(pathToFileURL(page).href, { waitUntil: 'load' });
    await tab.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => { throw new Error(`image did not load: ${i.src}`); }))));
    writeFileSync(join(out, `${name}.webp`), await tab.screenshot({ type: 'webp', quality: 82 }));
    if (name === 'readme-above-fold') {
      writeFileSync(join(out, 'readme-full.webp'), await tab.screenshot({ type: 'webp', quality: 70, fullPage: true }));
      const fold = await tab.evaluate(() => {
        const bottom = (el) => (el ? Math.round(el.getBoundingClientRect().bottom) : null);
        return {
          wordmark: bottom(document.querySelector('img[alt="Reasontrail"]')),
          pitch: bottom([...document.querySelectorAll('p')].find((p) => p.textContent.startsWith('See how your AI agent reasoned'))),
          demo: bottom([...document.querySelectorAll('a')].find((a) => a.textContent.includes('Live demo'))),
          hero: bottom(document.querySelector('img[src$="hero.webp"]')),
          quickStart: bottom(document.querySelector('h2 ~ div pre, h2 ~ pre')),
        };
      });
      for (const [what, y] of Object.entries(fold)) if (y === null || y > height) problems.push(`above the fold: ${what} ends at ${y} (viewport ${height})`);
      console.log(`above the fold (bottom px): ${JSON.stringify(fold)}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`screenshots in ${out}`);
if (problems.length) {
  console.error(`readme check FAILED:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('readme check passed');
