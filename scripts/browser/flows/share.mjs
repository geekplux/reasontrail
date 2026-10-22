// Share flow (phase 24, PLAN V4): "Save shareable copy…" on a dropped session holding a token, an address and a home
// path (written at runtime, never committed) and on the default website sample. The dialog says what is replaced and
// previews the redacted text; the downloaded HTML has none of the originals and passes the audit:samples rules on its
// decoded graph; it opens offline with zero requests, and its own "Save shareable copy…" writes a copy that opens too
// (the local viewer path). The map card is a 1200×630 PNG, with its alt text shown after the save. Writes .tmp/share-dialog.webp and
// .tmp/share-card.webp.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadRules } from '../../audit-samples.mjs';
import { axeProblems } from '../axe.mjs';

const TOKEN = ['gh', 'p_', 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'].join('');
const MAIL = ['ana', 'example.org'].join('@');
const HOME = ['', 'home', 'ana'].join('/');
const ready = (page) => page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });
const DATA = /<script id="reasontrail-data" type="application\/json">([\s\S]*?)<\/script>/;

/** Every decoded string in `value`, including strings that are themselves JSON. */
function strings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
    if (/^\s*[[{]/.test(value)) {
      try {
        strings(JSON.parse(value), out);
      } catch {
        // plain text
      }
    }
  } else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, strings(k, out));
  return out;
}

/** Waits for the share dialog after a click (10 s; on failure `run` records why). */
const opens = (dialog, label) => dialog.waitFor({ timeout: 10_000 }).catch((err) => {
  throw new Error(`${label}: the share dialog did not open in 10 s`, { cause: err });
});

/** Runs the flow; on any failure, saves a screenshot and says whether the dialog's code failed to load. */
export async function run(args) {
  const { page, context, root } = args;
  const pending = new Map();
  context.on('request', (r) => pending.set(r, Date.now()));
  for (const done of ['requestfinished', 'requestfailed']) context.on(done, (r) => pending.delete(r));
  try {
    await steps(args);
  } catch (err) {
    const path = join(root, '.tmp', 'share-fail.png');
    await page.screenshot({ path }).catch(() => {});
    const state = await page.evaluate(() => ({
      url: location.href,
      loadError: !!document.querySelector('.share-load-error'),
      dialogs: [...document.querySelectorAll('dialog')].map((d) => `${d.className}:${d.open ? 'open' : 'closed'}`),
    })).catch((e) => ({ evaluate: String(e) }));
    const waiting = [...pending].map(([r, t]) => `${r.url()} (${Date.now() - t} ms)`);
    const why = state.loadError ? 'the dialog\'s code failed to load (.share-load-error shown)' : JSON.stringify(state);
    throw new Error(`${err instanceof Error ? err.message.split('\n')[0] : err}; ${why}; pending requests: ${waiting.join(', ') || 'none'}; screenshot ${path}`, { cause: err });
  }
}

async function steps({ page, context, baseURL, root, log, fail }) {
  const tmp = join(root, '.tmp', 'share-flow');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const { findSecrets } = await loadRules();
  const save = async (target, name) => {
    const [dl] = await Promise.all([target.waitForEvent('download', { timeout: 15_000 }), name()]);
    const file = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`);
    await dl.saveAs(file);
    return { file, name: dl.suggestedFilename() };
  };
  /** Checks one downloaded HTML file: no originals, 0 audit hits, and it opens offline with zero requests. */
  const checkHtml = async (file, label) => {
    const html = readFileSync(file, 'utf8');
    for (const [what, s] of [['token', TOKEN], ['address', MAIL], ['home path', `${HOME}/`]]) if (html.includes(s)) fail(`${label}: the HTML holds the ${what}`);
    const json = DATA.exec(html)?.[1];
    if (!json) return fail(`${label}: no embedded graph`);
    const hits = strings(JSON.parse(json)).flatMap((s) => findSecrets(s));
    if (hits.length) fail(`${label}: ${hits.length} audit rule hit(s): ${[...new Set(hits)].join(', ')}`);
    const offline = await context.browser().newContext({ viewport: { width: 1440, height: 900 }, offline: true });
    const requests = [];
    offline.on('request', (r) => r.url() !== pathToFileURL(file).href && !r.url().startsWith('data:') && requests.push(r.url()));
    const p = await offline.newPage();
    p.on('pageerror', (e) => fail(`${label}: page error ${e.message}`));
    await p.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await ready(p);
    const ribbon = await p.locator('.shared-ribbon').textContent().catch(() => '');
    if (!/^Shared copy · redacted \(\d+ items replaced\)$/.test(ribbon ?? '')) fail(`${label}: ribbon "${ribbon}"`);
    if (requests.length) fail(`${label}: ${requests.length} request(s) offline: ${requests.slice(0, 3)}`);
    log(`${label}: ${Math.round(html.length / 1024)} KB, 0 audit hits, opened offline with ${requests.length} requests; ${ribbon}`);
    return { offline, p };
  };

  // 1. A dropped session with a token, an address and a home path.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  const text = readFileSync(join(root, 'fixtures', 'sessions', 'claude-code', 'trouble.jsonl'), 'utf8')
    .replace('Make note titles unique and keep the tests green', `Make note titles unique and keep the tests green. Token ${TOKEN}, mail ${MAIL}, notes in ${HOME}/notes/a.md`);
  await page.goto(`${baseURL}/?view=open`, { waitUntil: 'load' });
  await page.locator('input[type="file"]').setInputFiles({ name: 'leaky.jsonl', mimeType: 'application/jsonl', buffer: Buffer.from(text) });
  await ready(page);
  const button = page.getByRole('button', { name: 'Save shareable copy…' });
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Save a shareable copy' });
  await opens(dialog, 'dropped session');
  const summary = await dialog.locator('[data-share-summary]').textContent();
  if (!/^[1-9]\d* secrets?, [1-9]\d* emails?, [1-9]\d* paths? will be replaced\./.test(summary ?? '')) fail(`summary: "${summary}"`);
  if (!(await page.evaluate(() => document.querySelector('dialog[open]')?.contains(document.activeElement)))) fail('focus is not inside the dialog');
  await dialog.getByLabel('Preview redacted').check();
  const preview = await dialog.locator('.share-examples').textContent();
  if ((await dialog.locator('.share-examples mark').count()) === 0) fail('the redacted preview marks no placeholder');
  if (preview?.includes(TOKEN) || preview?.includes(MAIL)) fail('the preview shows an original');
  for (const p of await axeProblems(page, 'share dialog')) fail(p);
  await page.evaluate(() => document.fonts.ready);
  log(`dialog: ${summary}`);

  const html = await save(page, () => dialog.getByRole('button', { name: 'Download HTML' }).click());
  if (!/^reasontrail-[\w-]{1,8}\.html$/.test(html.name)) fail(`file name ${html.name}`);
  const opened = await checkHtml(html.file, 'dropped session');

  // 2. The local viewer re-serializes itself: its own share writes a copy that opens offline too.
  if (opened) {
    await opened.p.getByRole('button', { name: 'Save shareable copy…' }).click();
    await opens(opened.p.getByRole('dialog'), 'viewer re-share');
    const again = await save(opened.p, () => opened.p.getByRole('button', { name: 'Download HTML' }).click());
    await (await checkHtml(again.file, 'viewer re-share'))?.offline.close();
    await opened.offline.close();
  }

  // 3. The map card: a 1200×630 PNG, then its alt text in the dialog.
  const card = await save(page, () => dialog.getByRole('button', { name: 'Download map card (PNG)' }).click());
  const png = readFileSync(card.file);
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (png.toString('latin1', 1, 4) !== 'PNG' || w !== 1200 || h !== 630) fail(`card: ${card.name} is ${w}×${h}`);
  const alt = await dialog.locator('.share-alt').textContent({ timeout: 2_000 }).catch(() => '');
  if (!/^Alt text for the card: Reasontrail map card: /.test(alt ?? '') || alt?.includes(TOKEN)) fail(`card alt text: "${alt}"`);
  if ((await dialog.getByRole('button', { name: 'Copy alt text' }).count()) !== 1) fail('no "Copy alt text" button');
  if ((await dialog.getByRole('button', { name: /SVG/ }).count()) > 0) fail('the dialog still offers an SVG card');
  for (const p of await axeProblems(page, 'share dialog with alt text')) fail(p);
  await page.screenshot({ path: join(root, '.tmp', 'share-dialog.webp'), type: 'webp', quality: 80 });
  const view = await context.newPage();
  await view.setViewportSize({ width: 1200, height: 630 });
  await view.setContent(`<body style="margin:0"><img alt="map card" src="data:image/png;base64,${png.toString('base64')}"></body>`);
  await view.screenshot({ path: join(root, '.tmp', 'share-card.webp'), type: 'webp', quality: 85 });
  await view.close();
  log(`card: ${card.name} ${w}×${h}, ${Math.round(png.length / 1024)} KB; alt: ${alt}`);

  await page.keyboard.press('Escape');
  if ((await dialog.count()) > 0) fail('Esc did not close the dialog');
  if (!(await button.evaluate((b) => b === document.activeElement))) fail('focus did not return to "Save shareable copy…"');

  // 4. The default website sample: the built /viewer.html template, redacted.
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await ready(page);
  await page.getByRole('button', { name: 'Save shareable copy…' }).click();
  await opens(page.getByRole('dialog'), 'website sample');
  const sample = await save(page, () => page.getByRole('dialog').getByRole('button', { name: 'Download HTML' }).click());
  await (await checkHtml(sample.file, 'website sample'))?.offline.close();
}
