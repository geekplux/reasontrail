// AI labels flow (phase 21): vite preview has no Worker, so the opt-in ends in the calm "unavailable" note (AC3);
// with `page.route('**/api/structure')` fakes: zero /api requests before consent, exactly ⌈n/200⌉ ≤ 5 after it, the
// modal dialog (focus inside, Esc returns focus), X3 wording on every label, claims linked to existing steps only,
// toggling the overlay off restores the deterministic map (DOM compare), deuteranopia and axe. Then the CLI's
// `--ai --yes --api <local fake>` page from file://: the overlay is a toggle, no consent and no requests. Fixture data.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STRUCTURE_RULES, axeProblems } from '../axe.mjs';
import { applyCvd } from '../cvd.mjs';

const MODEL = 'fake-model-1';
const UNAVAILABLE = "AI labels aren't available here; the map still works.";

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
  await page.waitForSelector('[data-testid="map"][data-ready="true"][data-view="map"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450); // the draw-in ends by 400 ms
}

/** The deterministic view: task, glance, route widget and the bottom band (the AI control itself is excluded). */
/** The route header is one line, and where the route widget starts (page coordinates). */
const header = (page) => page.evaluate(() => {
  const kids = [...(document.querySelector('.route-head')?.children ?? [])].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
  const app = document.querySelector('.route-app')?.getBoundingClientRect();
  return { oneLine: kids.length > 0 && Math.max(...kids.map((r) => r.top)) < Math.min(...kids.map((r) => r.bottom)), top: (app?.top ?? NaN) + window.scrollY };
});

const snapshot = (page) => page.evaluate(() => ['[data-region="task"]', '[data-region="glance"]', '.route-app', '.bottom-band'].map((s) => document.querySelector(s)?.outerHTML ?? `(no ${s})`).join('\n'));

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

  // AC3: the preview server has no Worker behind /api/structure.
  await open(page, `${baseURL}/?session=verify-fail-fix`);
  await page.getByRole('button', { name: 'AI labels…' }).click();
  await page.getByRole('button', { name: 'Send' }).click();
  const note = await page.waitForSelector('[data-ai-note="unavailable"]', { timeout: 15_000 }).then((n) => n.textContent(), () => '');
  if (note?.trim() !== UNAVAILABLE) fail(`AC3: unavailable note is "${note}"`);
  if ((await page.locator('[data-region="route"] [data-episode-id]').count()) < 1) fail('AC3: the map is gone after the failure');
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
  const opener = page.getByRole('button', { name: 'AI labels…' });
  await opener.focus();
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
  if (!(await page.evaluate(() => document.activeElement?.textContent === 'AI labels…'))) fail('V3: Esc did not return focus to the AI labels button');
  if (api.length) fail(`AC1: ${api.length} /api requests before consent`);

  await page.getByRole('button', { name: 'AI labels…' }).click();
  await dialog.waitFor();
  const facts = (await dialog.textContent()) ?? '';
  const steps = Number(/([\d,]+) redacted step summar/.exec(facts)?.[1]?.replace(/,/g, '') ?? NaN);
  const batches = Number(/(\d+) requests?, one after another/.exec(facts)?.[1] ?? NaN);
  log(`consent: ${steps} steps in ${batches} requests`);
  if (!(steps > 0) || batches !== Math.ceil(steps / 200) || batches > 5) fail(`AC1: ${steps} steps announced as ${batches} requests`);
  for (const w of [`${new URL(baseURL).origin}/api/structure`, 'cached per batch', 'Secrets, tokens, emails and home paths']) if (!facts.includes(w)) fail(`V3: the dialog does not say "${w}"`);
  if (api.length) fail(`AC1: ${api.length} /api requests before consent`);
  await shot('ai-consent');
  await page.getByRole('button', { name: 'Send' }).click();
  const toggle = page.getByRole('button', { name: `AI labels, suggested by ${MODEL}`, exact: true });
  await toggle.waitFor({ timeout: 15_000 });
  if (api.length !== batches || posts !== batches) fail(`AC1: ${api.length} /api requests after consent, expected ${batches}`);
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') fail('the overlay is not on after labelling');

  // AC2 / X3: every tag's episode names the model; the toggle (with its dashed swatch) says it too.
  const named = await page.$$eval('[data-region="route"] [data-episode-id]', (els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  const tagged = named.filter((n) => n.includes('AI labels'));
  const tags = await page.locator('.route-canvas .ai-tag').count();
  log(`${tags} episode tags`);
  if (tags === 0 || tagged.length !== tags) fail(`X3: ${tags} tags but ${tagged.length} items name them`);
  if (tagged.some((n) => !n.includes(`suggested by ${MODEL}`))) fail('X3: a label without "suggested by <model>"');
  if (!(await toggle.textContent())?.includes(`AI labels · suggested by ${MODEL}`)) fail('X3: the toggle does not say "suggested by <model>"');
  const kinds = new Set(await page.locator('.route-canvas .ai-tag').evaluateAll((els) => els.map((e) => e.getAttribute('data-ai-label'))));
  log(`tags: ${[...kinds].join(', ')}`);
  if (kinds.size < 3) fail(`the fake overlay shows only ${kinds.size} different tags`);
  if (await page.locator('.ai-links').count()) fail('supports curves on the glance');
  await page.mouse.move(0, 0);
  await shot('ai-labels');
  const on1440 = await header(page);

  // Off restores the deterministic view exactly.
  await toggle.click();
  await page.waitForFunction(() => !document.querySelector('.route-canvas .ai-tag')).catch(() => {});
  const after = await snapshot(page);
  if (after !== before) {
    const i = [...after].findIndex((c, k) => c !== before[k]);
    fail(`AC1: the map with the overlay off differs from the map before it, at …${before.slice(Math.max(0, i - 120), i + 80)}… vs …${after.slice(Math.max(0, i - 120), i + 80)}…`);
  }
  if (await page.locator('.ai-tag:not(.ai-swatch), .ai-links').count()) fail('overlay marks remain with the overlay off');
  // The overlay never adds a header row: one line, and the route widget does not move (1440×900 and 1280×800).
  const checkHeader = (size, on, off) => {
    if (!on.oneLine || !off.oneLine) fail(`${size}: the route header wraps (overlay on: ${on.oneLine}, off: ${off.oneLine})`);
    if (on.top !== off.top) fail(`${size}: the route widget moves ${on.top - off.top} px with the overlay on`);
  };
  checkHeader('1440×900', on1440, await header(page));
  await toggle.click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(150);
  const on1280 = await header(page);
  await toggle.click();
  const off1280 = await header(page);
  await toggle.click();
  checkHeader('1280×800', on1280, off1280);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(150);
  await shot('ai-labels-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // 390 px: the tag sits beside the item (aria-hidden), so the item's name still starts with its visible text (2.5.3).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobileTag = page.locator('.vrow > .ai-tag').nth(1);
  if (!(await mobileTag.count())) fail('390 px: no tags beside the route items');
  else await mobileTag.scrollIntoViewIfNeeded();
  if (await page.locator('.vitem .ai-tag').count()) fail('390 px: a tag inside a route item (its name would not match)');
  await shot('ai-labels-mobile');
  for (const p of await axeProblems(page, 'ai labels 390 px', ['label-content-name-mismatch'])) fail(p);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);

  // Claims link only to existing steps: select the final answer.
  await page.locator('[data-region="route"] [data-nav^="ep:"]').last().click();
  await page.waitForSelector('[data-testid="detail-panel"]');
  const curves = await page.locator('.ai-links').getAttribute('data-ai-links').catch(() => null);
  const supports = await page.locator('.ai-supports button').allTextContents();
  log(`answer selected: ${curves ?? 0} curves, ${supports.length} supporting steps`);
  if (!curves && supports.length === 0) fail('AC2: no supports for the selected answer');
  if (supports.some((t) => !/^Step \d+: /.test(t)) || supports.join().includes('ghost')) fail(`AC2: supports name a missing step: ${supports}`);
  const panelText = (await page.locator('[data-testid="detail-panel"] .ai-note').textContent()) ?? '';
  if (!panelText.includes(`suggested by ${MODEL}`)) fail('X3: the detail panel note lacks "suggested by <model>"');
  const dashed = await page.$$eval('svg *', (els) => els.filter((e) => (getComputedStyle(e).strokeDasharray || 'none') !== 'none' && !e.closest('.ai-links')).length);
  if (dashed) fail(`§8.7: ${dashed} dashed SVG lines outside the AI supports layer`);
  if (supports.length) {
    await page.locator('.ai-supports button').first().click();
    if (!/[?&]step=s\d+/.test(page.url())) fail(`a support link did not select a step: ${page.url()}`);
    await page.locator('[data-region="route"] [data-nav^="ep:"]').last().click();
    await page.waitForTimeout(200);
  }
  await shot('ai-support-links');
  for (const p of await axeProblems(page, 'ai labels on')) fail(p);
  await applyCvd(page, 'deuteranopia');
  await shot('ai-cvd-deuteranopia');
  await applyCvd(page, null);
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
    await page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 10_000 });
    const vt = page.getByRole('button', { name: /^AI labels, suggested by [^:]*$/ });
    await vt.waitFor({ timeout: 5_000 }).catch(() => fail('viewer: no AI labels toggle'));
    if ((await vt.getAttribute('aria-pressed')) !== 'false') fail('viewer: the overlay is on by default');
    if (await page.getByRole('button', { name: 'AI labels…' }).count()) fail('viewer: asks for consent although --ai already ran');
    await vt.click();
    await page.waitForSelector('.route-canvas .ai-tag', { timeout: 3_000 }).catch(() => {});
    if ((await page.locator('.route-canvas .ai-tag').count()) < 1) fail('viewer: no labels with the overlay on');
    if (requests.length) fail(`viewer: requests ${requests.join(', ')}`);
    for (const p of await axeProblems(page, 'viewer ai', STRUCTURE_RULES)) fail(p);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(tmp, { recursive: true, force: true });
  }
}
