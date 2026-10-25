// Gallery flow (brand, never part of "all"): every demo link in examples/README.md
// (`https://reasontrail.geekplux.com/?session=<id>&step=<id>`) is opened on the preview server and must show the v7
// Step state: the step's panel open (`aside.detail[data-step]`), its row selected in the list, the step in the URL and
// the tree dimmed with the blue path. The first link per sample is also its gallery image, examples/img/<id>.webp:
// 1440 wide, light, motion reduced, from the tree's top to the list's end (the tree with its callout, the list and the
// panel side by side; a panel taller than the list is cut there).
// Usage: pnpm check:browser --flows gallery
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_ORIGIN } from '../../check-docs.mjs';

/** `[{ session, step, search }]` for each distinct demo link with a session and a step, in document order. */
export function demoLinks(md) {
  const seen = new Set();
  const out = [];
  for (const m of md.matchAll(/https:\/\/reasontrail\.geekplux\.com\/?(\?[^\s)"'<>`]*)/g)) {
    const q = new URLSearchParams(m[1].replace(/[.,:;!?]+$/, '').replace(/&amp;/g, '&'));
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
  const ctx = await context.browser().newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  try {
    const page = await ctx.newPage();
    for (const { session, step, search } of links) {
      log(`${DEMO_ORIGIN}/${search}`);
      await page.goto(`${baseURL}/${search}`, { waitUntil: 'load' });
      const panel = page.locator(`aside.detail[data-step="${step}"]`);
      if (!(await panel.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
        fail(`${search}: the panel did not open on ${step}`);
        continue;
      }
      const state = await page.evaluate((id) => ({
        row: document.querySelector(`[data-row="step:${id}"]`)?.getAttribute('aria-selected'),
        dim: !!document.querySelector('.hero-tree svg.tree.dim'),
        url: location.search,
      }), step);
      if (state.row !== 'true') fail(`${search}: the list does not select ${step}`);
      if (!state.dim) fail(`${search}: the tree does not show the selected path`);
      if (!state.url.includes(`step=${step}`)) fail(`${search}: the URL lost the step (${state.url})`);
      if (shot.has(session)) continue;
      shot.add(session);
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      const clip = await page.evaluate(() => {
        const top = document.querySelector('.hero-tree').getBoundingClientRect().top + window.scrollY;
        // To the list's end (or the panel's, if shorter): a long command can make the panel run far below the list.
        const end = (sel) => document.querySelector(sel).getBoundingClientRect().bottom + window.scrollY;
        const bottom = Math.min(end('aside.detail'), Math.max(end('.cols .gl'), top + 900));
        return { x: 0, y: Math.max(0, Math.floor(top - 32)), width: 1440, height: Math.ceil(bottom - top + 64) };
      });
      const file = join(dir, `${session}.webp`);
      writeFileSync(file, await page.screenshot({ type: 'webp', quality: 78, fullPage: true, clip }));
      log(`screenshot ${file} (${clip.width}×${clip.height}, ${Math.round(statSync(file).size / 1024)} KB)`);
    }
  } finally {
    await ctx.close();
  }
}
