// v7 phone and dark flow. At 390×844: no
// horizontal scroll, the tab track scrolls sideways with the legend under it, the outcome box sits above the list, the
// list has no header, # or Start column, the card header has no buttons (AI titles, Details and Share sit in a row
// after the final answer; Details names the branch), every font size is 12, 14, 20 or 32, axe clean; a list tap opens
// the panel with its top 16px under the screen's top and its title focused; focus on Details follows it across the
// breakpoint; `?session=planner-pivot` shows its selected tab whole in the track,
// and so does ←/→. At 768 and 1024: no horizontal scroll. At 1440 dark (2×): axe clean, every computed colour a Radix
// dark value, no line or shadow over 0.5px, no middle dot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axeProblems } from '../axe.mjs';
import { watchContext } from '../lib.mjs';

const SIZES = [12, 14, 20, 32];

/** The Radix values tokens.css declares for a theme, as computed-style `rgb(r, g, b)` strings. */
function radix(root, theme) {
  const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
  const at = css.indexOf('@media (prefers-color-scheme: dark)');
  const part = theme === 'dark' ? css.slice(at) : css.slice(0, at);
  return new Set([...part.matchAll(/--(?:slate|blue|orange)-\d+:\s*#([0-9a-f]{6})/gi)].map(([, h]) => `rgb(${[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`));
}

/** Font sizes, colours, line widths and middle dots on the page as rendered. */
const audit = (page) => page.evaluate(() => {
  const sizes = new Set();
  const colours = new Map();
  const widths = new Map();
  const shadows = new Map();
  const add = (v, el) => {
    if (!v || v === 'none' || v === 'transparent' || /^rgba\(.*, 0\)$/.test(v) || v.startsWith('url(')) return;
    if (!colours.has(v)) colours.set(v, `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}`);
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) sizes.add(parseFloat(cs.fontSize));
    add(cs.color, el);
    add(cs.backgroundColor, el);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs[`border${side}Width`]);
      if (w > 0 && cs[`border${side}Style`] !== 'none') {
        if (!widths.has(w)) widths.set(w, `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
        add(cs[`border${side}Color`], el);
      }
    }
    // Box shadows draw the 0.5px frames: every offset, blur and spread is at most 0.5px.
    if (cs.boxShadow !== 'none') {
      for (const s of cs.boxShadow.split(/,(?![^(]*\))/)) {
        const big = (s.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat).filter((v) => Math.abs(v) > 0.5);
        if (big.length && !shadows.has(s.trim())) shadows.set(s.trim(), `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}`);
      }
    }
    // Painted SVG shapes and text only: the root <svg> computes fill: black without painting anything.
    if (el instanceof SVGGeometryElement || el instanceof SVGTextContentElement) {
      add(cs.fill, el);
      add(cs.stroke, el);
    }
  }
  const dots = [document.body.innerText, ...[...document.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'))].filter((t) => t.includes('·'));
  return { sizes: [...sizes].sort((a, b) => a - b), colours: [...colours], widths: [...widths], shadows: [...shadows], dots: dots.length };
});

export async function run({ page, baseURL, root, shot, log, fail }) {
  // Phone 390 × 844, light.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('.hero-tree svg[role="img"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  const m = await page.evaluate(() => {
    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const tabs = document.querySelector('.tabs');
    const visible = (sel) => [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length && el.getBoundingClientRect().width > 1).length;
    return {
      scroll: document.documentElement.scrollWidth,
      tree: box('.hero-tree svg.tree')?.width,
      treeText: document.querySelectorAll('.hero-tree svg.tree text').length,
      tabs: tabs ? { scrolls: tabs.scrollWidth > tabs.clientWidth, overflow: getComputedStyle(tabs).overflowX } : null,
      legendUnderTabs: !!document.querySelector('.under > .tabs + .legend') && !document.querySelector('.hero-tree > .legend'),
      resBottom: box('.frame .res')?.bottom,
      listTop: box('.frame .gl')?.top,
      answerTop: box('.frame .cols > .final')?.top,
      actions: [...document.querySelectorAll('.frame .cols + .sess-r button')].map((b) => b.textContent),
      listBottom: box('.frame .gl')?.bottom,
      columns: visible('.gl-head, .gl-num, .gl-at'),
      buttons: [...document.querySelectorAll('.frame .sess button')].map((b) => b.textContent),
      branch: [...document.querySelectorAll('.frame .sess .meta .code')].map((c) => c.textContent),
      meta: [...document.querySelectorAll('.frame .meta')].at(0)?.lastElementChild?.textContent,
      open: document.querySelector('.bar .btn.primary')?.textContent,
      frame: (() => { const f = box('.frame'); return f && { left: f.left, width: f.width, radius: getComputedStyle(document.querySelector('.frame')).borderRadius }; })(),
    };
  });
  log(JSON.stringify(m));
  if (!(m.scroll <= 390)) fail(`phone: the page scrolls sideways (${m.scroll}px wide at 390)`);
  if (Math.round(m.tree) !== 358 || m.treeText !== 0) fail(`phone: tree ${m.tree}px wide with ${m.treeText} text elements, not a bare 358px silhouette`);
  if (!m.tabs?.scrolls || m.tabs.overflow !== 'auto') fail(`phone: the tab track does not scroll sideways: ${JSON.stringify(m.tabs)}`);
  if (!m.legendUnderTabs) fail('phone: the legend is not under the tabs');
  if (!(m.resBottom < m.listTop)) fail(`phone: the outcome box (bottom ${m.resBottom}) is not above the list (top ${m.listTop})`);
  if (!(m.answerTop > m.listBottom)) fail('phone: the final answer is not under the list');
  if (m.columns) fail(`phone: the list shows ${m.columns} header, # or Start cells`);
  if (m.buttons.length) fail(`phone: header buttons in the card: ${m.buttons.join(', ')}`);
  if (m.actions.join() !== 'AI titles,Details,Share') fail(`phone: the actions after the final answer are ${JSON.stringify(m.actions)}`);
  if (m.branch.length) fail(`phone: the meta line shows the branch ${m.branch.join(', ')}`);
  if (m.meta !== 'Sample') fail(`phone: the meta line ends with ${JSON.stringify(m.meta)}, not the Sample tag`);
  if (m.open !== 'Open session') fail(`phone: the header button reads ${JSON.stringify(m.open)}`);
  if (m.frame?.left !== 0 || m.frame.width !== 390 || m.frame.radius !== '0px') fail(`phone: the card is not full-bleed: ${JSON.stringify(m.frame)}`);
  const phone = await audit(page);
  const odd = phone.sizes.filter((s) => !SIZES.includes(s));
  if (odd.length) fail(`phone: font sizes outside 12/14/20/32: ${odd.join(', ')}`);
  if (phone.dots) fail('phone: middle dot in the text or an aria-label');
  if (phone.shadows.length) fail(`phone: shadows over 0.5px: ${phone.shadows.map(([s, el]) => `${s} (${el})`).join(', ')}`);
  for (const p of await axeProblems(page, 'v7 phone 390', 'all')) fail(p);
  await shot('v7phone-390');

  // Details in the actions row opens under it and names the branch (the meta line leaves it out on the phone).
  await page.click('.frame .cols + .sess-r button:nth-child(2)');
  const det = await page.evaluate(() => ({ text: document.querySelector('.frame .sess-r + .details:not([hidden])')?.innerText ?? '', scroll: document.documentElement.scrollWidth }));
  if (!det.text.includes('phase-12-structure-redact') || det.scroll > 390) fail(`phone Details: ${JSON.stringify(det)} (want the branch under the actions row, no sideways scroll)`);
  await page.click('.frame .cols + .sess-r button:nth-child(2)');

  // Focus on Details follows it across the breakpoint: the header's Details at 800, the row's again at 390.
  await page.focus('.frame .cols + .sess-r button:nth-child(2)');
  const focusAt = async (width) => {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(150);
    return page.evaluate(() => { const a = document.activeElement; return { text: a?.textContent, header: !!a?.closest('.sess'), row: !!a?.closest('.cols + .sess-r') }; });
  };
  const wide = await focusAt(800);
  if (wide.text !== 'Details' || !wide.header) fail(`breakpoint: at 800 focus is on ${JSON.stringify(wide)}, not the header's Details`);
  const back = await focusAt(390);
  if (back.text !== 'Details' || !back.row) fail(`breakpoint: back at 390 focus is on ${JSON.stringify(back)}, not the row's Details`);
  await page.evaluate(() => scrollTo(0, 0));

  // A tap on a list step opens the panel above the list with its title focused and on screen.
  const ep = await page.evaluate(() => [...document.querySelectorAll('.gl-episode')].find((r) => /^Episode 6\b/.test(r.textContent))?.dataset.row);
  await page.click(`[data-row="${ep}"]`);
  await page.waitForSelector('[data-row="step:s41"]');
  await page.locator('[data-row="step:s41"]').scrollIntoViewIfNeeded();
  await page.click('[data-row="step:s41"]');
  await page.waitForSelector('.detail .d-h');
  const tap = await page.evaluate(() => {
    const h = document.querySelector('.detail .d-h');
    const r = h.getBoundingClientRect();
    const x = document.querySelector('.detail .iconbtn').getBoundingClientRect();
    return { focused: document.activeElement === h, top: r.top, bottom: r.bottom, panel: document.querySelector('.detail').getBoundingClientRect().top, close: x.top };
  });
  log(JSON.stringify({ tap }));
  if (!tap.focused || tap.top < 0 || tap.bottom > 844) fail(`phone list tap: the panel title is not focused on screen: ${JSON.stringify(tap)}`);
  // The panel's top (context line and ✕) sits 16px under the screen's top, not cut off above it.
  if (Math.abs(tap.panel - 16) > 2 || tap.close < 0) fail(`phone list tap: the panel top is at ${tap.panel} and the close button at ${tap.close} (want the panel at 16, the ✕ whole)`);
  await page.keyboard.press('Escape');
  if ((await page.evaluate(() => document.activeElement?.dataset.row)) !== 'step:s41') fail('phone list tap: Esc did not return focus to the row');

  // A deep link to the last tab, then ←/→: the selected tab shows whole inside the scrolling track.
  await page.goto(`${baseURL}/?session=planner-pivot`, { waitUntil: 'load' });
  await page.waitForSelector('.hero-tree svg[role="img"]', { timeout: 10_000 });
  const tabIn = () => page.evaluate(() => {
    const t = document.querySelector('.tabs').getBoundingClientRect();
    const s = document.querySelector('.tab[aria-selected="true"]').getBoundingClientRect();
    return { whole: s.left >= t.left - 0.5 && s.right <= t.right + 0.5, page: scrollY };
  });
  const deep = await tabIn();
  if (!deep.whole || deep.page !== 0) fail(`phone tabs: ?session=planner-pivot ${JSON.stringify(deep)} (want the selected tab whole in the track, the page not scrolled)`);
  await page.focus('.tab[aria-selected="true"]');
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
    if (!(await tabIn()).whole) fail(`phone tabs: after ${key} the focused tab is cut by the track`);
  }

  // A selected step on the phone: the detail panel takes the outcome box's place above the list; Esc closes it.
  await page.goto(`${baseURL}/?step=s41`, { waitUntil: 'load' });
  await page.waitForSelector('.detail pre', { timeout: 10_000 });
  const st = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, above: document.querySelector('.frame .cols > .detail + .gl') !== null, res: !!document.querySelector('.frame .res') }));
  if (st.scroll > 390 || !st.above || st.res) fail(`phone step: ${JSON.stringify(st)} (want no sideways scroll, the panel above the list in place of the outcome box)`);
  await page.focus('.detail .d-title .d-h');
  await page.keyboard.press('Escape');
  if (await page.locator('.detail').count()) fail('phone step: Esc did not close the panel');

  // Intermediate widths stack without a sideways scroll.
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > width) fail(`${width}: the page scrolls sideways (${w}px wide)`);
  }

  // Desktop dark, 1440 × 900, at 2× (the lines as a retina screen draws them; computed border widths still read 1px).
  const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  watchContext(ctx, baseURL, { push: fail }); // console errors and off-origin requests, as in the harness
  try {
    await dark2x(await ctx.newPage(), { baseURL, root, shot, log, fail });
  } finally {
    await ctx.close();
  }
}

async function dark2x(page, { baseURL, root, shot, log, fail }) {
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('.hero-tree svg[role="img"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  const dark = await audit(page);
  const allowed = radix(root, 'dark');
  const off = dark.colours.filter(([c]) => !allowed.has(c));
  log(JSON.stringify({ colours: dark.colours.length, widths: dark.widths, sizes: dark.sizes }));
  if (off.length) fail(`dark: colours outside the Radix dark scales: ${off.map(([c, el]) => `${c} (${el})`).join(', ')}`);
  // Chrome computes a 0.5px border as 1px at any device scale (border-width snapping); anything wider is a real line.
  // (Checked: Chrome reports 1px for a 0.5px border at 1× and at 2× alike, so 1 is the tightest bound it allows.)
  const thick = dark.widths.filter(([w]) => w > 1);
  if (thick.length) fail(`dark: border widths over 0.5px: ${thick.map(([w, el]) => `${w}px (${el})`).join(', ')}`);
  if (dark.shadows.length) fail(`dark: shadows over 0.5px: ${dark.shadows.map(([s, el]) => `${s} (${el})`).join(', ')}`);
  if (dark.sizes.some((s) => !SIZES.includes(s))) fail(`dark: font sizes ${dark.sizes.join(', ')}`);
  if (dark.dots) fail('dark: middle dot in the text or an aria-label');
  for (const p of await axeProblems(page, 'v7 home 1440 dark', 'all')) fail(p);
  await shot('v7home-1440-dark', page);

  // The hover tooltip, then a selected step (blue path, callout, the detail panel with its code boxes), in dark.
  const at = await page.evaluate(() => {
    const b = document.querySelector('.hero-tree [data-part="branch:e19"]');
    const p = b?.getPointAtLength(b.getTotalLength() * 0.3);
    const k = b?.getScreenCTM();
    return p && k ? { x: k.a * p.x + k.c * p.y + k.e, y: k.b * p.x + k.d * p.y + k.f } : null;
  });
  if (at) await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(400);
  const hover = await audit(page);
  await page.mouse.move(5, 5);
  await page.goto(`${baseURL}/?step=s41`, { waitUntil: 'load' });
  await page.waitForSelector('.detail pre', { timeout: 10_000 });
  const step = await audit(page);
  for (const [state, a] of [['tooltip', hover], ['step', step]]) {
    const bad = a.colours.filter(([c]) => !allowed.has(c));
    if (bad.length) fail(`dark ${state}: colours outside the Radix dark scales: ${bad.map(([c, el]) => `${c} (${el})`).join(', ')}`);
  }
  if (!at || !(await page.locator('.callout').count())) fail('dark: no tooltip target or no callout for s41');
  for (const p of await axeProblems(page, 'v7 step 1440 dark', 'all')) fail(p);
}
