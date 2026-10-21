// Temperature flow (phase 7, docs/viz/garden.md §10.5): widths and labels follow the tempered chance with no network,
// tips never move, the approximation note, entropy labels and table columns, the seeded sampled path (reproducible,
// shareable, announced, CVD-safe, reduced motion), keyboard-only controls, and P4 (one slider step <= 100 ms).
import { axeProblems } from '../axe.mjs';
import { applyCvd } from '../cvd.mjs';
import { loadSample } from '../lib.mjs';

const width = (p) => 1.5 + 18.5 * Math.min(1, Math.max(0, p));
/** Same as src/llm/temperature.ts temper(), so the flow checks the page against the recording's logprobs. */
function temper(ps, r, t) {
  if (t === 1) return [...ps, Math.max(0, r)];
  if (t === 0) return [...ps.map((_, i) => (i === 0 ? 1 : 0)), 0];
  const rest = Math.max(0, r);
  const n = rest > 0 ? Math.max(1, Math.ceil(rest / Math.min(...ps.filter((p) => p > 0)) - 1e-9)) : 0; // hidden tokens
  const logs = [...ps.map((p) => (p > 0 ? Math.log(p) / t : -Infinity)), n > 0 ? Math.log(n) + Math.log(rest / n) / t : -Infinity];
  const e = logs.map((l) => Math.exp(l - Math.max(...logs)));
  return e.map((x) => x / e.reduce((s, y) => s + y, 0));
}
const entropy = (qs) => qs.reduce((h, q) => (q > 0 ? h - q * Math.log2(q) : h), 0);
const bandOf = (h) => (h < 1 ? 'low' : h < 2 ? 'medium' : 'high');
const slider = (page) => page.getByRole('slider', { name: 'Temperature' });

async function open(page, url, w = 1280, h = 800) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Every drawn number against the recording at temperature t; returns problems and the tip positions. */
async function audit(page, nodes, t) {
  const drawn = await page.evaluate(() => ({
    branches: [...document.querySelectorAll('g.branch')].map((g) => ({
      key: g.dataset.key,
      open: g.dataset.state === 'expanded',
      p: Number(g.dataset.p),
      rec: Number(g.dataset.pRecorded),
      w: parseFloat(getComputedStyle(g.querySelector('[data-role="branch-stroke"]')).strokeWidth),
      tip: [g.querySelector('[data-role="hit"]').getAttribute('x'), g.querySelector('[data-role="hit"]').getAttribute('y')].join(),
    })),
    rests: [...document.querySelectorAll('[data-role="remainder"]')].map((r) => ({ parent: r.dataset.parent, p: Number(r.dataset.p), w: parseFloat(getComputedStyle(r.querySelector('path')).strokeWidth) })),
  }));
  const problems = [];
  for (const parent of ['', ...drawn.branches.filter((b) => b.open).map((b) => b.key)]) {
    const ps = nodes[parent].map((c) => Math.exp(c.logprob));
    const q = temper(ps, 1 - ps.reduce((s, p) => s + p, 0), t);
    nodes[parent].forEach((c, i) => {
      const b = drawn.branches.find((x) => x.key === parent + c.token);
      if (!b) return;
      if (Math.abs(b.p - q[i]) > 0.00051 || Math.abs(b.rec - ps[i]) > 0.00051) problems.push(`${b.key}: data-p ${b.p} / recorded ${b.rec} != ${q[i]} / ${ps[i]}`);
      if (Math.abs(b.w - width(b.p)) > 0.01) problems.push(`${b.key}: stroke-width ${b.w} != ${width(b.p)}`);
    });
    const rest = drawn.rests.find((r) => r.parent === parent);
    if (rest && (Math.abs(rest.p - q.at(-1)) > 0.00051 || Math.abs(rest.w - width(rest.p)) > 0.01)) problems.push(`remainder ${parent}: ${rest.p} w ${rest.w} != ${q.at(-1)}`);
    if (!rest && q.at(-1) >= 0.0005 && 1 - ps.reduce((s, p) => s + p, 0) >= 0.0005) problems.push(`remainder ${parent}: missing`);
  }
  return { problems, tips: drawn.branches.map((b) => `${b.key}@${b.tip}`).sort().join('|') };
}

const sampledKeys = (page) => page.$$eval('[data-role="sampled-stroke"]', (ps) => ps.map((p) => [Number(p.dataset.sampledStep), p.closest('[data-key], [data-parent]')]).sort((a, b) => a[0] - b[0]).map(([, g]) => g.dataset.key ?? `other:${g.dataset.parent}`));

export async function run({ page, context, baseURL, shot, log, fail }) {
  const requests = [];
  context.on('request', (r) => !r.url().endsWith('/favicon.svg') && requests.push(r.url())); // the browser's own icon fetch
  const lighthouse = loadSample('lighthouse').nodes;
  await open(page, `${baseURL}/?sample=lighthouse`);
  requests.length = 0;

  // F7 + §10.5.3/4: the keyboard alone sets T (Home/End/arrows, preset); every width and label follows; tips never move.
  const settings = [[0.2, ['Home', 'ArrowRight', 'ArrowRight']], [1, null], [1.8, ['End', 'ArrowLeft', 'ArrowLeft']]];
  let tips = null;
  const others = {}; // §10.5.3a: "other" label text per parent at each T
  const otherLabels = () => page.$$eval('[data-role="remainder"]', (rs) => Object.fromEntries(rs.map((r) => [r.dataset.parent, r.querySelector('text').textContent])));
  for (const [t, keys] of settings) {
    if (keys) {
      await slider(page).focus();
      for (const k of keys) await page.keyboard.press(k);
    } else {
      await page.getByRole('button', { name: 'Temperature 1.0' }).focus();
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(250); // the 120 ms width transition
    const value = Number(await slider(page).inputValue());
    if (value !== t) fail(`slider is ${value}, expected ${t}`);
    const res = await audit(page, lighthouse, t);
    res.problems.forEach((p) => fail(`T ${t}: ${p}`));
    if (tips !== null && res.tips !== tips) fail(`T ${t}: tip positions moved`);
    tips = res.tips;
    others[t] = await otherLabels();
    const described = await slider(page).evaluate((s) => [...(s.getAttribute('aria-describedby') ?? '').split(' ')].map((id) => document.getElementById(id)?.textContent).join());
    if (described.includes('approximate (top-k only)') !== (t !== 1)) fail(`T ${t}: approximation note in description is "${described}"`);
    log(`T ${t}: ${res.problems.length} problems; note "${described}"`);
    await shot(`temp-${t.toFixed(1)}`);
  }
  const pct = (text) => Number(/other <?([\d.]+)%/.exec(text)?.[1] ?? NaN);
  for (const [parent, text] of Object.entries(others[0.2])) {
    if (pct(text) >= 100 || !(pct(text) <= pct(others[1][parent]))) fail(`§10.5.3a: "other" at ${JSON.stringify(parent)} reads "${text}" at T 0.2, "${others[1][parent]}" at T 1`);
  }
  if (!(pct(others[1.8]['']) > pct(others[1]['']))) fail(`root "other" at T 1.8 (${others[1.8]['']}) is not larger than at T 1 (${others[1]['']})`);
  log(`root "other": T 0.2 ${others[0.2]['']}, T 1 ${others[1]['']}, T 1.8 ${others[1.8]['']}`);
  if (requests.length) fail(`F7: ${requests.length} requests while changing temperature: ${requests.join(', ')}`);

  // §10.5.5: focus the expanded " looked" (Tab into the tree): its label carries the entropy of its fork.
  await page.locator('g.branch[data-key=" looked"]').focus();
  const label = await page.locator('[data-role="value-label"][data-key=" looked"]').textContent();
  const kids = await page.$$eval('g.branch[data-depth="2"]', (gs) => gs.filter((g) => g.dataset.key.startsWith(' looked')).map((g) => Number(g.dataset.p)));
  const rest = Number(await page.locator('[data-role="remainder"][data-parent=" looked"]').getAttribute('data-p').catch(() => 0));
  const h = entropy([...kids, rest]);
  if (!label.endsWith(`next ${h.toFixed(1)} bits, ${bandOf(h)}`)) fail(`entropy label "${label}" != ${h.toFixed(2)} bits`);
  await page.getByRole('button', { name: 'Table view' }).click();
  const heads = await page.$$eval('[data-role="table"] thead th', (ths) => ths.map((th) => th.textContent));
  if (!['Recorded', 'At T 1.8', 'Uncertainty after'].every((x) => heads.includes(x))) fail(`table headers ${heads.join(', ')}`);
  await page.getByRole('button', { name: 'Table view' }).click();

  // The note link opens and focuses the How to read panel; Enter on the summary closes it again.
  await page.getByRole('link', { name: /approximate \(top-k only\)/ }).focus();
  await page.keyboard.press('Enter');
  const panel = await page.evaluate(() => [document.getElementById('how-to-read').open, document.activeElement?.tagName]);
  if (panel.join() !== 'true,SUMMARY') fail(`note link: panel open/focus ${panel}`);
  const words = (await page.locator('#how-to-read').textContent()).trim().split(/\s+/).length;
  if (words > 120) fail(`How to read has ${words} words`);
  for (const p of await axeProblems(page, 'how to read')) fail(p);
  await shot('how-to-read', page.locator('#how-to-read'));
  await page.keyboard.press('Enter');
  if (await page.evaluate(() => document.getElementById('how-to-read').open)) fail('Enter on the summary did not close the panel');

  // F14 + F8: the link reopens T and the sampled path; reloading samples the same path; t=9 clamps to 2.
  const recipe = loadSample('recipe');
  await open(page, `${baseURL}/?sample=recipe&t=1.5&seed=7`);
  await page.waitForTimeout(600);
  const first = await sampledKeys(page);
  const readout = await page.locator('[data-role="sampled-readout"]').textContent();
  const said = (await page.locator('[data-role="live"]').textContent()).trim();
  log(`seed 7 at T 1.5: ${JSON.stringify(first)}; readout "${readout}"; live "${said}"`);
  if (Number(await slider(page).inputValue()) !== 1.5) fail('F14: slider not restored to 1.5');
  if (!first.length || !readout.startsWith(`Sampled (T 1.5, seed 7): ${recipe.prompt}`) || !readout.includes('stopped: ')) fail(`F8: readout "${readout}"`);
  if (!said.startsWith('Sampled (T 1.5, seed 7)') || !said.includes('stopped: ')) fail(`F8: live region "${said}"`);
  const markers = await page.$$eval('g.branch', (gs) => gs.filter((g) => g.querySelector('[data-role="sampled-stroke"]')).map((g) => g.dataset.marker));
  const stopped = readout.includes('outside the top') ? markers : markers.slice(0, -1);
  if (!stopped.every((m) => m === 'diamond') || (await page.locator('[data-role="sampled-underlay"]').count()) !== first.length) fail(`§10.5.7: markers ${markers}`);
  const colours = await page.$eval('[data-role="sampled-stroke"]', (p) => [getComputedStyle(p).stroke, getComputedStyle(p.previousElementSibling).stroke]);
  if (colours[0] === colours[1]) fail('accent and underlay share a colour');
  await shot('sampled-path');
  await applyCvd(page, 'deuteranopia');
  await shot('sampled-path-cvd-deuteranopia');
  await applyCvd(page, null);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]');
  if ((await sampledKeys(page)).join('|') !== first.join('|')) fail('F14: reloading the link sampled a different path');
  await page.getByRole('button', { name: 'Sample a path' }).focus();
  await page.keyboard.press('Enter');
  if ((await sampledKeys(page)).join('|') !== first.join('|')) fail('F8: same seed, different path');

  // Announced once per sample, after the walk; T = 0 samples the rank-0 chain; New seed changes the link.
  await page.evaluate(() => {
    window.tgSaid = 0;
    new MutationObserver(() => window.tgSaid++).observe(document.querySelector('[data-role="live"]'), { childList: true, characterData: true, subtree: true });
  });
  await page.getByRole('button', { name: 'Temperature 0 (greedy)' }).click();
  await page.waitForTimeout(800);
  const greedy = await sampledKeys(page);
  const chain = [];
  for (let k = ''; recipe.nodes[k] && chain.length < 12; ) chain.push((k += recipe.nodes[k][0].token));
  if (greedy.join('|') !== chain.slice(0, greedy.length).join('|') || !greedy.length) fail(`T 0: path ${JSON.stringify(greedy)} is not the rank-0 chain`);
  if ((await page.evaluate(() => window.tgSaid)) !== 1) fail(`announced ${await page.evaluate(() => window.tgSaid)} times, expected once`);
  await page.getByRole('button', { name: 'New seed' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const seed = Number(new URL(page.url()).searchParams.get('seed'));
  if (!(seed >= 1 && seed <= 9999)) fail(`New seed wrote seed=${seed}`);
  await open(page, `${baseURL}/?sample=recipe&t=9`);
  if (Number(await slider(page).inputValue()) !== 2) fail('t=9 does not clamp to 2');

  // §10.5.8: reduced motion draws the whole path on the first frame (no animation duration or delay).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await page.evaluate(async () => {
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Sample a path').click();
    await new Promise((r) => requestAnimationFrame(r));
    return [...document.querySelectorAll('[data-walk]')].map((e) => `${getComputedStyle(e).animationDuration}/${getComputedStyle(e).animationDelay}`);
  });
  if (!motion.length || motion.some((m) => m !== '0s/0s')) fail(`reduced motion: ${[...new Set(motion)]}`);
  await page.emulateMedia({ reducedMotion: null });

  // P4: the largest sample fully expanded; one slider step re-renders in <= 100 ms (median of 3), with no new layout.
  await open(page, `${baseURL}/?sample=recipe`);
  for (let i = 0; i < 80 && (await page.locator('g.branch[data-state="expandable"]').count()); i++) {
    await page.evaluate(() => document.querySelector('g.branch[data-state="expandable"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  }
  const step = await page.evaluate(async () => {
    const input = document.querySelector('input[type="range"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const layouts = performance.getEntriesByName('tg:layout').length;
    const times = [];
    for (const v of ['1.1', '1.2', '1.3']) {
      const t0 = performance.now();
      set.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-testid="garden"]').getBoundingClientRect();
      await new Promise((r) => requestAnimationFrame(r));
      times.push(performance.now() - t0);
    }
    return { times, branches: document.querySelectorAll('g.branch').length, relaid: performance.getEntriesByName('tg:layout').length - layouts };
  });
  const median = [...step.times].sort((a, b) => a - b)[1];
  log(`P4: ${step.branches} branches, slider steps ${step.times.map((x) => x.toFixed(1)).join(', ')} ms, median ${median.toFixed(1)}; layouts ${step.relaid}`);
  if (!(median <= 100)) fail(`P4: median ${median} ms > 100`);
  if (step.relaid !== 0) fail(`P4: ${step.relaid} layouts on slider steps (memo miss)`);

  // Mobile: controls wrap, no horizontal page overflow, axe clean.
  await open(page, `${baseURL}/?t=1.8&seed=7`, 390, 844);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`mobile: page overflows by ${overflow}px`);
  for (const p of await axeProblems(page, 'temperature mobile')) fail(p);
  await shot('temp-mobile');
}
