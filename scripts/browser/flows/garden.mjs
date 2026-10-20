// Garden flow (phase 3): the encoding of docs/viz/garden.md measured in the real browser: stroke widths, caps,
// band colours, markers, remainder stubs, legend, value label on hover, path readout, mobile scroll, dark and CVD.
import { axeProblems } from '../axe.mjs';
import { applyCvd, MATRICES } from '../cvd.mjs';

const pct = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
const PROMPT = 'The old lighthouse keeper opened the door and';

async function open(page, baseURL, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Runs in the page: every spec rule that is visible in computed styles. Returns problem strings. */
function audit() {
  const problems = [];
  const fmt = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
  const token = (name) => {
    const probe = Object.assign(document.createElement('i'), { style: `color: var(${name})` });
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  };
  const svg = document.querySelector('[data-testid="garden"]');
  if (svg.querySelector('title')) problems.push('garden contains a <title>');
  const MARKER = { expandable: 'bud', expanded: 'knot', 'not-recorded': 'ring' };
  const branches = [...svg.querySelectorAll('g[data-state]')];
  for (const g of branches) {
    const { key, p, state, band, marker } = g.dataset;
    const cs = getComputedStyle(g.querySelector('[data-role="branch-stroke"]'));
    const w = 1.5 + 18.5 * Number(p);
    if (Math.abs(parseFloat(cs.strokeWidth) - w) > 0.01) problems.push(`${key}: stroke-width ${cs.strokeWidth} != ${w}`);
    if (cs.strokeLinecap !== 'butt') problems.push(`${key}: linecap ${cs.strokeLinecap}`);
    if (g.classList.contains('on-path')) continue; // selected style: ink stroke on a paper casing
    const colour = state === 'not-recorded' ? '--tg-ink-muted' : `--tg-branch-${band}`;
    if (cs.stroke !== token(colour)) problems.push(`${key}: stroke ${cs.stroke} != ${colour}`);
    if (MARKER[state] !== marker) problems.push(`${key}: state ${state} has marker ${marker}`);
    const dash = state === 'not-recorded' ? '4px, 3px' : 'none';
    if (cs.strokeDasharray !== dash) problems.push(`${key}: dash ${cs.strokeDasharray} != ${dash}`);
    if (state !== 'not-recorded' && g.querySelector('.marker-ring')) problems.push(`${key}: hollow marker on ${state}`);
  }
  const forks = [{ key: '', depth: 0 }, ...branches.filter((g) => g.dataset.state === 'expanded').map((g) => ({ key: g.dataset.key, depth: Number(g.dataset.depth) }))];
  for (const parent of forks) {
    const kids = branches.filter((g) => Number(g.dataset.depth) === parent.depth + 1 && g.dataset.key.startsWith(parent.key));
    const expected = Math.max(0, 1 - kids.reduce((s, g) => s + Number(g.dataset.p), 0));
    const stubs = [...svg.querySelectorAll('[data-role="remainder"]')].filter((r) => r.dataset.parent === parent.key);
    if (stubs.length !== (expected >= 0.0005 ? 1 : 0)) problems.push(`remainder of ${JSON.stringify(parent.key)}: ${stubs.length} stubs`);
    for (const r of stubs) {
      const p = Number(r.dataset.p);
      if (Math.abs(p - expected) > 0.0005) problems.push(`remainder ${parent.key}: data-p ${p} != 1 - Σp = ${expected}`);
      if (r.textContent !== `other ${fmt(p)}`) problems.push(`remainder ${parent.key}: label ${r.textContent}`);
      if (getComputedStyle(r).pointerEvents !== 'none' || r.querySelector('[tabindex]') || r.hasAttribute('tabindex'))
        problems.push(`remainder ${parent.key}: interactive`);
      if (getComputedStyle(r.querySelector('path')).strokeDasharray !== '6px, 4px') problems.push(`remainder ${parent.key}: not dashed 6 4`);
    }
  }
  const samples = [...document.querySelectorAll('.legend [data-role="legend-sample"]')];
  if (samples.map((l) => fmt(Number(l.dataset.p))).join() !== '5.0%,25.0%,75.0%') problems.push('legend samples are not 5/25/75%');
  for (const l of samples) {
    const w = 1.5 + 18.5 * Number(l.dataset.p);
    if (Math.abs(parseFloat(getComputedStyle(l).strokeWidth) - w) > 0.01) problems.push(`legend sample ${l.dataset.p}: width != ${w}`);
    if (!l.closest('.legend-item').textContent.includes(fmt(Number(l.dataset.p)))) problems.push(`legend sample ${l.dataset.p}: no direct label`);
  }
  const other = document.querySelector('.legend [data-role="legend-other"]');
  if (!other || getComputedStyle(other).strokeDasharray !== '6px, 4px' || !other.closest('.legend-item').textContent.includes('other tokens'))
    problems.push('legend has no dashed "other tokens" sample');
  const keys = [...document.querySelectorAll('.legend [data-marker]')].map((e) => `${e.dataset.marker}:${e.textContent}`).join();
  if (keys !== 'bud:can grow,knot:grown,ring:not recorded') problems.push(`legend marker key is ${keys}`);
  return problems;
}

export async function run({ page, baseURL, shot, log, fail }) {
  // Desktop, light.
  await open(page, baseURL, 1280, 800);
  (await page.evaluate(audit)).forEach((p) => fail(`light: ${p}`));
  const fit = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="garden"]').getBoundingClientRect();
    const s = document.querySelector('.garden-scroll');
    return { bottom: r.bottom, right: r.right, scrolls: s.scrollWidth > s.clientWidth };
  });
  if (fit.bottom > 800 || fit.right > 1280 || fit.scrolls) fail(`desktop: garden does not fit without scrolling ${JSON.stringify(fit)}`);
  const readout = page.locator('[data-role="readout"]');
  const idle = await readout.textContent();
  log(`readout: ${idle}`);
  if (!idle.startsWith(`Most likely: ${PROMPT}·looked`) || !/ path \d+\.\d%$/.test(idle)) fail(`default readout is ${idle}`);

  // Clicking the remainder stub changes nothing.
  const before = await page.locator('[data-testid="garden"]').innerHTML();
  const stub = await page.locator('[data-role="remainder"][data-parent=""] text').boundingBox();
  await page.mouse.click(stub.x + stub.width / 2, stub.y + stub.height / 2);
  if ((await page.locator('[data-testid="garden"]').innerHTML()) !== before) fail('clicking the remainder changed the garden');
  for (const p of await axeProblems(page, 'light desktop')) fail(p);
  await shot('garden-desktop');

  // Hover the thinnest branch: the value label is computed from its data-p.
  const thin = await page.$$eval('[data-testid="garden"] g[data-state]', (gs) =>
    gs
      .map((g) => ({ key: g.dataset.key, p: Number(g.dataset.p), depth: Number(g.dataset.depth), w: Number(g.querySelector('[data-role="branch-stroke"]').getAttribute('stroke-width')) }))
      .sort((a, b) => a.w - b.w)[0],
  );
  const hover = async (b) => {
    await page.locator(`g[data-key="${b.key}"] [data-role="hit"]`).hover();
    const text = await page.locator(`[data-role="value-label"][data-key="${b.key}"]`).textContent();
    const want = b.depth > 1 ? new RegExp(`^${pct(b.p).replace('.', '\\.')} · path \\d+\\.\\d%$`) : new RegExp(`^${pct(b.p).replace('.', '\\.')}$`);
    log(`hover ${JSON.stringify(b.key)} p=${b.p}: "${text}"`);
    if (!want.test(text)) fail(`hover ${b.key}: value label "${text}" does not match data-p ${b.p}`);
    const reading = await readout.textContent();
    if (!reading.startsWith(`Reading: ${PROMPT}`) || !reading.includes(b.key.split(' ').pop())) fail(`hover ${b.key}: readout is ${reading}`);
  };
  await hover(thin);
  await shot('garden-hover-thin');

  // A depth-2 branch stays hovered for the CVD and dark screenshots, so the selected style is in every one.
  const deep = await page.$eval('g[data-key=" looked around"]', (g) => ({ key: g.dataset.key, p: Number(g.dataset.p), depth: 2 }));
  await hover(deep);
  for (const type of Object.keys(MATRICES)) {
    await applyCvd(page, type);
    await shot(`garden-cvd-${type}`);
  }
  await applyCvd(page, null);

  await page.emulateMedia({ colorScheme: 'dark' });
  (await page.evaluate(audit)).forEach((p) => fail(`dark: ${p}`));
  for (const p of await axeProblems(page, 'dark desktop')) fail(p);
  await shot('garden-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // Mobile: starts scrolled to the open fork, with all its children labels in view and a text cue.
  await page.mouse.move(0, 0);
  await open(page, baseURL, 390, 844);
  const mobile = await page.evaluate(() => {
    const s = document.querySelector('.garden-scroll');
    const box = s.getBoundingClientRect();
    const fork = document.querySelector('g[data-key=" looked"] [data-role="hit"]').getBoundingClientRect();
    const labels = [...document.querySelectorAll('g[data-depth="2"] text')].map((t) => t.getBoundingClientRect());
    const inside = [fork, ...labels].every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5);
    return { scrollLeft: s.scrollLeft, inside, cue: document.querySelector('.scroll-cue')?.textContent ?? null };
  });
  log(`mobile: ${JSON.stringify(mobile)}`);
  if (!(mobile.scrollLeft > 0) || !mobile.inside) fail(`mobile: open fork and its children are not in view ${JSON.stringify(mobile)}`);
  if (!mobile.cue?.includes('Scroll sideways')) fail('mobile: no scroll cue');
  (await page.evaluate(audit)).forEach((p) => fail(`mobile: ${p}`));
  for (const p of await axeProblems(page, 'light mobile')) fail(p);
  await shot('garden-mobile');
}
