// v7 home flow (docs/design/v7/PROMPT.md §9, §13.5 phase 29): at 1440×900 the whole hero tree is above the fold; the
// header content, headline, tree root, tabs, card, install and footer share the 120px edge; no middle dot in rendered
// text or aria-labels; nothing above the session title in its card; every font size is 12, 14, 20 or 32; axe clean.
// Phase 32a: the tree is drawn by the renderer with its legend top right; hovering episode 7's branch shows the
// canvas tooltip and tints the same row in the list (§5.4).
import { axeProblems } from '../axe.mjs';

const SIZES = [12, 14, 20, 32];

export async function run({ page, baseURL, shot, log, fail }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('.hero-tree svg[role="img"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);

  const m = await page.evaluate(() => {
    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const left = (sel) => box(sel)?.left ?? NaN;
    const tree = box('.hero-tree');
    const title = document.querySelector('.frame h2');
    // Everything inside the card that comes before the title in document order.
    const card = document.querySelector('.frame');
    const before = card ? [...card.querySelectorAll('*')].filter((el) => title && el !== title && !el.contains(title) && el.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).map((el) => el.tagName) : ['no card'];
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (walker.currentNode.textContent.trim() && el && el.getClientRects().length) texts.push(parseFloat(getComputedStyle(el).fontSize));
    }
    const legend = box('.hero-tree > .legend');
    return {
      treeBottom: tree?.bottom ?? NaN,
      legend: legend && tree ? { right: Math.round(tree.right - legend.right), top: Math.round(legend.top - tree.top), text: document.querySelector('.hero-tree > .legend').textContent } : null,
      svg: document.querySelector('.hero-tree svg.tree')?.getAttribute('width'),
      edges: {
        header: left('.bar .brand'),
        headline: left('h1'),
        treeRoot: left('.hero-tree .tree .root'),
        tabs: left('.tabs'),
        card: left('.frame'),
        install: left('.install'),
        footer: left('.foot'),
      },
      dots: [document.body.innerText, ...[...document.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'))].filter((t) => t.includes('·')),
      before,
      sizes: [...new Set(texts)].sort((a, b) => a - b),
    };
  });
  log(JSON.stringify(m));
  if (m.legend?.text !== 'TaskExploreChangeVerifyAnswerCommandThinkingFailedWidth: tool calls' || m.legend.right !== 0 || m.legend.top !== 0) fail(`legend missing or not top right in the figure: ${JSON.stringify(m.legend)}`);
  if (m.svg !== '1200') fail(`tree drawn ${m.svg}px wide, not 1200`);
  if (!(m.treeBottom <= 900)) fail(`tree region ends at ${m.treeBottom}px, below the 900px fold`);
  for (const [name, x] of Object.entries(m.edges)) if (!(Math.abs(x - 120) <= 1)) fail(`${name} left edge at ${x}px, not on the 120px edge`);
  if (m.dots.length) fail(`middle dot in: ${m.dots.map((t) => JSON.stringify(t.slice(0, 80))).join(', ')}`);
  if (m.before.length) fail(`elements above the session title in its card: ${m.before.join(', ')}`);
  const odd = m.sizes.filter((s) => !SIZES.includes(s));
  if (odd.length) fail(`font sizes outside 12/14/20/32: ${odd.join(', ')}`);

  for (const p of await axeProblems(page, 'v7 home 1440')) fail(p);
  await shot('v7home-1440');

  // Hover episode 7's branch: a point on its outline, within 12px of its centreline.
  const at = await page.evaluate(() => {
    const b = document.querySelector('.hero-tree [data-part="branch:e19"]');
    if (!b) return null;
    const p = b.getPointAtLength(b.getTotalLength() * 0.3);
    const k = b.getScreenCTM();
    return { x: k.a * p.x + k.c * p.y + k.e, y: k.b * p.x + k.d * p.y + k.f };
  });
  if (!at) return fail('no branch for episode 7 (data-part="branch:e19")');
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(400); // the 250ms colour transitions
  const hv = await page.evaluate(() => ({
    mode: document.querySelector('.hero-tree svg.tree')?.classList.contains('hvmode'),
    tip: [...document.querySelectorAll('.hero-tree .tip text')].map((t) => t.textContent),
    row: document.querySelector('.gl-row.is-hv')?.textContent ?? '',
    rowBg: (() => { const r = document.querySelector('.gl-row.is-hv'); return r ? getComputedStyle(r, '::before').backgroundColor : ''; })(),
  }));
  log(JSON.stringify(hv));
  if (!hv.mode) fail('hovering episode 7\'s branch does not highlight its path');
  if (hv.tip.join('|') !== '7|Edit zz-verify-scratch.test.ts +8 more|20 steps, 6 tool calls, 15 min wait, 17 min') fail(`tooltip reads ${JSON.stringify(hv.tip)}`);
  if (!hv.row.startsWith('Episode 7: Edit zz-verify-scratch.test.ts +8 more')) fail(`list row not tinted for episode 7: ${JSON.stringify(hv.row.slice(0, 60))}`);
  if (!hv.rowBg || hv.rowBg === 'rgba(0, 0, 0, 0)') fail('the tinted list row has no hover background');
  await page.mouse.move(5, 5);
  const off = await page.evaluate(() => document.querySelector('.hero-tree svg.tree')?.classList.contains('hvmode') || !!document.querySelector('.gl-row.is-hv'));
  if (off) fail('pointer leave did not clear the hover');
}
