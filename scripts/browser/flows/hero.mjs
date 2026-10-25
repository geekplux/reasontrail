// Hero flow (brand, never part of "all"): the README's hero, written to a committed path.
// - docs/brand/hero.webp: the v7 home's first screen (PROMPT §7 "README hero = a 1440 light screenshot of the new
//   home"): 1440×900, light, motion reduced, the default sample (verify-fail-fix), nothing hovered or selected. It is
//   also the picture in the social preview (docs/brand/social-preview.html crops it to the tree).
// The wordmark images are the wordmark flow's; the launch GIF is `pnpm brand:hero-gif`.
// Usage: pnpm check:browser --flows hero
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { watchContext } from '../lib.mjs';

export async function run({ context, baseURL, root, log, fail }) {
  const dir = join(root, 'docs', 'brand');
  mkdirSync(dir, { recursive: true });
  const ctx = await context.browser().newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const problems = [];
  watchContext(ctx, baseURL, problems);
  try {
    const page = await ctx.newPage();
    await page.goto(`${baseURL}/`, { waitUntil: 'load' });
    await page.waitForSelector('.hero-tree svg.tree[role="img"]', { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    // The whole tree must be in the shot (the canvas's first screen is the picture).
    const bottom = await page.evaluate(() => document.querySelector('.hero-tree')?.getBoundingClientRect().bottom ?? Infinity);
    if (bottom > 900) fail(`hero: the tree ends at ${Math.round(bottom)}px, below the 900px first screen`);
    const hero = join(dir, 'hero.webp');
    writeFileSync(hero, await page.screenshot({ type: 'webp', quality: 82 }));
    log(`screenshot ${hero} (${Math.round(statSync(hero).size / 1024)} KB)`);
  } finally {
    await ctx.close();
  }
  problems.forEach((p) => fail(`light: ${p}`));
}
