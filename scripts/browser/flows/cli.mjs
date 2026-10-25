// CLI flow (phase 13, v7 phase 34a): runs the built CLI with --no-open against fixture sessions in a sandboxed HOME
// under .tmp/, opens the written file:// page with the network blocked, and checks the v7 viewer (tree, list, outcome,
// footer, step in the hash, Esc, deep link), that transcript markup stays text (AC3), --share redaction and its note,
// and zero requests (C3). Fixture data only.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STRUCTURE_RULES, axeProblems } from '../axe.mjs';
import { blockNetwork, checkFacts, openViewer, stepRoundTrip, toPhone, viewerFacts } from '../viewer.mjs';

const XSS = '</script><script>alert(1)</script>';
const TOKEN = ['gh', 'p_', 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'].join(''); // built at runtime: never committed
const HOME_DIR = ['', 'home', 'ana'].join('/'); // a synthetic home path, assembled so the repo holds none

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
  await page.setViewportSize({ width: 1440, height: 900 });
  const blocked = await blockNetwork(page);
  await openViewer(page, pathToFileURL(file).href);
  const facts = await viewerFacts(page);
  log(JSON.stringify({ ...facts, outcome: facts.outcome.slice(0, 80) }));
  checkFacts(facts, fail, 'cli');
  if (!facts.meta.some((m) => /^\d+ tool calls?$/.test(m))) fail(`the meta line has no tool-call count: ${facts.meta}`);
  if (!/files? changed/.test(facts.outcome)) fail(`the outcome box names no changed files: ${facts.outcome}`);
  for (const p of await axeProblems(page, 'desktop', STRUCTURE_RULES)) fail(p);
  await shot('cli-map-desktop');
  const step = await stepRoundTrip(page, fail, 'cli');
  log(`step ${step}: picked, Esc, deep link`);
  await shot('cli-map-step');

  const overflow = await toPhone(page, fail, 'cli');
  if (overflow > 0) fail(`mobile: page overflows horizontally by ${overflow}px`);
  for (const p of await axeProblems(page, 'mobile', STRUCTURE_RULES)) fail(p);
  await shot('cli-map-mobile');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.getAnimations().length === 0); // the 250ms colour transitions
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
  await openViewer(page, pathToFileURL(shared).href);
  const text = await page.locator('main').textContent();
  if (!text?.includes(XSS)) fail('the </script> payload is not shown as text');
  // data, the packed app, its loader and the inflated app: anything more was injected
  if ((await page.locator('script').count()) !== 4) fail(`the page has ${await page.locator('script').count()} script elements, not 4`);
  const note = await page.locator('.frame .meta .tag').textContent().catch(() => '');
  if (!/^Shared copy, redacted \(\d+ items replaced\)$/.test(note ?? '') || !(await page.locator('.frame .meta .tag').isVisible())) fail(`shared-copy note missing from the meta line: ${note}`);
  // Share works offline in a shared copy too: its dialog is part of the page.
  await page.getByRole('button', { name: 'Share' }).click();
  if (!(await page.getByRole('dialog').isVisible().catch(() => false))) await page.getByRole('dialog').waitFor({ timeout: 5_000 }).catch(() => fail('Share opened no dialog'));
  await page.keyboard.press('Escape');
  if (blocked.length) fail(`the viewer requested ${blocked.length} URL(s): ${blocked.slice(0, 3).join(', ')}`);
  log(`requests blocked: ${blocked.length}`);
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
