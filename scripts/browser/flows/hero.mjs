// Hero flow (brand, never part of "all"): the README's images, written to committed paths.
// - docs/brand/hero.webp: the still for readers who prefer reduced motion, framed like the hero GIF's first frame
//   (pnpm brand:hero-gif): the website's live map of a sample session in a 1024×640 viewport at 2× pixels, scrolled so
//   it starts at the TASK row (no site header or headline), light theme, motion reduced.
// - docs/brand/wordmark-{light,dark}.png: the header wordmark (DESIGN §4.2: mono 40 / serif 50) at 2× pixels on a
//   transparent background, so GitHub can pick one with <picture> and prefers-color-scheme.
// Usage: pnpm check:browser --flows hero
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { watchContext } from '../lib.mjs';

export const HERO_SESSION = 'implementer-checks'; // the richest glance: 12 episodes, a trouble spot, a final answer
const ready = (page) => page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });

/** Scrolls so the viewport starts 16 px above the TASK row, as in the hero GIF; false when there is no TASK row. */
async function scrollToTask(page) {
  await page.addStyleTag({ content: 'body { padding-bottom: 640px; }' });
  return page.evaluate(() => {
    const row = document.querySelector('.task-eyebrow');
    if (!row) return false;
    window.scrollTo(0, Math.max(0, Math.floor(row.getBoundingClientRect().top + window.scrollY - 16)));
    return true;
  });
}

export async function run({ context, baseURL, root, log, fail }) {
  const dir = join(root, 'docs', 'brand');
  mkdirSync(dir, { recursive: true });
  const browser = context.browser();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 }, colorScheme: scheme, reducedMotion: 'reduce', deviceScaleFactor: 2 });
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
        if (!(await scrollToTask(page))) fail('hero: the TASK row was not found');
        else writeFileSync(hero, await page.screenshot({ type: 'webp', quality: 82 }));
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
