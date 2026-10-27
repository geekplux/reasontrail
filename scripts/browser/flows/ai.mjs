// AI titles flow, from the session card's "AI titles": vite preview has no Worker, so the
// opt-in ends in the calm "unavailable" note; with `page.route('**/api/structure')` fakes: zero /api requests
// before consent, exactly ⌈n/200⌉ ≤ 5 after it, the modal dialog (focus inside, Esc returns focus), a 12px tag beside
// each titled episode row and a ring on the same episodes in the tree, X3 wording ("suggested by <model>") on every row
// and in the line under the list, toggling off restores the plain list and tree (DOM compare), the card does not move,
// deuteranopia and axe, axe at 390 light and dark with the overlay on. Then the CLI's `--ai --yes --api <local fake>` page from file://: AI titles is an off-by-default
// toggle, no consent and no requests. Fixture data.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STRUCTURE_RULES, axeProblems } from '../axe.mjs';
import { applyCvd } from '../cvd.mjs';

const MODEL = 'fake-model-1';
const UNAVAILABLE = "AI titles aren't available here; the map still works.";

/** Labels by position in the batch, so episodes get different tags (an episode shows its most conclusive one). */
const RUNS = ['sub-question', 'hypothesis', 'evidence', 'dead end', 'evidence', 'decision', 'hypothesis', 'evidence'];

/** A deterministic answer for one batch: a label per run of steps, and the last assistant step as a claim supported
 * by a few earlier steps plus one id that is not in the batch (which must never be drawn). */
function fakeAnswer(body) {
  const steps = body.steps ?? [];
  const word = (i) => RUNS[Math.floor((i * RUNS.length) / steps.length)] ?? 'evidence';
  const claim = [...steps].reverse().find((s) => s.kind === 'assistant') ?? steps[steps.length - 1];
  const earlier = steps.filter((s) => s !== claim);
  const pick = [0.1, 0.35, 0.6, 0.85].map((f) => earlier[Math.floor(f * earlier.length)]?.id).filter(Boolean);
  return {
    model: MODEL,
    cached: false,
    labels: steps.map((s, i) => ({ stepId: s.id, label: s === claim ? 'answer' : word(i), confidence: 0.7 })),
    links: claim ? [{ claimStepId: claim.id, supportStepIds: [...new Set(pick), 'ghost-step'] }] : [],
  };
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.gl [role="treeitem"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** The plain map: the list and the tree (the AI titles button itself excluded; the tree's remembered hover path, drawn
 * transparent so it can fade, is emptied). */
const snapshot = (page) => page.evaluate(() => ['.gl', '.hero-tree svg.tree'].map((s) => {
  const el = document.querySelector(s)?.cloneNode(true);
  el?.querySelector('.hv-path')?.replaceChildren();
  return el?.outerHTML.replace(/ hvmode/g, '') ?? `(no ${s})`;
}).join('\n'));
const button = (page) => page.locator('#session, .frame').first().getByRole('button', { name: 'AI titles', exact: true });

/** Runs the built CLI without blocking this process (the fake server answers from the same event loop). */
const runCli = (args, env) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
  child.on('close', (status) => {
    clearTimeout(timer);
    resolve({ status, stdout: out.trim(), stderr: err.trim() });
  });
});

export async function run({ page, baseURL, root, shot, log, fail }) {
  const api = [];
  page.on('request', (r) => new URL(r.url()).pathname.startsWith('/api/') && api.push(r.url()));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // AC3: the preview server has no Worker behind /api/structure.
  await open(page, `${baseURL}/?session=verify-fail-fix`);
  await button(page).click();
  await page.getByRole('button', { name: 'Send' }).click();
  const note = await page.waitForSelector('[data-ai-note="unavailable"]', { timeout: 15_000 }).then((n) => n.textContent(), () => '');
  if (note?.trim() !== UNAVAILABLE) fail(`AC3: unavailable note is "${note}"`);
  if ((await page.locator('.gl [role="treeitem"]').count()) < 1) fail('AC3: the list is gone after the failure');
  await shot('ai-unavailable');

  // AC1: fakes. Nothing is sent before consent.
  let posts = 0;
  await page.route('**/api/structure', async (route) => {
    posts++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeAnswer(route.request().postDataJSON())) });
  });
  await open(page, `${baseURL}/?session=verify-fail-fix`);
  api.length = 0;
  const before = await snapshot(page);
  const cardTop = await page.locator('#session .cols').evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  await button(page).focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('dialog.ai-dialog');
  await dialog.waitFor();
  if (!(await page.evaluate(() => document.querySelector('dialog.ai-dialog')?.matches(':modal')))) fail('V3: the consent dialog is not modal');
  if (!(await page.evaluate(() => document.activeElement?.textContent === 'Cancel'))) fail('V3: the dialog does not open on Cancel');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))))) fail(`V3: Tab ${i + 1} left the dialog`);
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  if (!(await page.evaluate(() => document.activeElement?.textContent === 'AI titles'))) fail('V3: Esc did not return focus to AI titles');
  if (api.length) fail(`AC1: ${api.length} /api requests before consent`);

  await button(page).click();
  await dialog.waitFor();
  const facts = (await dialog.textContent()) ?? '';
  const steps = Number(/([\d,]+) redacted step summar/.exec(facts)?.[1]?.replace(/,/g, '') ?? NaN);
  const batches = Number(/(\d+) requests?(, one after another)?/.exec(facts)?.[1] ?? NaN);
  log(`consent: ${steps} steps in ${batches} requests`);
  if (!(steps > 0) || batches !== Math.ceil(steps / 200) || batches > 5) fail(`AC1: ${steps} steps announced as ${batches} requests`);
  for (const w of [`${new URL(baseURL).origin}/api/structure`, 'cached per batch', 'Secrets, tokens, emails and home paths']) if (!facts.includes(w)) fail(`V3: the dialog does not say "${w}"`);
  if (facts.includes('·')) fail('V3: a "·" in the dialog');
  if (api.length) fail(`AC1: ${api.length} /api requests before consent`);
  for (const p of await axeProblems(page, 'ai consent')) fail(p);
  await shot('ai-consent');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForFunction(() => document.querySelector('#session .gl .ai-tag'), null, { timeout: 15_000 }).catch(() => fail('no tags after labelling'));
  if (api.length !== batches || posts !== batches) fail(`AC1: ${api.length} /api requests after consent, expected ${batches}`);
  if ((await button(page).getAttribute('aria-pressed')) !== 'true') fail('the overlay is not on after labelling');

  // AC2 / X3: a 12px tag beside each titled row, a ring on the same episodes in the tree, the model named.
  const m = await page.evaluate(() => {
    const tags = [...document.querySelectorAll('#session .gl .ai-tag')];
    const rows = tags.map((t) => t.closest('[data-row]')?.getAttribute('data-row')?.replace(/^ep:/, ''));
    const rings = [...document.querySelectorAll('.hero-tree .ai-ring')].map((r) => r.getAttribute('data-ai-ring'));
    const named = tags.map((t) => t.closest('[role="treeitem"]')?.textContent ?? '');
    const css = tags[0] ? getComputedStyle(tags[0]) : null;
    return { rows, rings, named, size: css?.fontSize, bg: css?.backgroundColor, kinds: [...new Set(tags.map((t) => t.textContent))], by: document.querySelector('#session .ai-by')?.textContent ?? '' };
  });
  log(`${m.rows.length} tags (${m.kinds.join(', ')}), ${m.rings.length} rings; "${m.by}"`);
  if (m.rows.length === 0 || [...m.rows].sort().join() !== [...m.rings].sort().join()) fail(`tags on ${m.rows} but rings on ${m.rings}`);
  if (m.size !== '12px') fail(`tag font size ${m.size}`);
  if (m.kinds.length < 3) fail(`the fake overlay shows only ${m.kinds.length} different tags`);
  if (m.named.some((n) => !n.includes(`AI title, suggested by ${MODEL}`))) fail('X3: a tagged row without "suggested by <model>"');
  if (m.by !== `AI titles suggested by ${MODEL}`) fail(`X3: the line under the list says "${m.by}"`);
  const top = await page.locator('#session .cols').evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  if (top !== cardTop) fail(`the overlay moves the list by ${top - cardTop}px`);
  await page.mouse.move(0, 0);
  await shot('ai-titles');
  for (const p of await axeProblems(page, 'ai titles on')) fail(p);
  await applyCvd(page, 'deuteranopia');
  await shot('ai-cvd-deuteranopia');
  await applyCvd(page, null);
  // The overlay on a 390 phone, light and dark: tags still beside the rows, axe clean; then back to 1440 light.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#session .gl .ai-tag')).catch(() => fail(`390 ${scheme}: no tags with the overlay on`));
    for (const p of await axeProblems(page, `ai titles on, 390 ${scheme}`)) fail(p);
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.querySelector('.hero-tree .ai-ring')).catch(() => fail('1440: no rings after the phone pass'));

  // Off restores the plain list and tree exactly.
  await button(page).click();
  await page.waitForFunction(() => !document.querySelector('.ai-tag, .ai-ring, .ai-by')).catch(() => fail('overlay marks remain with the overlay off'));
  const after = await snapshot(page);
  if (after !== before) {
    const i = [...after].findIndex((c, k) => c !== before[k]);
    fail(`AC1: the map with the overlay off differs from the map before it, at …${before.slice(Math.max(0, i - 120), i + 80)}… vs …${after.slice(Math.max(0, i - 120), i + 80)}…`);
  }
  await page.unroute('**/api/structure');

  // The CLI's --ai page: overlay embedded, toggle only, no requests from the page.
  const cli = join(root, 'cli', 'dist', 'cli.mjs');
  if (!existsSync(cli)) return fail('cli/dist/cli.mjs is missing: run pnpm build:cli');
  const tmp = join(root, '.tmp', 'ai-flow');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  let served = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      served++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(fakeAnswer(JSON.parse(body || '{}'))));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const out = join(tmp, 'map.html');
    const env = { PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp };
    const fixture = join(root, 'fixtures', 'sessions', 'claude-code', 'trouble.jsonl');
    const r = await runCli([cli, fixture, '--ai', '--yes', '--api', `http://127.0.0.1:${server.address().port}/api/structure`, '--no-open', '--out', out], env);
    log(`reasontrail --ai -> exit ${r.status}; ${r.stderr.split('\n').join(' | ')}`);
    if (r.status !== 0 || served < 1) fail(`CLI --ai: exit ${r.status}, ${served} requests to the fake`);
    const requests = [];
    page.on('request', (q) => !q.url().startsWith('file:') && !q.url().startsWith('data:') && requests.push(q.url()));
    await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
    await page.waitForSelector('.gl [role="treeitem"]', { timeout: 10_000 });
    const vt = page.getByRole('button', { name: 'AI titles', exact: true });
    await vt.waitFor({ timeout: 5_000 }).catch(() => fail('viewer: no AI titles toggle'));
    if ((await vt.getAttribute('aria-pressed')) !== 'false') fail('viewer: the overlay is on by default');
    if ((await vt.getAttribute('aria-haspopup')) !== null) fail('viewer: AI titles asks for consent although --ai already ran');
    await vt.click();
    await page.waitForSelector('.gl .ai-tag', { timeout: 3_000 }).catch(() => {});
    const [vtags, vrings] = await page.evaluate(() => [document.querySelectorAll('.gl .ai-tag').length, document.querySelectorAll('.hero-tree .ai-ring').length]);
    if (vtags < 1 || vrings !== vtags) fail(`viewer: ${vtags} tags and ${vrings} rings with the overlay on`);
    if (requests.length) fail(`viewer: requests ${requests.join(', ')}`);
    for (const p of await axeProblems(page, 'viewer ai', STRUCTURE_RULES)) fail(p);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(tmp, { recursive: true, force: true });
  }
}
