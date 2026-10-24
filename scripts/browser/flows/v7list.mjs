// v7 git-style list flow (docs/design/v7/PROMPT.md §6, §9.5, §9.6; phase 30): the list root mark's left edge is the
// card's content edge; a keyboard-only run (Tab into the list, arrows, Enter) reaches the failed step of
// verify-fail-fix and selects it; axe is clean with that episode open; type sizes stay 12/14/20/32; no middle dot.
import { axeProblems } from '../axe.mjs';

const SIZES = [12, 14, 20, 32];

export async function run({ page, baseURL, shot, log, fail }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('.gl [role="tree"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);

  const edge = await page.evaluate(() => {
    const card = document.querySelector('.frame');
    const pad = parseFloat(getComputedStyle(card).paddingLeft);
    return { content: card.getBoundingClientRect().left + pad, root: document.querySelector('.gl-svg .m-root')?.getBoundingClientRect().left ?? NaN };
  });
  log(`list root ${JSON.stringify(edge)}`);
  if (!(Math.abs(edge.root - edge.content) <= 0.5)) fail(`list root mark at ${edge.root}px, card content edge at ${edge.content}px`);

  // Keyboard only: Tab until a row of the list has focus, then walk the tree.
  const label = () => page.evaluate(() => (document.activeElement?.getAttribute('role') === 'treeitem' ? document.activeElement.getAttribute('aria-label') : null));
  let tabs = 0;
  while (!(await label()) && tabs++ < 80) await page.keyboard.press('Tab');
  if (!(await label())) return fail('Tab never reached the list');
  const walk = async (test, what) => {
    for (let i = 0; i < 80; i++) {
      if (test((await label()) ?? '')) return true;
      await page.keyboard.press('ArrowDown');
    }
    fail(`ArrowDown never reached ${what}`);
    return false;
  };
  if (!(await walk((t) => t.includes('failed command'), 'an episode with a failed command'))) return;
  await page.keyboard.press('ArrowRight'); // open
  await page.keyboard.press('ArrowRight'); // first step
  if (!(await walk((t) => t.includes(', failed, '), 'the failed step'))) return;
  await page.keyboard.press('Enter');
  const picked = await page.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label'), selected: document.activeElement?.getAttribute('aria-selected'), ring: document.querySelectorAll('.gl-svg .ring').length }));
  log(`selected ${JSON.stringify(picked)}`);
  if (picked.selected !== 'true' || picked.ring !== 1) fail(`Enter did not select the failed step: ${JSON.stringify(picked)}`);

  const m = await page.evaluate(() => {
    const list = document.querySelector('.gl');
    const sizes = new Set();
    const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.textContent.trim()) sizes.add(parseFloat(getComputedStyle(walker.currentNode.parentElement).fontSize));
    const texts = [list.innerText, ...[...list.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'))];
    return { sizes: [...sizes], dots: texts.filter((t) => t.includes('·')) };
  });
  const odd = m.sizes.filter((s) => !SIZES.includes(s));
  if (odd.length) fail(`list font sizes outside 12/14/20/32: ${odd.join(', ')}`);
  if (m.dots.length) fail(`middle dot in the list: ${m.dots.map((t) => JSON.stringify(t.slice(0, 80))).join(', ')}`);

  for (const p of await axeProblems(page, 'v7 list, failed step selected')) fail(p);
  await shot('v7list-1440-step');
}
