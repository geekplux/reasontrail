// Map flow (phase 16): the glance of every committed sample against its `expect` block (M1, M2), collapsed side trails
// (M4), the honesty label (M5), unstored thinking (M6), label collisions and solid geometry (DM9, DM10), hit areas
// (DM24), the keyboard model and the outline toggle (G1), reduced motion (DM25), mobile (DM26), dark, CVD, the
// `tg:map-ready` budget (G2), and a CLI-written file:// map of a fixture. Screenshots go to the --out dir.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STRUCTURE_RULES, axeProblems } from '../axe.mjs';
import { applyCvd } from '../cvd.mjs';

const HONESTY = "Written reasoning is the agent's own account, not a record of how the model computed.";
const DIR = new URL('../../../src/sessions/samples/', import.meta.url);
const SAMPLES = ['implementer-checks', 'verify-fail-fix', 'planner-pivot'].map((id) => ({ id, g: JSON.parse(readFileSync(new URL(`${id}.graph.json`, DIR), 'utf8')) }));
const plain = (s) => s.replace(/\*\*|`/g, '');

async function open(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="map"][data-ready="true"][data-view="map"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450); // the draw-in ends by 400 ms
}

/** M1/M2, M4–M6 and the DOM-checkable DM items on the current page; `g` is the graph shown (with `expect` for samples). */
async function checkGlance(page, g, label, fail, log) {
  const regions = await page.$$eval('[data-region]', (els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-region'), e.textContent ?? ''])));
  if (Object.keys(regions).join() !== 'task,glance,route,trouble,outcome') fail(`${label}: regions ${Object.keys(regions)}`);
  const x = g.expect;
  // M1a / M5 / M6
  if (x && !plain(regions.task).includes(plain(x.task))) fail(`${label}: task card lacks "${x.task}"`);
  if (!regions.task?.includes(HONESTY) || !(await page.locator('[data-region="task"] [data-honesty] a', { hasText: 'How to read this map' }).isVisible())) fail(`${label}: honesty label`);
  if (!/\d+ tool calls?/.test(regions.task ?? '')) fail(`${label}: no tool-call count`);
  const unstored = g.steps.filter((s) => s.kind === 'thinking' && (s.textStored === false || !s.text?.trim())).length;
  if (unstored > 0 && !regions.task.includes(`${unstored} thinking (text not stored)`)) fail(`${label}: M6 unstored thinking not shown`);
  // M1b
  const eps = await page.locator('[data-region="route"] [data-episode-id]').count();
  if (eps < 1 || eps > 12) fail(`${label}: ${eps} route episodes`);
  // M1c / M2 trouble
  const blazes = await page.$$eval('[data-region="route"] [data-trouble-kind]', (els) => els.map((e) => ({ n: e.getAttribute('data-n'), name: e.getAttribute('aria-label') })));
  const count = blazes.reduce((a, b) => a + (/–/.test(b.n) ? Number(b.n.split('–')[1]) - Number(b.n.split('–')[0]) + 1 : 1), 0);
  const rows = await page.locator('[data-region="trouble"] li[data-trouble-kind]').count();
  if (x && (count !== x.trouble || rows !== x.trouble)) fail(`${label}: trouble ${count} blazes / ${rows} rows, expected ${x.trouble}`);
  if (blazes.some((b) => !/^Detected pattern/.test(b.name ?? ''))) fail(`${label}: a blaze lacks its text name`);
  // M1d / M2 outcome and final status
  for (const f of x?.files ?? []) if (!regions.outcome.includes(f)) fail(`${label}: destination lacks ${f}`);
  const verify = await page.locator('[data-glance="verify"]').textContent();
  const want = { ok: /^\s*Verified:/, error: /^\s*Not verified:/, unknown: /^\s*No verification run found/ }[x?.final ?? 'ok'];
  if (x && !want.test(verify ?? '')) fail(`${label}: verify row "${verify}" for final ${x.final}`);
  if (!/files? changed/.test(regions.outcome)) fail(`${label}: no files-changed count`);
  // M4: every subagent lane is drawn, collapsed
  const lanes = await page.$$eval('[data-lane-status]', (els) => els.map((e) => e.getAttribute('data-lane')));
  const top = g.lanes.filter((l) => l.spawnedBy && g.steps.find((s) => s.id === l.spawnedBy)?.laneId === g.lanes[0].id).length;
  if (lanes.join(' ').split(' ').filter(Boolean).length !== top) fail(`${label}: ${lanes.length} lane items for ${top} lanes`);
  // DM9: no two label boxes intersect; DM10: geometry solid; DM24: hit areas
  // A label box is its text's extent: a lane item's own box is a taller hit area that also covers its line.
  const boxes = await page.$$eval('.route-canvas .ep-text, .route-canvas .lane-item, .route-canvas .idle-label', (els) => els.map((e) => {
    const range = document.createRange();
    range.selectNodeContents(e);
    const [r, box] = [range.getBoundingClientRect(), e.getBoundingClientRect()];
    return [Math.max(r.left, box.left), Math.max(r.top, box.top), Math.min(r.right, box.right), Math.min(r.bottom, box.bottom), `${e.className}: ${e.textContent.trim().slice(0, 24)}`];
  }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    if (a[0] < b[2] - 0.5 && b[0] < a[2] - 0.5 && a[1] < b[3] - 0.5 && b[1] < a[3] - 0.5) fail(`${label}: labels overlap: "${a[4]}" and "${b[4]}"`);
  }
  // Trouble plates never cover label text (the text's own extent: a lane item's box is its taller hit area).
  const covered = await page.$$eval('.route-canvas .blaze', (plates) => {
    const text = [...document.querySelectorAll('.route-canvas .ep-text, .route-canvas .lane-item, .route-canvas .idle-label')].flatMap((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return [...r.getClientRects()].filter((b) => b.width > 0 && b.height > 0).map((b) => ({ b, what: e.className }));
    });
    // The plate and its badge, which overflows the 24 px box at the top right.
    return [...plates].flatMap((p) => [...p.querySelectorAll('.g-plate, .g-badge')].map((ink) => [p, ink.getBoundingClientRect()])).flatMap(([p, a]) => {
      return text.filter(({ b }) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5).map(({ what }) => `${p.getAttribute('data-n')} on ${what}`);
    });
  });
  if (covered.length) fail(`${label}: trouble plates cover labels: ${[...new Set(covered)].join(', ')}`);
  // WCAG 2.5.3: a lane item's visible text is part of its accessible name.
  const names = await page.$$eval('[role="application"] [data-lane-status]', (els) => els.filter((e) => !(e.getAttribute('aria-label') ?? '').includes(e.textContent.replace(/\s+/g, ' ').trim())).map((e) => `"${e.textContent.trim()}" vs "${e.getAttribute('aria-label')}"`));
  if (names.length) fail(`${label}: lane names lack their visible text: ${names.join('; ')}`);
  const dashed = await page.$$eval('.route-svg path', (ps) => ps.filter((p) => !['none', ''].includes(getComputedStyle(p).strokeDasharray)).length);
  if (dashed) fail(`${label}: ${dashed} route/lane paths have a dash pattern after the draw-in`);
  const small = await page.$$eval('[role="application"] [data-nav]', (els) => {
    const min = innerWidth < 768 ? 44 : 24;
    return els.filter((e) => { const r = e.getBoundingClientRect(); return r.width < min - 0.5 || r.height < min - 0.5; }).map((e) => e.getAttribute('data-nav'));
  });
  if (small.length) fail(`${label}: hit areas under the minimum: ${small.join(', ')}`);
  const tiny = await page.$$eval('[data-testid="map"] *', (els) => els.filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest('.visually-hidden, .g-badge-n, svg') && parseFloat(getComputedStyle(e).fontSize) < 11.5).length);
  if (tiny) fail(`${label}: ${tiny} text elements under 11.5 px`);
  log(`${label}: ${eps} episodes, ${lanes.length} lane items, ${blazes.length} blazes (${count} patterns)`);
}

export async function run({ page, baseURL, root, shot, log, fail }) {
  // G2: tg:map-ready on the website's first view, median of 3.
  const ready = [];
  for (let i = 0; i < 3; i++) {
    await open(page, `${baseURL}/`);
    ready.push(await page.evaluate(() => performance.getEntriesByName('tg:map-ready')[0]?.startTime ?? Infinity));
  }
  const median = ready.sort((a, b) => a - b)[1];
  log(`tg:map-ready ${ready.map((r) => r.toFixed(0)).join(', ')} ms; median ${median.toFixed(0)} ms`);
  if (!(median <= 2000)) fail(`tg:map-ready median ${median} ms > 2000`);

  for (const { id, g } of SAMPLES) {
    await open(page, `${baseURL}/?session=${id}`);
    await checkGlance(page, g, id, fail, log);
    const fold = await page.$$eval('[data-region="task"], [data-region="glance"], [data-region="route"]', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    if (fold.some((t) => t > 800)) fail(`${id}: a top region starts below the fold (${fold})`);
    if ((await page.$$eval('[data-glance]', (els) => els.filter((e) => e.getBoundingClientRect().bottom > innerHeight).length)) > 0) fail(`${id}: At a glance not fully in the first viewport`);
    for (const p of await axeProblems(page, `${id} desktop`, STRUCTURE_RULES)) fail(p);
  }

  // G1 keyboard: Tab reaches the map; arrows, Home/End, ] [ with wrap; keys do nothing outside the map.
  await open(page, `${baseURL}/`);
  const n = SAMPLES[0].g.trouble.length;
  let tabs = 0;
  while (tabs < 30 && !(await page.evaluate(() => !!document.activeElement?.closest('[role="application"]')))) {
    await page.keyboard.press('Tab');
    tabs++;
  }
  const at = () => page.evaluate(() => document.activeElement?.getAttribute('data-nav'));
  const first = await at();
  log(`Tab reached the map after ${tabs} presses, on ${first}`);
  if (!first?.startsWith('ep:')) fail(`Tab did not land on the first episode: ${first}`);
  await page.keyboard.press('ArrowRight');
  const second = await at();
  await page.keyboard.press('End');
  const end = await at();
  await page.keyboard.press('Home');
  if ((await at()) !== first || second === first || end === first) fail(`arrows/Home/End: ${first} → ${second} → ${end} → ${await at()}`);
  for (let i = 0; i <= n; i++) await page.keyboard.press(']');
  const live = await page.locator('[data-testid="map"] [role="status"]').textContent();
  if ((await page.evaluate(() => document.activeElement?.getAttribute('data-n'))) !== '1' || !/wrapped/.test(live ?? '')) fail(`] wrap: focus ${await at()}, live "${live}"`);
  await page.keyboard.press('Shift+Tab');
  const outside = await at();
  await page.keyboard.press(']');
  if ((await at()) !== outside) fail('] acted outside the map');
  const ring = await page.evaluate(() => {
    const el = document.querySelector('[role="application"] [tabindex="0"]');
    el?.focus();
    return getComputedStyle(el).outlineStyle;
  });
  if (ring === 'none') fail('the focused map item shows no focus ring');
  await page.getByRole('button', { name: 'Outline' }).click();
  await page.waitForSelector('[data-testid="map"][data-view="outline"]');
  if (!page.url().includes('view=outline')) fail(`outline toggle URL: ${page.url()}`);
  if ((await page.locator('[role="application"]').count()) !== 0) fail('outline still has the map widget');
  await page.reload();
  await page.waitForSelector('[data-testid="map"][data-view="outline"]');
  await page.getByRole('button', { name: 'Map' }).click();
  await page.waitForSelector('[data-testid="map"][data-view="map"]');
  if (!(await page.locator('a', { hasText: 'the next-token garden' }).getAttribute('href'))?.includes('sample')) fail('no link to the garden lens');

  // DM25: reduced motion draws everything at once.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  const motion = await page.evaluate(() => ({ dur: getComputedStyle(document.documentElement).getPropertyValue('--tg-dur-route').trim(), running: document.getAnimations().length }));
  if (!/^0m?s$/.test(motion.dur) || motion.running > 0) fail(`reduced motion: --tg-dur-route ${motion.dur}, ${motion.running} animations`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // DM26: mobile, vertical route, sticky destination bar, no sideways scroll; vertical keys.
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `${baseURL}/`);
  await checkGlance(page, SAMPLES[0].g, 'mobile', fail, log);
  const m = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    vertical: !!document.querySelector('.vroute'),
    rows: [...document.querySelectorAll('.vrow')].filter((r) => r.getBoundingClientRect().height < 43.5).length,
    bar: (() => { const r = document.querySelector('.dest-bar')?.getBoundingClientRect(); return r ? r.bottom <= innerHeight + 0.5 && r.top < innerHeight : false; })(),
    glance: [...document.querySelectorAll('[data-glance]')].every((e) => e.getBoundingClientRect().bottom <= innerHeight - 56),
  }));
  if (m.overflow > 0 || !m.vertical || m.rows || !m.bar || !m.glance) fail(`mobile: ${JSON.stringify(m)}`);
  await page.locator('[role="application"] [tabindex="0"]').focus();
  const top = await at();
  await page.keyboard.press('ArrowDown');
  if ((await at()) === top) fail('mobile: ArrowDown did not move along the vertical route');
  await page.keyboard.press('ArrowUp');
  for (const p of await axeProblems(page, 'mobile', STRUCTURE_RULES)) fail(p);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await shot('map-mobile');
  await open(page, `${baseURL}/?session=verify-fail-fix`);
  await checkGlance(page, SAMPLES[1].g, 'mobile lanes', fail, log);
  await shot('map-mobile-lanes', page.locator('[data-region="route"]'));

  // 320×225 (a phone in landscape at 400% zoom): Tab and the arrows never land on an item the sticky bar covers.
  await page.setViewportSize({ width: 320, height: 225 });
  await open(page, `${baseURL}/?session=verify-fail-fix`);
  const covered = [];
  const hidden = () => page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    const bar = document.querySelector('.dest-bar');
    const b = bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect() : null;
    const off = r.bottom <= 0 || r.top >= innerHeight;
    const under = b && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5 && el !== bar && !bar.contains(el);
    return off || under ? el.getAttribute('data-nav') ?? el.textContent?.trim().slice(0, 30) : null;
  });
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const h = await hidden();
    if (h) covered.push(`Tab ${i + 1}: ${h}`);
    if (await page.evaluate(() => !!document.activeElement?.closest('[role="application"]'))) break;
  }
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('ArrowDown');
    const h = await hidden();
    if (h) covered.push(`ArrowDown ${i + 1}: ${h}`);
  }
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const h = await hidden();
    if (h) covered.push(`Tab after map ${i + 1}: ${h}`);
  }
  if (covered.length) fail(`320×225: focused items hidden: ${covered.join('; ')}`);
  else log('320×225: every focused item visible');

  // Dark and CVD (desktop, default sample).
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, `${baseURL}/`);
  for (const p of await axeProblems(page, 'dark', STRUCTURE_RULES)) fail(p);
  await shot('map-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, `${baseURL}/?session=verify-fail-fix`);
  for (const type of ['protanopia', 'deuteranopia', 'tritanopia']) {
    await applyCvd(page, type);
    await shot(`map-cvd-${type}`);
  }
  await applyCvd(page, null);
  // Grayscale: every encoding must survive without colour.
  await open(page, `${baseURL}/?session=verify-fail-fix`);
  await page.addStyleTag({ content: 'html { filter: grayscale(1); }' });
  await shot('map-verify-fail-fix-grayscale');

  // The CLI's file:// map of a fixture with a subagent lane (and one with trouble), in a sandboxed HOME.
  const cli = join(root, 'cli', 'dist', 'cli.mjs');
  if (!existsSync(cli)) return fail('cli/dist/cli.mjs is missing: run pnpm build:cli');
  const sb = join(root, '.tmp', 'map-sandbox');
  rmSync(sb, { recursive: true, force: true });
  mkdirSync(join(sb, 'home'), { recursive: true });
  const fixtures = join(root, 'fixtures', 'sessions', 'claude-code');
  const views = SAMPLES.map(({ id }) => ({ id, url: `${baseURL}/?session=${id}` }));
  for (const name of readdirSync(fixtures).filter((f) => /^(subagent|trouble|idle-lane)\.jsonl$/.test(f))) {
    const out = join(sb, `${name}.html`);
    const r = spawnSync(process.execPath, [cli, join(fixtures, name), '--no-open', '--out', out], { env: { PATH: process.env.PATH, HOME: join(sb, 'home'), TMPDIR: sb }, encoding: 'utf8', timeout: 20_000 });
    if (r.status !== 0) {
      fail(`cli ${name}: exit ${r.status} ${r.stderr}`);
      continue;
    }
    const json = spawnSync(process.execPath, [cli, join(fixtures, name), '--json'], { env: { PATH: process.env.PATH, HOME: join(sb, 'home') }, encoding: 'utf8', maxBuffer: 1 << 26 });
    await open(page, pathToFileURL(out).href);
    await checkGlance(page, JSON.parse(json.stdout), `file ${name}`, fail, log);
    for (const p of await axeProblems(page, `file ${name}`, STRUCTURE_RULES)) fail(p);
    if (name === 'subagent.jsonl') await shot('map-local-file');
    else views.push({ id: name.replace('.jsonl', ''), url: pathToFileURL(out).href });
  }

  // DM38 screenshot matrix: every sample and the CLI trouble fixtures at 1280 and 390, light and dark, full page. A
  // full-page capture is one tall viewport, so the sticky destination bar is made static for it (it would otherwise sit
  // mid-page); the sticky bar itself is checked above.
  const full = {
    screenshot: async (o) => {
      const style = await page.addStyleTag({ content: '.dest-bar { position: static !important; }' });
      try {
        return await page.screenshot({ ...o, fullPage: true });
      } finally {
        await style.evaluate((e) => e.remove());
      }
    },
  };
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [size, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport);
      for (const { id, url } of views) {
        await open(page, url);
        await shot(`map-${id}-${size}${scheme === 'dark' ? '-dark' : ''}`, full);
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 800 });
}
