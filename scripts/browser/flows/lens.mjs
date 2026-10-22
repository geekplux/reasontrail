// Lens flow (phase 22, Z1–Z3, AC2): from the map's detail panel, "Zoom into this sentence" opens the garden for a
// recorded sentence with no API request (growing it makes no request at all), the frame says whose predictions these
// are (Z2), and "Back to the map" and the browser's Back both restore the selection and focus (Z3). A sentence with no
// recording calls `/api/next-tokens` only after the opt-in (faked with page.route), a repeated prefix costs nothing, and
// on `vite preview` (no Worker) the opt-in ends in the calm "unavailable" message with the garden still shown.
// Two 1440 light WebP screenshots go to .tmp/ (lens-entry, lens-recorded).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { axeProblems } from '../axe.mjs';

const Z2 = "An open model's predictions for this text, not what the session's model computed.";
const panel = (page) => page.locator('[data-testid="detail-panel"]');
const ready = (page) => page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
const focused = (page) => page.evaluate(() => ({ id: document.activeElement?.id ?? '', text: document.activeElement?.textContent?.trim() ?? '' }));

async function openMap(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await panel(page).waitFor({ timeout: 5_000 });
}

/** Branch keys that can grow now. */
const expandable = (page) => page.locator('g.branch[data-state="expandable"]').evaluateAll((gs) => gs.map((g) => g.getAttribute('data-key')));
const hit = (key) => `g.branch[data-key="${key.replace(/"/g, '\\"')}"] [data-role="hit"]`;

export async function run({ page, context, baseURL, root, log, fail }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const out = join(root, '.tmp');
  mkdirSync(out, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const webp = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 80 });
    writeFileSync(join(out, `${name}.webp`), Buffer.from(data, 'base64'));
    log(`screenshot ${join(out, `${name}.webp`)}`);
  };
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const api = () => requests.filter((u) => new URL(u).pathname.startsWith('/api/'));

  // Z1: an assistant step's panel offers the lens on its sentence; the recorded one says it works offline.
  await openMap(page, `${baseURL}/?session=planner-pivot&step=s12`);
  const target = await panel(page).getAttribute('data-target');
  const zoom = panel(page).getByRole('button', { name: 'Zoom into this sentence' });
  if (!(await zoom.isVisible())) return fail('no "Zoom into this sentence" in the panel');
  if (!(await panel(page).getByText('Recorded · works offline').isVisible())) fail('the recorded sentence is not marked as working offline');
  const chip = panel(page).locator('.lens-sentence[aria-pressed="true"]');
  if (!(await chip.textContent())?.includes('Now the planner rewrites the plan')) fail(`picked sentence: ${await chip.textContent()}`);
  await chip.focus();
  await page.keyboard.press('Enter');
  await webp('lens-entry');

  // The recorded lens: no API request, the Z2 line, the sentence and its step, focus on the garden's title.
  await zoom.focus();
  await page.keyboard.press('Enter');
  await ready(page);
  if (!/[?&]sample=lens-planner-pivot-1(&|$)/.test(page.url()) || !/[?&]step=s12(&|$)/.test(page.url())) fail(`lens URL: ${page.url()}`);
  if ((await page.locator('.lens-z2').textContent())?.trim() !== Z2) fail(`Z2 line: ${await page.locator('.lens-z2').textContent()}`);
  const quote = (await page.locator('.lens-quote').textContent()) ?? '';
  if (!quote.includes('Now the planner rewrites the plan for the reasoning map') || !quote.includes('Step s12')) fail(`sentence and provenance: ${quote}`);
  if (!/Map.*›.*Sentence/s.test((await page.locator('.lens-breadcrumb').textContent()) ?? '')) fail('breadcrumb');
  if ((await focused(page)).id !== 'specimen-title') fail(`focus after opening the lens: ${JSON.stringify(await focused(page))}`);
  if (await page.locator('.site').isVisible()) fail('the map is still visible under the lens');
  // Growing recorded branches makes no request at all (AC2).
  const before = requests.length;
  for (const key of (await expandable(page)).slice(0, 3)) await page.locator(hit(key)).click();
  if ((await page.locator('g.branch[data-state="expanded"]').count()) < 2) fail('recorded branches did not grow');
  if (requests.length !== before) fail(`growing recorded branches made requests: ${requests.slice(before).join(', ')}`);
  if (api().length) fail(`API requests for a recorded sentence: ${api().join(', ')}`);
  // A branch the recording lacks offers live growth, and nothing is sent.
  const missing = page.locator('g.branch[data-state="not-recorded"] [data-role="hit"]').first();
  if (await missing.count()) {
    await missing.click();
    const note = (await page.locator('.garden-note .inline-note, .readout .inline-note').allTextContents()).join(' ');
    if (!note.includes('Turn on live growth')) fail(`not-recorded note in the lens: ${note}`);
  }
  if (!(await page.getByRole('button', { name: /^Grow live with an open model — sends this text to the Reasontrail Worker$/ }).isVisible())) fail('no live opt-in');
  for (const p of await axeProblems(page, 'lens recorded')) fail(p);
  await page.locator('#specimen-title').focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await webp('lens-recorded');

  // Z3: "Back to the map" restores the selection and focus; so does the browser's Back.
  await page.getByRole('button', { name: 'Back to the map' }).click();
  await panel(page).waitFor({ timeout: 5_000 });
  if ((await panel(page).getAttribute('data-target')) !== target || /[?&](sample|lens)=/.test(page.url()) || !/[?&]step=s12/.test(page.url())) fail(`Back: ${page.url()}, ${await panel(page).getAttribute('data-target')}`);
  if ((await focused(page)).text !== 'Zoom into this sentence') fail(`Back: focus on ${JSON.stringify(await focused(page))}`);
  await zoom.click();
  await ready(page);
  await page.goBack();
  await panel(page).waitFor({ timeout: 5_000 });
  if ((await panel(page).getAttribute('data-target')) !== target || !(await zoom.isVisible())) fail('browser Back did not restore the map selection');
  if ((await focused(page)).text !== 'Zoom into this sentence') fail(`browser Back: focus on ${JSON.stringify(await focused(page))}`);
  // A shared link to a recorded lens opens on its own, offline data, and Back goes to its map.
  await page.goto(`${baseURL}/?session=planner-pivot&step=s12&sample=lens-planner-pivot-1`, { waitUntil: 'load' });
  await ready(page);
  if (!(await page.locator('.lens-quote').textContent())?.includes('Now the planner')) fail('lens link: no sentence');
  await page.getByRole('button', { name: 'Back to the map' }).click();
  await panel(page).waitFor({ timeout: 5_000 });

  // Live growth: no call before the opt-in; after it, calls through /api/next-tokens; a repeated prefix is free.
  const sent = [];
  await page.route('**/api/next-tokens', async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? '{}'));
    const tokens = [' map', ' plan', ' team', ' code', ' work'].map((token, i) => ({ token, logprob: -0.6 - i * 0.5 }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: 'fake-open-model', tokens }) });
  });
  await openMap(page, `${baseURL}/?session=planner-pivot&step=s108`);
  if (!(await panel(page).getByText('Not recorded · grows live if you opt in').isVisible())) fail('unrecorded sentence: no live note');
  await panel(page).getByRole('button', { name: 'Zoom into this sentence' }).click();
  await ready(page);
  await page.waitForTimeout(300);
  if (sent.length) fail(`live calls before the opt-in: ${sent.length}`);
  if (!/[?&]lens=live/.test(page.url())) fail(`live lens URL: ${page.url()}`);
  await page.getByRole('button', { name: /^Grow live with an open model/ }).click();
  await page.locator('g.branch[data-state="expanded"]').first().waitFor({ timeout: 5_000 });
  const opened = sent.length;
  if (opened < 1 || opened > 2 || sent.some((b) => b.k !== 5)) fail(`opt-in calls: ${JSON.stringify(sent)}`);
  if (!(await page.locator('.lens-live').textContent())?.includes('fake-open-model')) fail(`live status: ${await page.locator('.lens-live').textContent()}`);
  const grown = await page.locator('g.branch[data-state="expanded"]').first().getAttribute('data-key');
  await page.locator(hit(grown)).click(); // collapse
  await page.locator(hit(grown)).click(); // open again: from the cache
  if (sent.length !== opened) fail(`a repeated prefix made ${sent.length - opened} more calls`);
  const next = (await expandable(page))[0];
  await page.locator(hit(next)).click();
  await page.waitForTimeout(300);
  if (sent.length !== opened + 1) fail(`growing a new live branch made ${sent.length - opened} calls`);
  await page.unroute('**/api/next-tokens');

  // No Worker behind `vite preview`: the opt-in ends in the calm message, and the garden still shows.
  await openMap(page, `${baseURL}/?session=planner-pivot&step=s108`);
  await panel(page).getByRole('button', { name: 'Zoom into this sentence' }).click();
  await ready(page);
  await page.getByRole('button', { name: /^Grow live with an open model/ }).click();
  await page.locator('.lens-status .inline-note').waitFor({ timeout: 10_000 });
  const msg = (await page.locator('.lens-status').textContent()) ?? '';
  if (!msg.includes("Live growth isn't available here")) fail(`no-Worker message: ${msg}`);
  if (!(await page.locator('[data-testid="garden"][data-ready="true"]').isVisible())) fail('the garden is gone after a failed live call');

  // Reduced motion: the lens opens with no transition time.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.lens-head')).animationDuration);
  if (dur !== '0s') fail(`reduced motion: lens animation ${dur}`);
  log(`requests: ${requests.length}, live calls faked: ${sent.length}`);
}
