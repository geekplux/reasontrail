// Gallery flow (brand, never part of "all"): every demo link in examples/README.md
// (`https://reasontrail.example/?session=<id>&step=<id>`, D20) is opened on the preview server and must show the map
// with the detail panel open on that step. The first link per sample is also its gallery image,
// examples/img/<id>.webp (1280×800, light theme, motion reduced).
// Usage: pnpm check:browser --flows gallery
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_ORIGIN } from '../../check-docs.mjs';

/** `[{ session, step, search }]` for each distinct demo link with a session and a step, in document order. */
export function demoLinks(md) {
  const seen = new Set();
  const out = [];
  for (const m of md.matchAll(/https:\/\/reasontrail\.example\/?(\?[^\s)"'<>`]*)/g)) {
    const q = new URLSearchParams(m[1].replace(/&amp;/g, '&'));
    const session = q.get('session');
    const step = q.get('step');
    if (!session || !step || seen.has(`${session} ${step}`)) continue;
    seen.add(`${session} ${step}`);
    out.push({ session, step, search: `?session=${encodeURIComponent(session)}&step=${encodeURIComponent(step)}` });
  }
  return out;
}

export async function run({ context, baseURL, root, log, fail }) {
  const links = demoLinks(readFileSync(join(root, 'examples', 'README.md'), 'utf8'));
  if (links.length < 3) fail(`examples/README.md has ${links.length} demo step links (want one or more per sample)`);
  const dir = join(root, 'examples', 'img');
  mkdirSync(dir, { recursive: true });
  const shot = new Set();
  const ctx = await context.browser().newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', reducedMotion: 'reduce' });
  try {
    const page = await ctx.newPage();
    for (const { session, step, search } of links) {
      log(`${DEMO_ORIGIN}/${search}`);
      await page.goto(`${baseURL}/${search}`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });
      const panel = page.locator('[data-testid="detail-panel"]');
      await panel.waitFor({ timeout: 5_000 }).catch(() => fail(`${search}: the detail panel did not open`));
      if (!(await panel.count())) continue;
      const shown = await panel.locator(`.step-block[data-step="${step}"], .step-rows [data-step="${step}"]`).count();
      if (!shown) fail(`${search}: the panel does not show step ${step}`);
      if (!page.url().includes(`step=${step}`)) fail(`${search}: the URL lost the step (${page.url()})`);
      if (shot.has(session)) continue;
      shot.add(session);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      const file = join(dir, `${session}.webp`);
      writeFileSync(file, await page.screenshot({ type: 'webp', quality: 80 }));
      log(`screenshot ${file}`);
    }
  } finally {
    await ctx.close();
  }
}
