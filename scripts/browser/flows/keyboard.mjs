// Keyboard flow (phase 5), keyboard only (never the mouse): one tab stop, tree keys reach the least probable branch
// at every level, Enter grows and collapses in place, tree ARIA in Chrome's AX tree, the live region, the Table view
// (same branches, same percentages), the sticky readout on phones, and axe.
import { axeProblems } from '../axe.mjs';

const pct = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
const branch = (key) => `g.branch[data-key="${key}"]`;
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-key') ?? document.activeElement?.textContent?.trim());
const visible = (page) => page.$$eval('g.branch', (gs) => gs.map((g) => ({ key: g.dataset.key, depth: Number(g.dataset.depth), p: Number(g.dataset.p), name: g.ariaLabel })));

async function open(page, baseURL, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseURL}/?sample=lighthouse`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Presses `key` until the focus is on `target` (at most 40 times); returns whether it got there. */
async function pressTo(page, key, target) {
  for (let i = 0; i < 40 && (await focused(page)) !== target; i++) await page.keyboard.press(key);
  return (await focused(page)) === target;
}

export async function run({ page, context, baseURL, shot, log, fail }) {
  const live = () => page.locator('[data-role="live"]').textContent();
  await open(page, baseURL, 1280, 800);

  // A1: Tab reaches the garden, on its first branch; the tree is one tab stop and the scroll wrapper none.
  if (!(await pressTo(page, 'Tab', ' looked'))) fail('Tab never reached the garden');
  if ((await page.locator('[role="treeitem"][tabindex="0"]').count()) !== 1 || (await page.locator('.garden-scroll[tabindex]').count())) fail('A1: tab stops');
  // Focus arriving by Tab selects the branch: its value label shows and it is the selected treeitem.
  const tabLabel = await page.locator('[data-role="value-label"][data-key=" looked"]').textContent().catch(() => null);
  if (!tabLabel?.startsWith('8.9%')) fail(`A1: Tab focus label on " looked" is ${tabLabel}`);
  if ((await page.evaluate(() => document.activeElement?.getAttribute('aria-selected'))) !== 'true') fail('A1: Tab-focused treeitem is not aria-selected');

  // A2: Chrome's accessibility tree has the named tree in tree order (aria-owns), not the drawing's paint order.
  const { nodes } = await (await context.newCDPSession(page)).send('Accessibility.getFullAXTree');
  const ax = new Map(nodes.map((n) => [n.nodeId, n]));
  const tree = nodes.find((n) => n.role?.value === 'tree');
  const order = tree.childIds.map((id) => ax.get(id)).filter((n) => n?.role?.value === 'treeitem').map((n) => n.name.value);
  const owned = await page.evaluate(() => document.querySelector('[role="tree"]').getAttribute('aria-owns').split(' ').map((id) => document.getElementById(id).ariaLabel));
  log(`AX: ${tree.name.value} > ${order.slice(0, 3).join(' | ')} …`);
  if (!tree.name.value.startsWith('Garden of next-token choices') || order.join('|') !== owned.join('|') || !order[1]?.startsWith('out,')) fail(`A2: AX order ${JSON.stringify(order)}`);
  const attrs = await page.getByRole('treeitem', { name: /^looked, 8\.9 percent, uncertainty after it: / }).evaluate((g) => ['level', 'setsize', 'posinset', 'expanded'].map((a) => g.getAttribute(`aria-${a}`)).join(' '));
  if (attrs !== '1 5 1 true') fail(`A2: " looked" has level/setsize/posinset/expanded ${attrs}`);

  // A1: arrows reach the least probable branch at every level; focus shows its value label and the focus ring.
  const branches = await visible(page);
  for (const depth of new Set(branches.map((b) => b.depth))) {
    const thin = branches.filter((b) => b.depth === depth).sort((a, b) => a.p - b.p)[0];
    await page.keyboard.press('Home');
    if (!(await pressTo(page, 'ArrowDown', thin.key))) fail(`A1: ArrowDown never reached ${JSON.stringify(thin.key)}`);
    const label = await page.locator(`[data-role="value-label"][data-key="${thin.key}"]`).textContent();
    log(`depth ${depth}: least probable ${JSON.stringify(thin.key)} focused, label ${label}`);
    if (!label?.startsWith(pct(thin.p))) fail(`A1: focus label on ${thin.key} is ${label}`);
    const ring = await page.locator(`${branch(thin.key)} [data-role="hit"]`).evaluate((r) => getComputedStyle(r).strokeWidth);
    if (ring !== '2px') fail(`A1: focus ring on ${thin.key} is ${ring}`);
  }
  await shot('keyboard-focus-thin');

  // Enter grows " entered" in place (focus stays, growth announced); Right: first child; Left, Left: collapsed, focused.
  await page.keyboard.press('Home');
  await pressTo(page, 'ArrowDown', ' entered');
  const top = () => page.locator(`${branch(' entered')} [data-role="hit"]`).evaluate((r) => r.getBoundingClientRect().top);
  const before = await top();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  const moved = (await top()) - before;
  if (Math.abs(moved) > 1 || (await page.locator(branch(' entered')).getAttribute('aria-expanded')) !== 'true' || (await focused(page)) !== ' entered') fail(`Enter: not grown in place (moved ${moved})`);
  log(`live region: ${await live()}`);
  if (!/^Grew ‘entered’: 5 branches, top ‘the’ \d+\.\d percent$/.test(await live())) fail(`live region says ${await live()}`);
  await page.keyboard.press('ArrowRight');
  if ((await focused(page)) !== ' entered the') fail(`ArrowRight focused ${await focused(page)}`);
  await page.waitForTimeout(300); // the new labels finish fading in
  await shot('keyboard-expanded');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  if ((await page.locator(branch(' entered')).getAttribute('aria-expanded')) !== 'false' || (await focused(page)) !== ' entered') fail('Left, Left: not collapsed with focus on it');
  // A branch outside the recording (depth 3, off the recorded spines): named so, and Enter says so.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); // grows the first child of " looked"
  await page.keyboard.press('ArrowRight');
  const name = await page.evaluate(() => document.activeElement?.ariaLabel);
  if (!name?.endsWith(', not in this recording')) fail(`A2: depth-3 branch is named ${name}`);
  await page.keyboard.press('Enter');
  const said = () => document.querySelector('[data-role="live"]').textContent.trim() === 'Not in this recording.';
  await page.waitForFunction(said, null, { timeout: 2_000 }).catch(async () => fail(`not recorded: live region says ${await live()}`));
  for (const p of await axeProblems(page, 'keyboard default')) fail(p);

  // A3: Tab to "Table view", Space: the table lists exactly the visible branches with the drawing's percentages.
  const tableView = async (label) => {
    if (!(await pressTo(page, 'Tab', 'Table view'))) return fail(`${label}: Tab never reached Table view`);
    await page.keyboard.press('Space');
    const rows = await page.$$eval('[data-role="table"] tbody tr', (trs) => trs.map((tr) => ({ key: tr.dataset.key, p: tr.querySelector('[data-role="p"]').textContent })));
    const names = new Map((await visible(page)).map((d) => [d.key, d.name]));
    const bad = rows.filter((r) => !names.get(r.key)?.includes(`, ${r.p.replace('<', 'less than ').replace('%', ' percent')}`));
    log(`${label}: ${rows.length} table rows, ${names.size} drawn`);
    if (rows.length !== names.size || bad.length) fail(`${label}: table rows ${JSON.stringify(bad)} differ from the drawing`);
    for (const p of await axeProblems(page, label)) fail(p);
    await page.locator('[data-role="table"]').evaluate((t) => t.scrollIntoView({ block: 'center' }));
  };
  await tableView('table view');
  await shot('table-view');

  // Phones (short screen): End scrolls the last branch into view above the sticky readout, never under it.
  await open(page, baseURL, 390, 380);
  await pressTo(page, 'Tab', ' looked');
  await page.keyboard.press('End');
  const [hit, readout] = await page.evaluate(() => [document.activeElement.querySelector('[data-role="hit"]'), document.querySelector('[data-role="readout"]')].map((e) => e.getBoundingClientRect().toJSON()));
  log(`mobile End: hit ${hit.top.toFixed(0)}–${hit.bottom.toFixed(0)}, readout top ${readout.top.toFixed(0)}`);
  if (hit.bottom > readout.top + 0.5 || hit.top < 0) fail('mobile: the focused branch is under the sticky readout or off screen');
  await page.setViewportSize({ width: 390, height: 844 });
  await tableView('table view mobile');
  if ((await page.evaluate(() => document.documentElement.scrollWidth)) > 390) fail('mobile: the table widens the page');
  await shot('table-view-mobile');
}
