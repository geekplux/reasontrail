// Explore flow (phase 4): grow and collapse recorded branches (anchored on screen), the not-recorded note with no
// requests, reduced motion, expansion timing (P3), share links (copy, reload, broken), and mobile.
import { axeProblems } from '../axe.mjs';
import { loadSample } from '../lib.mjs';

const { nodes } = loadSample('lighthouse');
const ENTERED = nodes[' entered'].map((c) => ` entered${c.token}`);
// A depth-3 branch outside the recording: the first child of " looked"'s first child (not on a recorded spine).
const OPENER = ` looked${nodes[' looked'][0].token}`;
const UNRECORDED = nodes[OPENER].map((c) => OPENER + c.token).find((k) => !Object.hasOwn(nodes, k));
const hit = (key) => `g.branch[data-key="${key}"] [data-role="hit"]`;
const same = (a, b) => [...a].sort().join('|') === [...b].sort().join('|');

async function open(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Whether every key's hit rect is inside the viewport (or, horizontally, inside the `within` element). */
const inView = (page, keys, within = null) =>
  page.evaluate(([sels, inside]) => {
    const box = inside ? document.querySelector(inside).getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
    return sels.every((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return (inside || (r.top >= box.top && r.bottom <= box.bottom)) && r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
    });
  }, [keys.map(hit), within]);

/** Clicks a branch with the real mouse; spec §4: its hit rect stays within 1 px. */
async function clickAnchored(page, key, label, fail, log) {
  const rect = () => page.locator(hit(key)).evaluate((e) => e.getBoundingClientRect().toJSON());
  const [before, box] = [await rect(), await page.locator(hit(key)).boundingBox()];
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await page.waitForTimeout(50);
  const after = await rect();
  const moved = { top: after.top - before.top, left: after.left - before.left };
  log(`${label}: ${JSON.stringify(key)} moved ${JSON.stringify(moved)} (scrollY ${await page.evaluate(() => scrollY)})`);
  if (Math.abs(moved.top) > 1 || Math.abs(moved.left) > 1) fail(`${label}: ${key} moved ${JSON.stringify(moved)}`);
}

export async function run({ page, context, baseURL, shot, log, fail }) {
  const requests = [];
  page.on('request', (r) => requests.push(`${r.resourceType()} ${r.url()}`));
  const state = (key) => page.locator(`g.branch[data-key="${key}"]`).getAttribute('data-state');

  // F1: default expansion (D11).
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `${baseURL}/?sample=lighthouse`);
  if ((await state(' looked')) !== 'expanded' || (await page.locator('g[data-depth="2"]').count()) !== 5) fail('default: " looked" is not open with 5 children');
  for (const p of await axeProblems(page, 'explore default')) fail(p);
  await shot('explore-default');

  // A5: growth transitions exist, and are zero under reduced motion.
  const duration = () => page.locator('g.branch[data-key=" entered"]').evaluate((g) => getComputedStyle(g).transitionDuration);
  const normal = await duration();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await duration();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  log(`transition-duration: ${normal} / reduced ${reduced}`);
  if (!/[1-9]/.test(normal) || reduced.split(',').some((d) => parseFloat(d) !== 0)) fail(`transition-duration ${normal} / reduced ${reduced}`);

  // F3 + spec §4: expand " entered" in place; its children appear and are visible; F6: the readout follows.
  await clickAnchored(page, ' entered', 'expand', fail, log);
  const kids = await page.$$eval('g[data-depth="2"]', (gs) => gs.map((g) => g.dataset.key).filter((k) => k.startsWith(' entered')));
  if (!same(kids, ENTERED)) fail(`expand: children ${JSON.stringify(kids)}`);
  if (!(await inView(page, ENTERED))) fail('expand: children not all in the viewport');
  const readout = await page.locator('[data-role="readout"]').textContent();
  if (!readout.startsWith('Reading:') || !readout.includes('· entered')) fail(`F6: readout is ${readout}`);
  await shot('explore-expanded');

  // Collapse with the page scrolled >= 200 px (the anchored expansion usually scrolled that far already).
  if ((await page.evaluate(() => scrollY)) < 200) await page.evaluate(() => window.scrollTo(0, 200));
  if ((await page.evaluate(() => scrollY)) < 200) fail('collapse: page cannot scroll 200 px');
  await clickAnchored(page, ' entered', 'collapse', fail, log);
  if ((await state(' entered')) !== 'expandable' || (await page.locator(hit(' entered the')).count()) !== 0) fail('collapse: " entered" still open');
  await page.evaluate(() => window.scrollTo(0, 0));

  // P3: children in the DOM within 200 ms of the click (median of 3); only the new children animate.
  const times = [];
  for (let i = 0; i < 3; i++) {
    const res = await page.evaluate(async (sel) => {
      const click = () => document.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      click();
      await new Promise((r) => requestAnimationFrame(r));
      const animated = [...new Set(document.getAnimations().map((a) => a.effect?.target?.closest('g[data-key]')?.dataset.key))];
      click(); // collapse again
      return { ms: performance.getEntriesByName('tg:expand').at(-1)?.duration, animated };
    }, hit(' entered'));
    times.push(res.ms ?? Infinity);
    if (i === 0 && !same(res.animated, ENTERED)) fail(`growth animates ${JSON.stringify(res.animated)}`);
  }
  const median = [...times].sort((a, b) => a - b)[1];
  log(`P3 expand times ${times.map((t) => t.toFixed(1)).join(', ')} ms, median ${median.toFixed(1)}`);
  if (!(median <= 200)) fail(`P3: median expansion ${median} ms > 200`);

  // F4: an unrecorded branch shows a calm note (next to it, or on the readout line) and makes no request.
  requests.length = 0;
  await page.locator(hit(OPENER)).click();
  await page.locator(hit(UNRECORDED)).click();
  const notes = await page.locator('.garden-note .inline-note, .readout .inline-note').allTextContents();
  log(`F4: ${JSON.stringify(UNRECORDED)} note ${JSON.stringify(notes)}`);
  if (notes.join() !== 'Not in this recording.' || requests.length) fail(`F4: notes ${JSON.stringify(notes)}, requests ${requests.join(', ')}`);
  for (const p of await axeProblems(page, 'explore not recorded')) fail(p);
  await shot('explore-not-recorded');

  // F14: select the deepest recorded branch (" entered" + its first child), copy the link, reopen it.
  await page.locator(hit(' entered')).click();
  await page.locator(hit(' entered the')).click();
  await page.waitForTimeout(250);
  const url = page.url();
  if (!url.endsWith('/?sample=lighthouse&path=1.0')) fail(`F14: URL is ${url}`);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  await page.getByRole('button', { name: 'Copy link' }).click();
  await page.locator('.share-status', { hasText: 'Link copied' }).waitFor({ timeout: 2_000 });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (copied !== url) fail(`Copy link wrote ${copied}, expected ${url}`);

  // WCAG 1.4.10: at 390 px the header (after a copy, and with the fallback field) never widens the page.
  await page.setViewportSize({ width: 390, height: 844 });
  const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await page.locator('.share-status', { hasText: 'Link copied' }).waitFor({ timeout: 2_000 });
  if ((await pageWidth()) > 390) fail(`390 px after copy: page is ${await pageWidth()} px wide`);
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')), configurable: true }));
  await page.getByRole('button', { name: 'Copy link' }).click();
  await page.getByLabel('Link to this view').waitFor({ timeout: 2_000 });
  if ((await pageWidth()) > 390) fail(`390 px copy fallback: page is ${await pageWidth()} px wide`);
  await shot('explore-copy-fallback-mobile');
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.mouse.move(0, 0);
  requests.length = 0;
  await open(page, url);
  await page.waitForTimeout(250);
  const selected = await page.locator('[data-role="value-label"]').getAttribute('data-key');
  if ((await state(' entered')) !== 'expanded' || selected !== ' entered the') fail(`shared link: entered ${await state(' entered')}, selected ${selected}`);
  const calls = requests.filter((r) => /^(fetch|xhr)/.test(r));
  if (calls.length) fail(`shared link: data requests ${calls.join(', ')}`);
  await shot('explore-shared-link');

  // A broken link restores the longest valid prefix (here: nothing) with a notice.
  await open(page, `${baseURL}/?sample=lighthouse&path=9.9`);
  const notice = await page.locator('.garden-figure > .inline-note').textContent();
  if (notice !== "iPart of this link isn't in the recording." || (await state(' looked')) !== 'expanded') fail(`broken link: notice ${notice}`);
  await shot('explore-broken-link');

  // Mobile: grow " entered"; its children come into the sideways scroll view.
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `${baseURL}/?sample=lighthouse`);
  await page.locator(hit(' entered')).click();
  if (!(await inView(page, ENTERED.slice(0, 1), '.garden-scroll'))) fail('mobile: new children not scrolled into view');
  for (const p of await axeProblems(page, 'explore mobile')) fail(p);
  await shot('explore-mobile');
}
