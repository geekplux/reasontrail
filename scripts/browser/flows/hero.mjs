// Hero flow (brand, never part of "all"): the README's images, written to committed paths.
// - docs/brand/hero.webp: the website's live map of a sample session at 1440×900 and 2× pixels, clipped to the map
//   itself (the Task label row down to the end of the final answer, 24 px padding), light theme, motion reduced.
// - docs/brand/wordmark-{light,dark}.png: the header wordmark (DESIGN §4.2: mono 40 / serif 50) at 2× pixels on a
//   transparent background, so GitHub can pick one with <picture> and prefers-color-scheme.
// Usage: pnpm check:browser --flows hero
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { watchContext } from '../lib.mjs';

export const HERO_SESSION = 'implementer-checks'; // the richest glance: 12 episodes, a trouble spot, a final answer
const ready = (page) => page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });

/** The map region in page pixels: the map body's width, from the Task label row to the end of the final answer, padded. */
async function mapClip(page, pad = 24) {
  return page.evaluate((p) => {
    const body = document.querySelector('.map-body');
    const top = document.querySelector('.task-eyebrow');
    const answer = [...document.querySelectorAll('#destination .sub-label')].find((h) => h.textContent.trim() === 'Final answer')?.parentElement;
    if (!body || !top || !answer) return null;
    const b = body.getBoundingClientRect();
    const t = top.getBoundingClientRect();
    const a = answer.getBoundingClientRect();
    const x = Math.max(0, Math.floor(b.left - p));
    const y = Math.max(0, Math.floor(t.top + window.scrollY - p));
    return { x, y, width: Math.ceil(Math.min(document.documentElement.clientWidth, b.right + p) - x), height: Math.ceil(a.bottom + window.scrollY + p - y) };
  }, pad);
}

export async function run({ context, baseURL, root, log, fail }) {
  const dir = join(root, 'docs', 'brand');
  mkdirSync(dir, { recursive: true });
  const browser = context.browser();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce', deviceScaleFactor: 2 });
    const problems = [];
    watchContext(ctx, baseURL, problems);
    try {
      const page = await ctx.newPage();
      await page.goto(`${baseURL}/?session=${HERO_SESSION}`, { waitUntil: 'load' });
      await ready(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      if (scheme === 'light') {
        const hero = join(dir, 'hero.webp');
        const clip = await mapClip(page);
        if (!clip) fail('hero: the Task label or the final answer was not found');
        else writeFileSync(hero, await page.screenshot({ type: 'webp', quality: 82, clip }));
        log(`screenshot ${hero}`);
      }
      // The wordmark alone, README size, nothing behind it.
      await page.addStyleTag({ content: '*, *::before, *::after { background: transparent !important; } .wordmark { font-size: 40px !important; padding: 6px; }' });
      await page.waitForTimeout(100);
      const mark = join(dir, `wordmark-${scheme}.png`);
      writeFileSync(mark, await page.locator('header .wordmark').first().screenshot({ omitBackground: true }));
      log(`screenshot ${mark}`);
    } finally {
      await ctx.close();
    }
    problems.forEach((p) => fail(`${scheme}: ${p}`));
  }
}
