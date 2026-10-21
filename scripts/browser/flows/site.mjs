// Site flow (phase 19): the showcase home (one focal point, chrome caps, one large text), gallery navigation by mouse,
// keyboard and Back; the install commands run through the built CLI and its installer (AC2); drag-and-drop and file-pick
// parsing with zero requests (V1, V2), progress and Cancel, the 10 MB parse budget (G2), the error states (V5, M8);
// offline after the first load (AC3); mobile and dark. Screenshots go to the --out dir.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { axeProblems } from '../axe.mjs';

const PRIVACY = 'Parsed in your browser. Nothing is uploaded.';
const ready = (page) => page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });
const live = (page) => page.locator('[data-role="intake-live"]').textContent();
const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450); // the map's draw-in
};

/** CL2 and CL9 in the current viewport: chrome controls (a radio group counts once) and text ≥ 25 px. */
const calm = (page) => page.evaluate(() => {
  const data = '[data-region="route"], [data-glance], [data-region="trouble"] li, [data-region="outcome"] li';
  const seen = new Set();
  const controls = [...document.querySelectorAll('a[href], button, input, select, summary, [tabindex]:not([tabindex="-1"])')].filter((el) => {
    const r = el.getBoundingClientRect();
    const shown = getComputedStyle(el).visibility !== 'hidden' && (r.width > 0 || el.closest('label')?.getBoundingClientRect().width > 0);
    if (!shown || r.bottom <= 0 || r.top >= innerHeight || el.closest(data) || el.closest('[aria-hidden="true"]')) return false;
    if (el.type === 'radio') return !seen.has(el.name) && seen.add(el.name);
    return true;
  });
  const large = [...document.querySelectorAll('body *')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) >= 25 && el.getBoundingClientRect().height > 0 && !el.closest('.wordmark')); // the logo is not text
  const route = document.querySelector('[data-region="route"]')?.getBoundingClientRect();
  const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
  const largest = [...document.querySelectorAll('main [data-region]')].sort((a, b) => area(b) - area(a))[0]?.getAttribute('data-region');
  return { controls: controls.map((c) => (c.getAttribute('aria-label') ?? c.textContent ?? c.tagName).trim().slice(0, 24)), large: large.map((e) => e.textContent.trim().slice(0, 30)), routeTop: Math.round(route?.top ?? -1), largest };
});

/** A synthetic drag and drop on the body of a file built in the page (`text`, or `bytes` zero bytes). Returns whether
 * the overlay showed while dragging. */
async function drop(page, name, { text, bytes }) {
  await page.evaluate(([n, t, b]) => {
    window.tgDrop = new DataTransfer();
    window.tgDrop.items.add(new File([t ?? new Uint8Array(b)], n));
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: window.tgDrop, bubbles: true }));
  }, [name, text, bytes]);
  const overlay = await page.waitForSelector('.drop-overlay', { timeout: 2_000 }).then(() => true, () => false);
  await page.evaluate(() => document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: window.tgDrop, bubbles: true, cancelable: true })));
  return overlay;
}

export async function run({ page, context, baseURL, root, shot, log, fail }) {
  const fixture = join(root, 'fixtures', 'sessions', 'claude-code', 'trouble.jsonl');
  const fixtureText = readFileSync(fixture, 'utf8');
  const tmp = join(root, '.tmp', 'site-flow');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  let requests = [];
  page.on('request', (r) => !r.url().endsWith('/favicon.svg') && requests.push(r.url())); // the tab icon is not a parse request

  // Home at 1440×900: the live map is the focal point (CL1), ≤ 6 chrome controls (CL2), one large text (CL9).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await ready(page);
  await settle(page);
  const home = await calm(page);
  log(`home 1440: route top ${home.routeTop}px (largest region by area: ${home.largest}); controls ${home.controls.length} [${home.controls.join(' | ')}]; large text ${JSON.stringify(home.large)}`);
  if (home.routeTop < 0 || home.routeTop > 420) fail(`CL1: the route band starts at ${home.routeTop}px (> 420)`);
  if (home.largest !== 'route') fail(`CL1: the largest region is ${home.largest}, not the route`);
  if ((await page.title()) !== 'Reasontrail: see what your coding agent did') fail(`home title: ${await page.title()}`);
  if (home.controls.length > 6) fail(`CL2: ${home.controls.length} chrome controls in the first viewport at 1440×900`);
  if (home.large.length !== 1) fail(`CL9: ${home.large.length} text elements ≥ 25 px: ${home.large}`);
  if (!(await page.getByText('Watch the agents that built this app').isVisible())) fail('no "Watch the agents that built this app" label');
  if (!(await page.locator('footer').textContent()).includes(PRIVACY)) fail('V2: the footer lacks the privacy line');
  for (const p of await axeProblems(page, 'home')) fail(p);
  await shot('site-home-desktop');

  // Prefetch: the lazy samples, the drop zone and its worker arrive once the page is idle.
  await page.waitForFunction(() => ['verify-fail-fix.graph', 'planner-pivot.graph', 'DropZone', 'parse.worker'].every((n) => performance.getEntriesByType('resource').some((e) => e.name.includes(n))), null, { timeout: 10_000 })
    .catch(() => fail('AC3: the lazy samples, drop zone and parse worker were not prefetched after load'));

  // Gallery by mouse, keyboard and Back.
  const title = () => page.locator('[data-region="task"] .task-title').first().textContent();
  const first = await title();
  await page.locator('.gallery-segments label').nth(1).click();
  await page.waitForFunction(() => location.search === '?session=verify-fail-fix');
  await ready(page);
  if ((await title()) === first) fail('gallery: the map did not change');
  await page.locator('.gallery input:checked').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => location.search === '?session=planner-pivot').catch(() => fail(`gallery keyboard: ${page.url()}`));
  await ready(page);
  if (!(await page.evaluate(() => document.activeElement?.matches('.gallery input:checked')))) fail('gallery keyboard: focus left the checked sample');
  await page.goBack();
  await page.waitForFunction(() => location.search === '?session=verify-fail-fix').catch(() => fail(`gallery Back: ${page.url()}`));
  await ready(page);
  await settle(page);
  await page.locator('.showcase-controls').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 240));
  await shot('site-gallery');

  // AC2: every command on the install page parses with the built CLI; the installer writes where the page says.
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.locator('header').getByRole('link', { name: 'Install' }).click();
  await page.waitForSelector('.install');
  if (!(await page.evaluate(() => document.activeElement?.matches('main h1')))) fail('Install: focus did not move to the page heading');
  if ((await page.title()) !== 'Install · Reasontrail') fail(`install title: ${await page.title()}`);
  const commands = await page.locator('.install [data-command]').allTextContents();
  const installText = await page.locator('.install').textContent();
  const cli = join(root, 'cli', 'dist', 'cli.mjs');
  if (!existsSync(cli)) fail('AC2: cli/dist/cli.mjs is missing: run pnpm build:cli');
  else {
    const sandbox = join(tmp, 'home');
    mkdirSync(sandbox, { recursive: true });
    const env = { PATH: process.env.PATH, HOME: sandbox, GROK_HOME: join(sandbox, '.grok'), CODEX_HOME: join(sandbox, '.codex'), TMPDIR: tmp };
    const exec = (args) => spawnSync(process.execPath, [cli, ...args], { cwd: tmp, env, encoding: 'utf8', timeout: 20_000 });
    const help = exec(['--help']).stdout;
    for (const cmd of commands) {
      if (!cmd.startsWith('npx reasontrail')) fail(`AC2: "${cmd}" does not start with npx reasontrail`);
      const args = cmd.split(/\s+/).slice(2);
      for (const a of args.filter((x) => x.startsWith('-') || x === 'install-skill')) if (!help.includes(a)) fail(`AC2: "${a}" (from "${cmd}") is not in --help`);
      const r = exec(args[0] === 'install-skill' ? [...args, '--dry-run'] : [...args, '--no-open']);
      if (r.status === 1) fail(`AC2: "${cmd}" is a usage error: ${r.stderr.trim()}`);
      if (args[0] === 'install-skill') {
        const dirs = [...r.stdout.matchAll(/^[\w ]+: (\/\S+)$/gm)].map((m) => m[1].replace(sandbox, '~'));
        if (!dirs.length) fail(`AC2: no install dirs from "${cmd}": ${r.stdout}`);
        for (const d of dirs) if (!installText.includes(d)) fail(`AC2: the installer writes ${d}, which the install page does not say`);
        log(`AC2: ${cmd} → ${dirs.join(', ')}`);
      }
    }
    for (const call of ['/reasontrail', '$reasontrail']) if (!installText.includes(call)) fail(`AC2: install page lacks ${call}`);
    log(`AC2: ${commands.length} commands checked against --help and the installer`);
  }
  for (const p of await axeProblems(page, 'install')) fail(p);
  await shot('site-install');

  // V1, V2: file pick on ?view=open, keyboard path, zero requests while parsing; the map is announced and focused.
  await page.getByRole('link', { name: 'Map your own session' }).click();
  await page.waitForSelector('[data-testid="drop-target"]');
  if (!(await page.locator('main').textContent()).includes(PRIVACY)) fail('V2: the drop zone lacks the privacy line');
  await page.waitForFunction(() => document.activeElement?.matches('main h1')).catch(() => fail('open: focus did not move to the page heading'));
  if ((await page.title()) !== 'Map your own session · Reasontrail') fail(`open title: ${await page.title()}`);
  if ((await page.locator('header .button.primary').getAttribute('aria-current')) !== 'page') fail('open: the header button is not aria-current="page"');
  if ((await page.locator('footer').textContent()).includes(PRIVACY)) fail('open: the footer repeats the privacy line');
  const input = page.locator('input[type="file"]');
  await input.focus();
  if (!(await page.evaluate(() => getComputedStyle(document.activeElement.closest('label')).outlineStyle !== 'none'))) fail('the file picker shows no focus ring');
  for (const p of await axeProblems(page, 'open')) fail(p);
  requests = [];
  await input.setInputFiles(fixture);
  await ready(page);
  if (requests.length) fail(`V1: ${requests.length} requests while parsing: ${requests.slice(0, 3)}`);
  if (!/^Map ready: \d+ episodes?, \d+ detected patterns?/.test((await live(page)) ?? '')) fail(`announce: "${await live(page)}"`);
  if (!(await page.evaluate(() => document.activeElement?.tagName === 'H1'))) fail('focus did not move to the mapped file');
  if ((await page.title()) !== 'trouble.jsonl · Reasontrail') fail(`dropped map title: ${await page.title()}`);
  await settle(page);
  for (const p of await axeProblems(page, 'dropped map')) fail(p);

  // A synthetic drop anywhere on the home page shows the overlay and opens the map.
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await ready(page);
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('parse.worker')), null, { timeout: 10_000 });
  requests = [];
  if (!(await drop(page, 'trouble.jsonl', { text: fixtureText }))) fail('dragging a file shows no overlay');
  await page.waitForSelector('.open-file', { timeout: 10_000 });
  if (requests.length) fail(`V1 drop: ${requests.length} requests: ${requests.slice(0, 3)}`);
  if (!page.url().includes('view=open')) fail(`drop did not open ?view=open: ${page.url()}`);

  // Progress and Cancel on a big file (> 2 MB), and the G2 10 MB parse budget.
  // A session's bulk is tool output: each fixture record carries ~4 KB of padding, as long results do.
  const padded = fixtureText.trim().split('\n').map((l) => JSON.stringify({ ...JSON.parse(l), pad: 'x'.repeat(4_000) })).join('\n') + '\n';
  const repeat = (mb) => padded.repeat(Math.ceil((mb * 1024 * 1024) / padded.length));
  const big = join(tmp, 'big-session.jsonl');
  writeFileSync(big, repeat(30));
  await page.getByRole('button', { name: 'Open another file' }).click();
  await page.waitForFunction(() => document.activeElement?.type === 'file').catch(() => fail('Open another file did not focus the file picker'));
  await input.setInputFiles(big);
  const bar = page.locator('[role="progressbar"]');
  await bar.waitFor({ timeout: 5_000 });
  await page.waitForFunction(() => Number(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')) > 0, null, { timeout: 5_000 }).catch(() => {});
  if (!/^[\d,]+ of [\d,]+ lines$/.test((await bar.getAttribute('aria-valuetext')) ?? '')) fail(`progress valuetext: ${await bar.getAttribute('aria-valuetext')}`);
  await shot('site-drop-parsing');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForFunction(() => document.querySelector('[data-role="intake-live"]')?.textContent === 'Reading cancelled');
  await page.waitForFunction(() => document.activeElement?.type === 'file').catch(() => fail('Cancel did not move focus to the file picker'));
  writeFileSync(big, repeat(10));
  const t0 = Date.now();
  await input.setInputFiles(big);
  await page.waitForSelector('.open-file', { timeout: 30_000 });
  const ms = await page.evaluate(() => performance.getEntriesByName('tg:intake-parse').at(-1)?.duration ?? -1);
  log(`G2: 10 MB read and parsed in ${Math.round(ms)} ms (${Date.now() - t0} ms to the drawn map)`);
  if (ms < 0 || ms > 3_000) fail(`G2: parsing a 10 MB file took ${Math.round(ms)} ms (> 3000)`);
  rmSync(big, { force: true });

  // Error states: unsupported, empty, over 50 MB (role="alert", calm copy, the CLI suggested).
  const errors = [
    ['notes.jsonl', { text: '{"a":1}\n{"b":2}\n' }, "This doesn't look like a Claude Code, Codex or Grok Build session (.jsonl)."],
    ['empty.jsonl', { text: '' }, 'This file has no steps we can map.'],
    ['huge.jsonl', { bytes: 51 * 1024 * 1024 }, 'This file is 51 MB. The browser can map files up to 50 MB; the command line has no limit:'],
  ];
  for (const [name, content, message] of errors) {
    await page.goto(`${baseURL}/?view=open`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="drop-target"]');
    await drop(page, name, content);
    await page.waitForFunction((m) => document.querySelector('[role="alert"]')?.textContent?.includes(m), message, { timeout: 5_000 })
      .catch(() => fail(`${name}: alert never said "${message}"`));
  }
  if (!(await page.locator('[data-command]').textContent())?.startsWith('npx reasontrail')) fail('V5: no CLI command after the size message');
  for (const p of await axeProblems(page, 'error')) fail(p);
  await shot('site-drop-error');

  // AC3: offline after the first load, the gallery and the drop zone still work.
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await ready(page);
  await page.waitForFunction(() => ['planner-pivot.graph', 'parse.worker'].every((n) => performance.getEntriesByType('resource').some((e) => e.name.includes(n))), null, { timeout: 10_000 });
  // Chrome re-asks for the favicon on each history step; a real browser answers that from its cache (as samples.mjs).
  const favicon = readFileSync(join(root, 'public', 'favicon.svg'));
  await context.route('**/favicon.svg', (route) => route.fulfill({ body: favicon, contentType: 'image/svg+xml' }));
  await context.setOffline(true);
  await page.locator('.gallery-segments label').nth(2).click();
  await page.waitForFunction(() => location.search === '?session=planner-pivot').catch(() => fail('AC3: offline gallery did not switch'));
  await ready(page);
  await page.getByRole('link', { name: 'Map your own session' }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.waitForSelector('.open-file', { timeout: 10_000 }).catch(() => fail('AC3: offline drop did not map'));
  await context.setOffline(false);

  // Mobile (≤ 4 chrome controls, no sideways scroll) and dark.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await ready(page);
  await settle(page);
  const mobile = await calm(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  log(`home 390: controls ${mobile.controls.length} [${mobile.controls.join(' | ')}]; large ${JSON.stringify(mobile.large)}; overflow ${overflow}`);
  if (mobile.controls.length > 4) fail(`CL2: ${mobile.controls.length} chrome controls in the first viewport at 390×844`);
  await page.locator('.gallery-select').focus();
  await page.locator('.gallery-select').selectOption('verify-fail-fix');
  await page.waitForFunction(() => location.search === '?session=verify-fail-fix').catch(() => fail(`mobile select: ${page.url()}`));
  await ready(page);
  if (!(await page.evaluate(() => document.activeElement?.matches('.gallery-select')))) fail('mobile select: focus left the sample select');
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await ready(page);
  await settle(page);
  if (mobile.large.length > 1) fail(`CL9 mobile: ${mobile.large}`);
  if (overflow > 0) fail(`mobile overflows by ${overflow}px`);
  await shot('site-home-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await ready(page);
  await settle(page);
  for (const p of await axeProblems(page, 'dark')) fail(p);
  await shot('site-dark');
  rmSync(tmp, { recursive: true, force: true });
}
