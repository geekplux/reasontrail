// The local viewer's checks, shared by the cli and file flows (v7 §7): open a file:// page with every non-file request
// aborted, then the tree, the git-style list, the outcome and the footer's two links; a step picked in the list opens
// its panel and writes `#step=`; Esc closes it; a deep link opens it again.
const SITE = 'https://reasontrail.geekplux.com/';
const MAKER = 'https://geekplux.com/';

/** Blocks the network for this page (only file:, data: and blob: load); returns the list the aborted URLs go into. */
export async function blockNetwork(page) {
  const blocked = [];
  await page.route(/^(?!file:|data:|blob:)/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  return blocked;
}

/** Opens a viewer page; resolves once the tree is drawn and the fonts are in. */
export async function openViewer(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.hero-tree svg[role="img"]', { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** The phone viewport, once the tree has been measured again at its width; returns the horizontal overflow in px. */
export async function toPhone(page, fail, where = 'viewer') {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => Number(document.querySelector('.hero-tree svg.tree')?.getAttribute('width')) <= 390 && document.querySelector('[role="treeitem"]')?.getBoundingClientRect().height > 0, null, { timeout: 10_000 })
    .catch(() => fail(`${where}: the phone layout did not settle`));
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** The viewer's structure at the current viewport. */
export async function viewerFacts(page) {
  return page.evaluate(() => ({
    header: document.querySelector('header.bar')?.textContent,
    rows: document.querySelectorAll('[role="tree"][aria-label="Episodes in order"] [role="treeitem"]').length,
    outcome: document.querySelector('aside.side[aria-label="Outcome"]')?.textContent ?? '',
    meta: [...document.querySelectorAll('.frame .meta li')].map((li) => li.textContent),
    footer: [...document.querySelectorAll('footer a')].map((a) => [a.textContent, a.href]),
    old: document.querySelectorAll('[data-region], [data-testid="map"], [role="application"]').length,
    titleFont: getComputedStyle(document.querySelector('#sess-title')).fontFamily,
    geist: document.fonts.check('600 20px "Geist"'),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
}

/** The facts every viewer page must have; `fail` gets each problem. */
export function checkFacts(f, fail, where = 'viewer') {
  if (f.header !== 'Reasontrail') fail(`${where}: header is not the wordmark alone: ${JSON.stringify(f.header)}`);
  if (f.rows < 3) fail(`${where}: the list has ${f.rows} rows`);
  if (!f.outcome) fail(`${where}: no outcome box`);
  if (f.meta.includes('Sample')) fail(`${where}: a user session shows the Sample tag`);
  if (JSON.stringify(f.footer) !== JSON.stringify([['Made with Reasontrail', SITE], ['geekplux.com', MAKER]])) fail(`${where}: footer links ${JSON.stringify(f.footer)}`);
  if (f.old) fail(`${where}: ${f.old} elements of the pre-v7 map`);
  if (!/^"?Geist\b/.test(f.titleFont) || !f.geist) fail(`${where}: session title font ${f.titleFont}`);
}

/** Pick a step in the list: an episode opens, its first step's panel opens and the hash says `#step=<id>`; Esc closes
 * it and clears the hash; the deep link opens the same step again. Returns the step id. */
export async function stepRoundTrip(page, fail, where = 'viewer') {
  const ep = page.locator('[data-row^="ep:"][aria-expanded="false"]').first();
  if (await ep.count()) await ep.click();
  const row = page.locator('[data-row^="step:"]').first();
  if (!(await row.count())) return fail(`${where}: no step row after opening an episode`);
  const id = (await row.getAttribute('data-row')).slice('step:'.length);
  await row.click();
  await page.waitForSelector(`aside.detail[data-step="${id}"]`, { timeout: 5_000 }).catch(() => fail(`${where}: clicking step ${id} opened no panel`));
  const hash = await page.evaluate(() => location.hash);
  if (hash !== `#step=${encodeURIComponent(id)}`) fail(`${where}: hash after picking ${id}: ${hash}`);
  await page.locator('aside.detail h3').focus();
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => ({ panel: !!document.querySelector('aside.detail'), hash: location.hash, focus: document.activeElement?.getAttribute('data-row') }));
  if (closed.panel || closed.hash || closed.focus !== `step:${id}`) fail(`${where}: Esc: ${JSON.stringify(closed)}`);
  const url = page.url().replace(/#.*$/, '');
  await page.goto(`${url}#step=${encodeURIComponent(id)}`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' }); // a hash-only goto does not reload the page
  await page.waitForSelector(`aside.detail[data-step="${id}"]`, { timeout: 10_000 }).catch(() => fail(`${where}: the deep link #step=${id} opened no panel`));
  if (!(await page.locator('.hero-tree circle.ring').count())) fail(`${where}: the deep link draws no ring in the tree`);
  return id;
}
