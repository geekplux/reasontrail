// v7 home flow (docs/design/v7/PROMPT.md §9, §13.5 phase 29): at 1440×900 the whole hero tree is above the fold; the
// header content, headline, tree root, tabs, card, install and footer share the 120px edge; no middle dot in rendered
// text or aria-labels; nothing above the session title in its card; every font size is 12, 14, 20 or 32; axe clean.
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
    return {
      treeBottom: tree?.bottom ?? NaN,
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
  if (!(m.treeBottom <= 900)) fail(`tree region ends at ${m.treeBottom}px, below the 900px fold`);
  for (const [name, x] of Object.entries(m.edges)) if (!(Math.abs(x - 120) <= 1)) fail(`${name} left edge at ${x}px, not on the 120px edge`);
  if (m.dots.length) fail(`middle dot in: ${m.dots.map((t) => JSON.stringify(t.slice(0, 80))).join(', ')}`);
  if (m.before.length) fail(`elements above the session title in its card: ${m.before.join(', ')}`);
  const odd = m.sizes.filter((s) => !SIZES.includes(s));
  if (odd.length) fail(`font sizes outside 12/14/20/32: ${odd.join(', ')}`);

  for (const p of await axeProblems(page, 'v7 home 1440')) fail(p);
  await shot('v7home-1440');
}
