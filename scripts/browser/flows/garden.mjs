// Garden flow (phase 3): the encoding of docs/viz/garden.md measured in the real browser: stroke widths, caps,
// band colours, markers, remainder stubs, legend, value label on hover, path readout, mobile scroll, dark and CVD.
import { axeProblems } from '../axe.mjs';
import { applyCvd, MATRICES } from '../cvd.mjs';

const pct = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
const PROMPT = 'The old lighthouse keeper opened the door and';

async function open(page, baseURL, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseURL}/?sample=lighthouse`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Runs in the page: every spec rule that is visible in computed styles. Returns problem strings. */
function audit() {
  document.querySelector('.garden-key')?.setAttribute('open', ''); // the legend lives in the Key
  const problems = [];
  const fmt = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
  const token = (name) => {
    const probe = Object.assign(document.createElement('i'), { style: `color: var(${name})` });
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  };
  // Dash patterns scale with stroke width above 8 px, gaps stretched to end on a whole dash (scales.ts dashArray).
  const dashOk = (cs, [dash, gap]) => {
    const s = Math.max(1, parseFloat(cs.strokeWidth) / 8);
    const [d, g] = cs.strokeDasharray.split(',').map(parseFloat);
    return Math.abs(d - dash * s) < 0.02 && g >= (gap * s) / 2 && g <= gap * s * 1.5;
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
    const colour = state === 'not-recorded' ? '--slate-11' : { lo: '--slate-9', mid: '--slate-11', hi: '--slate-12' }[band];
    if (cs.stroke !== token(colour)) problems.push(`${key}: stroke ${cs.stroke} != ${colour}`);
    if (MARKER[state] !== marker) problems.push(`${key}: state ${state} has marker ${marker}`);
    if (state === 'not-recorded' ? !dashOk(cs, [4, 3]) : cs.strokeDasharray !== 'none') problems.push(`${key}: dash ${cs.strokeDasharray} on ${state}`);
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
      const inert = [r, r.querySelector('path'), r.querySelector('text')].every((e) => getComputedStyle(e).pointerEvents === 'none');
      if (!inert || r.querySelector('[tabindex]') || r.hasAttribute('tabindex')) problems.push(`remainder ${parent.key}: interactive`);
      const widest = Math.max(...kids.map((g) => parseFloat(getComputedStyle(g.querySelector('[data-role="branch-stroke"]')).strokeWidth)));
      if (parseFloat(getComputedStyle(r.querySelector('path')).strokeWidth) > widest + 0.01) problems.push(`remainder ${parent.key}: wider than its widest sibling ${widest}`);
      if (!dashOk(getComputedStyle(r.querySelector('path')), [2, 3])) problems.push(`remainder ${parent.key}: not dashed 2 3 (scaled)`);
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
  if (!other || !getComputedStyle(other).strokeDasharray.startsWith('2px, ') /* gap fitted to the 32 px sample */ || !other.closest('.legend-item').textContent.includes('other tokens'))
    problems.push('legend has no dashed "other tokens" sample');
  const unrec = document.querySelector('.legend [data-marker="ring"] [data-role="legend-not-recorded"]');
  if (!unrec || getComputedStyle(unrec).strokeDasharray !== '4px, 3px') problems.push('legend "not recorded" key has no 4 3 dashed sample');
  const keys = [...document.querySelectorAll('.legend [data-marker]')].map((e) => `${e.dataset.marker}:${e.textContent}`).join();
  if (keys !== 'bud:filled dot: can grow,knot:dot in a ring: grown,ring:hollow ring, dashed branch: not recorded,diamond:diamond, outlined branch: on the sampled path') problems.push(`legend marker key is ${keys}`);
  return problems;
}

export async function run({ page, baseURL, shot, log, fail }) {
  // Desktop, light.
  await open(page, baseURL, 1280, 800);
  // L4 / GA4: the Key is a closed disclosure that opens by keyboard (the audits below read the legend inside it).
  if (await page.locator('.garden-key').evaluate((d) => d.open)) fail('the Key is open on load');
  await page.locator('.garden-key summary').focus();
  await page.keyboard.press('Enter');
  if (!(await page.locator('.garden-key .legend-lead').isVisible())) fail('L4: Enter did not open the Key');
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
  if (!idle.startsWith(`Most likely: ${PROMPT}· looked`) || !/ path \d+\.\d%$/.test(idle)) fail(`default readout is ${idle}`);

  // Clicking the remainder stub changes nothing.
  const before = await page.locator('[data-testid="garden"]').innerHTML();
  const stub = await page.locator('[data-role="remainder"][data-parent=""] text').boundingBox();
  await page.mouse.click(stub.x + stub.width / 2, stub.y + stub.height / 2);
  if ((await page.locator('[data-testid="garden"]').innerHTML()) !== before) fail('clicking the remainder changed the garden');
  // Checked at rest: the lens head's 250 ms opacity fade-in blends its muted text while it runs.
  await page.waitForFunction(() => document.getAnimations().length === 0);
  for (const p of await axeProblems(page, 'light desktop')) fail(p);
  await shot('garden-desktop');

  // Hover the thinnest branch: the value label is computed from its data-p.
  const thin = await page.$$eval('[data-testid="garden"] g[data-state]', (gs) =>
    gs
      .map((g) => ({ key: g.dataset.key, p: Number(g.dataset.p), depth: Number(g.dataset.depth), w: parseFloat(getComputedStyle(g.querySelector('[data-role="branch-stroke"]')).strokeWidth) }))
      .sort((a, b) => a.w - b.w)[0],
  );
  const hover = async (b) => {
    await page.locator(`g[data-key="${b.key}"] [data-role="hit"]`).hover();
    const text = await page.locator(`[data-role="value-label"][data-key="${b.key}"]`).textContent();
    const want = b.depth > 1 ? new RegExp(`^${pct(b.p).replace('.', '\\.')}, path \\d+\\.\\d%$`) : new RegExp(`^${pct(b.p).replace('.', '\\.')}$`);
    log(`hover ${JSON.stringify(b.key)} p=${b.p}: "${text}"`);
    if (!want.test(text)) fail(`hover ${b.key}: value label "${text}" does not match data-p ${b.p}`);
    const reading = await readout.textContent();
    if (!reading.startsWith(`Reading: ${PROMPT}`) || !reading.includes(b.key.split(' ').pop())) fail(`hover ${b.key}: readout is ${reading}`);
  };
  await hover(thin);
  await shot('garden-hover-thin');

  // WCAG 1.4.13 hoverable: moving the pointer from the branch onto its value label keeps the label.
  const label = await page.locator(`[data-role="value-label"][data-key="${thin.key}"] rect`).boundingBox();
  await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 4 });
  if ((await page.locator(`[data-role="value-label"][data-key="${thin.key}"]`).count()) !== 1) fail('value label vanished when hovered');

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
