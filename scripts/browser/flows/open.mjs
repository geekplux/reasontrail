// Open flow (phase 19 drop zone and install checks, back on the v7 pages in phase 34b): the install commands run through
// the built CLI and its installer (AC2); `?view=open` on the v7 page system (120px edges, 16px drop target, .btn);
// file pick and drag-and-drop parse with zero requests (V1, V2) into the v7 session page (tree, list, outcome, the file
// as the meta tag, focus on the session title); progress and Cancel, the 10 MB parse budget (G2); the error states (V5,
// M8; the 50 MB limit); offline after the first load (AC3). One WebP per page to .tmp/.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { axeProblems } from '../axe.mjs';

const PRIVACY = 'Parsed in your browser. Nothing is uploaded.';
const opened = (page, timeout = 15_000) => page.waitForSelector('[data-testid="opened"] .gl [role="treeitem"]', { timeout });
const live = (page) => page.locator('[data-role="intake-live"]').textContent();

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

export async function run({ page, context, baseURL, root, log, fail }) {
  const fixture = join(root, 'fixtures', 'sessions', 'claude-code', 'trouble.jsonl');
  const fixtureText = readFileSync(fixture, 'utf8');
  const tmp = join(root, '.tmp', 'open-flow');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const webp = async (name) => writeFileSync(join(root, '.tmp', `${name}.webp`), await page.screenshot({ type: 'webp', quality: 80, fullPage: true }));
  let requests = [];
  page.on('request', (r) => !r.url().endsWith('/favicon.svg') && requests.push(r.url())); // the tab icon is not a parse request
  await page.setViewportSize({ width: 1440, height: 900 });

  // AC2: every command on the install page parses with the built CLI; the installer writes where the page says.
  await page.goto(`${baseURL}/?view=install`, { waitUntil: 'load' });
  await page.waitForSelector('.install');
  if ((await page.title()) !== 'Install – Reasontrail') fail(`install title: ${await page.title()}`);
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
      }
    }
    for (const call of ['/reasontrail', '$reasontrail']) if (!installText.includes(call)) fail(`AC2: install page lacks ${call}`);
    log(`AC2: ${commands.length} commands checked against --help and the installer`);
  }
  for (const p of await axeProblems(page, 'install')) fail(p);

  // The drop zone (the canvas Open frame): header link current, the centred 640 column (x 400 at 1440), the title 96px under the header, radius 16, a ghost .btn, the privacy line.
  await page.locator('header').getByRole('link', { name: 'Open a session' }).click();
  await page.waitForSelector('[data-testid="drop-target"]');
  await page.waitForFunction(() => document.activeElement?.matches('main h1')).catch(() => fail('open: focus did not move to the page heading'));
  if ((await page.title()) !== 'Open a session – Reasontrail') fail(`open title: ${await page.title()}`);
  if ((await page.locator('header a[href="?view=open"]').getAttribute('aria-current')) !== 'page') fail('open: the header button is not aria-current="page"');
  const geo = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const t = document.querySelector('[data-testid="drop-target"]');
    return { h1: r('main h1')?.left, top: r('main h1')?.top, target: r('[data-testid="drop-target"]')?.left, right: 1440 - (r('[data-testid="drop-target"]')?.right ?? 0), radius: getComputedStyle(t).borderTopLeftRadius, h1Size: getComputedStyle(document.querySelector('main h1')).fontSize, button: document.querySelector('label.btn.ghost')?.textContent?.trim(), text: document.querySelector('main')?.textContent ?? '' };
  });
  log(`open page: ${JSON.stringify({ ...geo, text: undefined })}`);
  if (geo.h1 !== 400 || geo.target !== 400 || geo.right !== 400) fail(`open: edges ${geo.h1}/${geo.target}/${geo.right}, not 400`);
  if (Math.round(geo.top) !== 160) fail(`open: title at y ${geo.top}, not 160`);
  if (geo.radius !== '16px' || geo.h1Size !== '20px' || geo.button !== 'Choose file') fail(`open: radius ${geo.radius}, title ${geo.h1Size}, button "${geo.button}"`);
  if (!geo.text.includes(PRIVACY)) fail('V2: the drop zone lacks the privacy line');
  if (geo.text.includes('·')) fail('open: a "·" on the page');
  const input = page.locator('input[type="file"]');
  await input.focus();
  if (!(await page.evaluate(() => getComputedStyle(document.activeElement.closest('label')).outlineStyle !== 'none'))) fail('the file picker shows no focus ring');
  for (const p of await axeProblems(page, 'open')) fail(p);
  await webp('open-page');

  // V1, V2: file pick, zero requests while parsing; the v7 session page, announced, focus on its title.
  requests = [];
  await input.setInputFiles(fixture);
  await opened(page);
  if (requests.length) fail(`V1: ${requests.length} requests while parsing: ${requests.slice(0, 3)}`);
  if (!/^Map ready: \d+ episodes?, \d+ detected patterns?/.test((await live(page)) ?? '')) fail(`announce: "${await live(page)}"`);
  await page.waitForFunction(() => document.activeElement?.id === 'sess-title' && document.activeElement.tagName === 'H1').catch(() => fail('focus did not move to the session title'));
  if ((await page.title()) !== 'trouble.jsonl – Reasontrail') fail(`dropped map title: ${await page.title()}`);
  const v7 = await page.evaluate(() => ({
    tree: !!document.querySelector('[data-testid="opened"] .hero-tree svg.tree'),
    outcome: !!document.querySelector('[data-testid="opened"] .frame .res'),
    tag: document.querySelector('[data-testid="opened"] .meta .tag')?.textContent,
    actions: [...document.querySelectorAll('[data-testid="opened"] .sess-r .btn')].map((b) => b.textContent),
    old: document.querySelectorAll('[data-testid="map"], [data-region], .view-switch').length,
    edges: ['.hero-top', '.hero-tree', '.frame', '.open-after'].map((s) => Math.round(document.querySelector(`[data-testid="opened"] ${s}`)?.getBoundingClientRect().left ?? -1)),
  }));
  log(`opened: ${JSON.stringify(v7)}`);
  if (!v7.tree || !v7.outcome || v7.old) fail(`opened: not the v7 page: ${JSON.stringify(v7)}`);
  if (v7.tag !== 'trouble.jsonl') fail(`opened: meta tag "${v7.tag}"`);
  if (v7.actions.join() !== 'AI titles,Details,Share') fail(`opened: actions ${v7.actions}`);
  if (v7.edges.some((x) => x !== 120)) fail(`opened: left edges ${v7.edges}, not 120`);
  // A step from the list opens the panel; Esc closes it.
  await page.locator('[data-testid="opened"] .gl [role="treeitem"][data-row^="ep:"]').nth(2).click();
  await page.locator('[data-testid="opened"] .gl [data-row^="step:"]').first().click();
  await page.locator('aside.detail').waitFor({ timeout: 5_000 }).catch(() => fail('opened: a step did not open the panel'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('aside.detail')).catch(() => fail('opened: Esc did not close the panel'));
  await page.mouse.move(0, 0);
  for (const p of await axeProblems(page, 'opened map')) fail(p);
  await webp('open-mapped');

  // A synthetic drop anywhere on the home page shows the overlay and opens the map.
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('.gl [role="treeitem"]');
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('parse.worker')), null, { timeout: 10_000 });
  requests = [];
  if (!(await drop(page, 'trouble.jsonl', { text: fixtureText }))) fail('dragging a file shows no overlay');
  await opened(page, 10_000);
  if (requests.length) fail(`V1 drop: ${requests.length} requests: ${requests.slice(0, 3)}`);
  if (!page.url().includes('view=open')) fail(`drop did not open ?view=open: ${page.url()}`);

  // Progress and Cancel on a big file (> 2 MB), and the G2 10 MB parse budget.
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
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForFunction(() => document.querySelector('[data-role="intake-live"]')?.textContent === 'Reading cancelled');
  await page.waitForFunction(() => document.activeElement?.type === 'file').catch(() => fail('Cancel did not move focus to the file picker'));
  writeFileSync(big, repeat(10));
  const t0 = Date.now();
  await input.setInputFiles(big);
  await opened(page, 30_000);
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
  await webp('open-error');

  // AC3: offline after the first load, the drop zone still maps.
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => ['DropZone', 'parse.worker'].every((n) => performance.getEntriesByType('resource').some((e) => e.name.includes(n))), null, { timeout: 10_000 })
    .catch(() => fail('AC3: the drop zone and parse worker were not prefetched after load'));
  const favicon = readFileSync(join(root, 'public', 'favicon.svg'));
  await context.route('**/favicon.svg', (route) => route.fulfill({ body: favicon, contentType: 'image/svg+xml' }));
  await context.setOffline(true);
  await page.locator('header').getByRole('link', { name: 'Open a session' }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await opened(page, 10_000).catch(() => fail('AC3: offline drop did not map'));
  await context.setOffline(false);
  rmSync(tmp, { recursive: true, force: true });
}
