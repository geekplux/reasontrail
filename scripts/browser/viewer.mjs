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
    meta: [...document.querySelectorAll('.hero-top .meta li')].map((li) => li.textContent),
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

/** The session header in the hero (v7 §7, Home's hero geometry), at 1440×900: the h1 is the session title with
 * nothing above it in the hero, the tree starts 32px under `.hero-top` and ends inside the first screen (also with a
 * synthetic 120-character title), the card holds only `.cols`, and the wordmark, h1, tree, card and footer share the
 * 120px left edge. */
export async function checkLayout(page, fail, where = 'viewer') {
  await page.setViewportSize({ width: 1440, height: 900 });
  const measure = () => page.evaluate(() => {
    const box = (s) => document.querySelector(s)?.getBoundingClientRect();
    const hero = document.querySelector('main > .hero');
    const h1 = document.querySelector('h1');
    const first = hero?.querySelector('.hero-top');
    return {
      h1: h1?.id === 'sess-title' && !!first?.contains(h1),
      above: hero && h1 ? [...hero.querySelectorAll('*')].filter((e) => e.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING && !e.contains(h1) && e.getBoundingClientRect().height > 0).length : -1,
      gap: (box('.hero-tree')?.top ?? 0) - (box('.hero-top')?.bottom ?? 0),
      treeBottom: (box('.hero-tree svg.tree')?.bottom ?? 1e9) + window.scrollY,
      firstChild: document.querySelector('main > .frame')?.firstElementChild?.className,
      lefts: ['header.bar .wordmark', 'h1', '.hero-tree', 'main > .frame', 'footer'].map((s) => Math.round(box(s)?.left ?? -1)),
    };
  });
  const check = (m, what) => {
    if (!m.h1) fail(`${where}${what}: the h1 is not the session title in .hero-top`);
    if (m.above) fail(`${where}${what}: ${m.above} element(s) sit above the h1 in the hero`);
    if (Math.abs(m.gap - 32) > 1) fail(`${where}${what}: the tree is ${m.gap}px under .hero-top, not 32`);
    if (m.treeBottom > 900) fail(`${where}${what}: the tree ends at ${m.treeBottom}px, below the 900px fold`);
    if (m.firstChild !== 'cols') fail(`${where}${what}: the card's first child is ${m.firstChild}, not .cols`);
    if (m.lefts.some((x) => Math.abs(x - 120) > 1)) fail(`${where}${what}: left edges (wordmark, h1, tree, card, footer) ${m.lefts}`);
  };
  check(await measure(), '');
  const was = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const text = h1.textContent;
    h1.textContent = 'Refactor the session adapter so subagent lanes, retries and compaction markers survive a round trip through Share'.padEnd(120, '.').slice(0, 120);
    return text;
  });
  check(await measure(), ' (120-character title)');
  await page.evaluate((text) => { document.querySelector('h1').textContent = text; }, was);
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
