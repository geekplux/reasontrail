// Wordmark flow (brand, never part of "all"): docs/brand/wordmark-{light,dark}.png for the README's <picture>. The
// header's Wordmark (docs/DESIGN.md §2: the veined leaf at 20px, an 8px gap, "Reasontrail" in Geist 600 14px) drawn at 2.5x, so
// the image is 62 px tall at the README's size, at 2x pixels on a transparent background. The vein is cut in the
// theme's page colour (slate-1), so each file suits GitHub's light or dark page.
// Usage: pnpm check:browser --flows wordmark
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { watchContext } from '../lib.mjs';

export async function run({ context, baseURL, root, log, fail }) {
  const dir = join(root, 'docs', 'brand');
  mkdirSync(dir, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    const ctx = await context.browser().newContext({ viewport: { width: 1440, height: 400 }, colorScheme: scheme, reducedMotion: 'reduce', deviceScaleFactor: 2 });
    const problems = [];
    watchContext(ctx, baseURL, problems);
    try {
      const page = await ctx.newPage();
      await page.goto(`${baseURL}/`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const mark = page.locator('header .wordmark').first();
      if (!(await mark.count())) fail(`${scheme}: no header wordmark`);
      await page.addStyleTag({ content: '*, *::before, *::after { background: transparent !important; } header { height: auto !important; padding-block: 40px !important; border: 0 !important; } header .wordmark { zoom: 2.5; padding: 4px; }' });
      await page.waitForTimeout(100);
      const out = join(dir, `wordmark-${scheme}.png`);
      writeFileSync(out, await mark.screenshot({ omitBackground: true }));
      log(`screenshot ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
    } finally {
      await ctx.close();
    }
    problems.forEach((p) => fail(`${scheme}: ${p}`));
  }
}
