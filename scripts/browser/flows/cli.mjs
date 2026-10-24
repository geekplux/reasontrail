// CLI flow (phase 13): runs the built CLI with --no-open against fixture sessions in a sandboxed HOME under .tmp/,
// opens the written file:// page, and checks the map's glance regions (M1, phase 16), the honesty label (M5),
// that transcript markup stays text (AC3), --share redaction, and zero requests (C3). Fixture data only.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STRUCTURE_RULES, axeProblems } from '../axe.mjs';

const XSS = '</script><script>alert(1)</script>';
const TOKEN = ['gh', 'p_', 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'].join(''); // built at runtime: never committed
const HOME_DIR = ['', 'home', 'ana'].join('/'); // a synthetic home path, assembled so the repo holds none
const HONESTY = "Written reasoning is the agent's own account, not a record of how the model computed.";

export async function run({ page, root, shot, log, fail }) {
  const cli = join(root, 'cli', 'dist', 'cli.mjs');
  if (!existsSync(cli)) return fail('cli/dist/cli.mjs is missing: run pnpm build:cli');
  const sb = join(root, '.tmp', 'cli-sandbox');
  rmSync(sb, { recursive: true, force: true });
  const home = join(sb, 'home');
  const work = join(sb, 'work', 'notes-app');
  const store = join(home, '.claude', 'projects', work.replace(/[^A-Za-z0-9]/g, '-'));
  for (const d of [store, work, join(sb, 'tmp')]) mkdirSync(d, { recursive: true });
  const env = { PATH: process.env.PATH, HOME: home, GROK_HOME: join(home, '.grok'), CODEX_HOME: join(home, '.codex'), TMPDIR: join(sb, 'tmp') };
  const reasontrail = (...args) => {
    const r = spawnSync(process.execPath, [cli, ...args], { cwd: work, env, encoding: 'utf8', timeout: 20_000 });
    log(`reasontrail ${args.join(' ')} -> exit ${r.status}; ${r.stderr.trim().split('\n').join(' | ')}`);
    if (r.status !== 0) fail(`reasontrail ${args.join(' ')} exited ${r.status}`);
    return r.stdout.trim();
  };
  page.on('dialog', (d) => {
    fail(`a dialog opened: ${d.message()}`);
    return d.dismiss();
  });

  // 1. --latest on a fixture with trouble, a verification and changed files.
  const fixture = join(store, 'sess-trouble.jsonl');
  copyFileSync(join(root, 'fixtures', 'sessions', 'claude-code', 'trouble.jsonl'), fixture);
  utimesSync(fixture, 1_000, 1_000);
  const file = reasontrail('--latest', '--no-open');
  if (!file.startsWith(join(sb, 'tmp', 'reasontrail'))) fail(`default output is not under <tmpdir>/reasontrail: ${file}`);
  log(`output ${file}: ${Math.round(readFileSync(file).length / 1024)} KB`);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 10_000 });
  await page.waitForFunction(() => document.getAnimations().length === 0); // the map's draw-in (≤ 400 ms)
  const regions = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-region]')].map((r) => [r.getAttribute('data-region'), r.textContent])));
  log(`regions: ${Object.keys(regions).join(', ')}`);
  if (Object.keys(regions).join() !== 'task,glance,route,trouble,outcome') fail(`regions: ${Object.keys(regions)}`);
  if (!regions.task?.includes(HONESTY) || !regions.task.includes('How to read this map')) fail('honesty label missing from the task card');
  if (!/\d+ tool calls?/.test(regions.task ?? '')) fail('task card has no tool-call count');
  if ((await page.locator('[data-region="route"] [data-episode-id]').count()) < 2) fail('route lists fewer than 2 episodes');
  if ((await page.locator('[data-trouble-kind]').count()) < 1) fail('no trouble chip on the route');
  if (!/files? changed/.test(regions.outcome ?? '') || !/Last verification/i.test(regions.outcome ?? '')) fail('destination lacks files or verification');
  if (await page.locator('[role="tree"], [role="treeitem"], [role="grid"]').count()) fail('the page uses tree or grid roles');
  const title = await page.evaluate(() => getComputedStyle(document.querySelector('.task-title')).fontFamily);
  if (!/^"?Geist\b/.test(title) || !(await page.evaluate(() => document.fonts.check('600 32px "Geist"')))) fail(`task title font: ${title}`);
  for (const p of await axeProblems(page, 'desktop', STRUCTURE_RULES)) fail(p);
  await shot('cli-map-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`mobile: page overflows horizontally by ${overflow}px`);
  if (!(await page.locator('[data-honesty]').isVisible())) fail('mobile: honesty label not visible');
  for (const p of await axeProblems(page, 'mobile', STRUCTURE_RULES)) fail(p);
  await shot('cli-map-mobile');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const p of await axeProblems(page, 'dark', STRUCTURE_RULES)) fail(p);
  await shot('cli-map-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // 2. --share on a session holding markup, a token, an email and a home path (written at runtime, never committed).
  const rec = (o) => JSON.stringify({ sessionId: 'sess-share', cwd: '/work/notes-app', ...o });
  writeFileSync(join(store, 'sess-share.jsonl'), `${[
    rec({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: `Explain why ${XSS} shows as text. Token ${TOKEN}, mail ana@example.org, file ${HOME_DIR}/notes/a.md` } }),
    rec({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-10-01T10:00:20.000Z', message: { role: 'assistant', model: 'claude-test-model', content: [{ type: 'text', text: `It is escaped, so ${XSS} stays text.` }] } }),
  ].join('\n')}\n`);
  const shared = reasontrail('--share', '--no-open');
  if (shared !== join(work, 'reasontrail-sess-sha.html')) fail(`--share wrote ${shared}`);
  const html = readFileSync(shared, 'utf8');
  for (const leak of [TOKEN.slice(0, 8), 'ana@example.org', HOME_DIR]) if (html.includes(leak)) fail(`--share output still contains ${leak.slice(0, 6)}…`);
  await page.goto(pathToFileURL(shared).href, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 10_000 });
  await page.waitForFunction(() => document.getAnimations().length === 0); // the map's draw-in (≤ 400 ms)
  const text = await page.locator('[data-region="task"]').textContent();
  if (!text?.includes(XSS)) fail('the </script> payload is not shown as text');
  // data, the packed app, its loader and the inflated app: anything more was injected
  if ((await page.locator('script').count()) !== 4) fail(`the page has ${await page.locator('script').count()} script elements, not 4`);
  if (!(await page.getByText(/^Shared copy, redacted \(\d+ items replaced\)$/).isVisible())) fail('shared ribbon missing');
  for (const p of await axeProblems(page, 'share', STRUCTURE_RULES)) fail(p);
  await shot('cli-share-redacted');

  // 3. A browser without DecompressionStream gets a labelled, accessible error page instead of the map.
  await page.addInitScript(() => { delete window.DecompressionStream; });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  const alert = page.locator('main.viewer-error [role="alert"]');
  await alert.waitFor({ timeout: 10_000 });
  if (!/cannot open the map.*session data is still in this file/.test((await alert.textContent()) ?? '')) fail(`no-DecompressionStream message: ${await alert.textContent()}`);
  if ((await page.locator('h1').textContent()) !== 'Reasontrail') fail('no-DecompressionStream page has no h1');
  for (const p of await axeProblems(page, 'no DecompressionStream', STRUCTURE_RULES)) fail(p);
  await shot('cli-no-decompression');
}
