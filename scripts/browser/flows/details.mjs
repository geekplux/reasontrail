// Details flow (phase 17), keyboard only: Enter on a pattern opens the detail panel with focus on its title (M3, G1),
// Esc returns focus to the map item, Back/Forward follow `?step=` (M9), a side trail expands in place and dims the
// route by colour (DM18), an edit diff and Show raw render markup as text (AC2, DM19) in a CLI file map (`#step=`),
// unstored thinking is shown honestly (M6), the mobile bottom sheet (DM17), dark mode, reduced motion and axe (all
// impacts) with the panel open.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STRUCTURE_RULES, axeProblems } from '../axe.mjs';

const ALL = { includes: () => true }; // every axe violation fails, whatever its impact
const sample = (id) => JSON.parse(readFileSync(new URL(`../../../src/sessions/samples/${id}.graph.json`, import.meta.url), 'utf8'));
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { nav: a?.getAttribute('data-nav') ?? '', cls: a?.className ?? '', kind: a?.getAttribute('data-episode-kind') ?? '', expanded: a?.getAttribute('aria-expanded') ?? '' };
});
const live = (page) => page.locator('[data-role="live"]').textContent();
const panel = (page) => page.locator('[data-testid="detail-panel"]');

async function open(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="map"][data-ready="true"][data-view="map"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
}

/** Tab until focus is in the map; returns whether it got there. */
async function tabToMap(page) {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    if ((await active(page)).nav) return true;
  }
  return false;
}

async function titleFocused(page) {
  return page.evaluate(() => {
    const p = document.querySelector('[data-testid="detail-panel"]');
    return Boolean(p && document.activeElement?.id && document.activeElement.id === p.getAttribute('aria-labelledby'));
  });
}

export async function run({ page, context, baseURL, root, shot, log, fail }) {
  page.on('dialog', (d) => {
    fail(`a dialog opened (${d.message()}): markup was run`);
    void d.dismiss();
  });

  // M3 / G1: Tab reaches the map, ] jumps to the first pattern, Enter opens its details with focus on the title.
  await open(page, `${baseURL}/?session=implementer-checks`);
  if (!(await tabToMap(page))) return fail('Tab never reached the map');
  await page.keyboard.press(']');
  const blaze = (await active(page)).nav;
  if (!blaze.startsWith('blaze:')) fail(`] focused ${blaze}`);
  await page.keyboard.press('Enter');
  if (!(await panel(page).isVisible())) return fail('Enter did not open the panel');
  if (!(await titleFocused(page))) fail('focus is not on the panel title');
  if (!/^Details: /.test((await live(page)) ?? '')) fail(`live region: ${await live(page)}`);
  if (!/[?&]step=s\d+/.test(page.url())) fail(`no ?step= in ${page.url()}`);
  const block = panel(page).locator('.step-block');
  if ((await block.getAttribute('data-tool')) !== 'Bash' || !/failed/.test((await block.textContent()) ?? '')) fail(`first evidence is not a failed Bash run: ${await block.textContent()}`);
  if (!(await panel(page).getByText(/\d+\.jsonl:\d+/).first().isVisible())) fail('no provenance line');
  // ← → move through the evidence from the title; the step strip follows.
  const first = await block.getAttribute('data-step');
  await page.keyboard.press('ArrowRight');
  if ((await block.getAttribute('data-step')) === first) fail('→ on the panel did not move to the next evidence');
  await page.keyboard.press('ArrowLeft');
  if ((await page.locator('.step-rows button[aria-current="true"]').count()) !== 1) fail('the step strip has no selected row');
  for (const p of await axeProblems(page, 'panel open', ALL)) fail(p);
  await shot('details-bash-error');
  // Esc closes and focus returns to the pattern; Back reopens, Forward closes again (M9).
  await page.keyboard.press('Escape');
  if (await panel(page).count()) fail('Esc did not close the panel');
  if ((await active(page)).nav !== blaze) fail(`Esc returned focus to ${(await active(page)).nav}`);
  await page.goBack();
  await page.waitForTimeout(100);
  if (!(await panel(page).count())) fail('Back did not reopen the details');
  await page.goForward();
  await page.waitForTimeout(100);
  if (await panel(page).count()) fail('Forward did not close the details');
  // Back from the panel title closes it with focus on the map item, never <body>; Forward from <body> focuses the title.
  await page.keyboard.press('Enter');
  if (!(await titleFocused(page))) fail('reopen: focus is not on the panel title');
  await page.goBack();
  await page.waitForTimeout(100);
  if (await panel(page).count()) fail('Back from the title did not close the details');
  if (!(await active(page)).nav) fail(`Back from the title left focus on ${(await active(page)).cls || 'body'}`);
  await page.evaluate(() => document.activeElement?.blur());
  await page.goForward();
  await page.waitForTimeout(100);
  if (!(await panel(page).count()) || !(await titleFocused(page))) fail('Forward from <body> did not reopen the details with focus on the title');

  // M6: unstored thinking, via a deep link: no focus move, the honesty label repeated.
  const g = sample('implementer-checks');
  const thinking = g.steps.find((s) => s.kind === 'thinking' && (s.textStored === false || !s.text));
  await open(page, `${baseURL}/?session=implementer-checks&step=${thinking.id}`);
  const text = (await panel(page).textContent()) ?? '';
  if (!text.includes('thinking (text not stored)') || !(await panel(page).locator('[data-honesty="detail"]').isVisible())) fail('unstored thinking: text or honesty label missing');
  await shot('details-thinking-not-stored');

  // M4 / DM18: a side trail expands in place; the route dims by colour, never opacity; Esc unwinds.
  await open(page, `${baseURL}/?session=verify-fail-fix`);
  await tabToMap(page);
  for (let i = 0; i < 12 && (await active(page)).kind !== 'delegate'; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const lane = (await active(page)).nav;
  if (!lane.startsWith('lane:')) fail(`↓ from a delegate episode focused ${lane}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  if ((await active(page)).expanded !== 'true' || !/^Lane expanded, \d+ episodes?/.test((await live(page)) ?? '')) fail(`lane did not expand: ${await live(page)}`);
  await page.keyboard.press('ArrowDown');
  const lep = (await active(page)).nav;
  if (!lep.startsWith('lep:')) fail(`↓ into the expanded lane focused ${lep}`);
  await page.keyboard.press('Enter');
  const dim = await page.evaluate(() => {
    const low = [...document.querySelectorAll('.route-app *')].filter((e) => Number(getComputedStyle(e).opacity) < 1).length;
    const line = document.querySelector('.route-canvas .route-line');
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--tg-ink-muted').trim();
    return { low, stroke: line ? getComputedStyle(line).stroke : '', muted };
  });
  if (dim.low > 0) fail(`${dim.low} map elements have opacity < 1`);
  log(`dimmed route stroke ${dim.stroke} (muted ${dim.muted})`);
  await page.waitForTimeout(250); // the panel slides in over 160 ms
  await shot('details-subagent');
  await page.keyboard.press('Escape');
  if ((await active(page)).nav !== lep) fail('Esc from the panel did not return to the lane episode');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  if ((await active(page)).nav !== lane || (await active(page)).expanded !== 'false') fail('Esc did not collapse the lane onto its item');

  // AC2 / DM19: the CLI's file map of the details fixture: the edit diff and Show raw are text; #step= links.
  const cli = join(root, 'cli', 'dist', 'cli.mjs');
  if (!existsSync(cli)) return fail('cli/dist/cli.mjs is missing: run pnpm build:cli');
  const sb = join(root, '.tmp', 'details-sandbox');
  rmSync(sb, { recursive: true, force: true });
  mkdirSync(join(sb, 'home'), { recursive: true });
  const out = join(sb, 'details.html');
  const r = spawnSync(process.execPath, [cli, join(root, 'fixtures', 'sessions', 'claude-code', 'details.jsonl'), '--no-open', '--out', out], { env: { PATH: process.env.PATH, HOME: join(sb, 'home'), TMPDIR: sb }, encoding: 'utf8', timeout: 20_000 });
  if (r.status !== 0) return fail(`cli details.jsonl: exit ${r.status} ${r.stderr}`);
  await open(page, pathToFileURL(out).href);
  await tabToMap(page);
  let found = false;
  for (let e = 0; e < 8 && !found; e++) {
    await page.keyboard.press('Enter');
    for (let i = 0; i < 16 && !found; i++) {
      found = (await panel(page).locator('.step-block[data-tool="Edit"]').count()) > 0;
      if (!found) await page.keyboard.press('ArrowRight');
    }
    if (!found) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('ArrowRight');
    }
  }
  if (!found) return fail('no Edit step reachable by keyboard');
  const diff = await panel(page).evaluate((p) => ({ del: [...p.querySelectorAll('.d-del')].map((e) => e.textContent), add: [...p.querySelectorAll('.d-add')].map((e) => e.textContent), tags: p.querySelectorAll('img, script, b').length }));
  if (!diff.del.some((t) => t.includes('<img src=x onerror=alert(1)>')) || !diff.add.some((t) => t.includes('</script>')) || diff.tags > 0) fail(`edit diff not rendered as text: ${JSON.stringify(diff)}`);
  if (!diff.del.every((t) => t.startsWith('−')) || !diff.add.every((t) => t.startsWith('+'))) fail('diff lines lack their − / + prefixes');
  if (!/#step=s\d+$/.test(page.url())) fail(`file map link is not #step=: ${page.url()}`);
  await panel(page).getByRole('button', { name: 'Show raw' }).focus();
  await page.keyboard.press('Enter');
  const pre = panel(page).locator('.raw-pre').first();
  if (!((await pre.textContent()) ?? '').includes('"name":"Edit"')) fail('Show raw did not show the verbatim record');
  const stepBefore = await panel(page).locator('.step-block').getAttribute('data-step');
  await pre.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press(']');
  if ((await panel(page).locator('.step-block').getAttribute('data-step')) !== stepBefore) fail('arrow or ] acted inside the raw <pre>');
  for (const p of await axeProblems(page, 'file map, raw open', [...STRUCTURE_RULES, 'scrollable-region-focusable'])) fail(p);
  await shot('details-edit-diff');
  rmSync(sb, { recursive: true, force: true });

  // DM17: the mobile bottom sheet, Expand/Collapse, and scroll padding so focus is never covered.
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `${baseURL}/?session=implementer-checks`);
  await tabToMap(page);
  await page.keyboard.press(']');
  const mBlaze = (await active(page)).nav;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250); // the sheet slides in over 160 ms
  const box = await panel(page).boundingBox();
  if (!box || Math.abs(box.y + box.height - 844) > 2 || Math.abs(box.height - 844 * 0.6) > 4) fail(`sheet box ${JSON.stringify(box)}`);
  if (!(await titleFocused(page))) fail('mobile: focus is not on the sheet title');
  const pad = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
  if (Math.abs(parseFloat(pad) - 844 * 0.6) > 2) fail(`scroll-padding-bottom ${pad}`);
  const covered = await page.evaluate((id) => {
    const el = document.querySelector(`[data-nav="${CSS.escape(id)}"]`);
    el?.focus();
    const sheet = document.querySelector('[data-testid="detail-panel"]').getBoundingClientRect();
    return (el?.getBoundingClientRect().bottom ?? 0) > sheet.top + 1;
  }, mBlaze);
  if (covered) fail('mobile: the focused map item is covered by the sheet');
  await shot('details-mobile-sheet');
  await panel(page).getByRole('button', { name: 'Expand' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const tall = (await panel(page).boundingBox())?.height ?? 0;
  if (Math.abs(tall - 844 * 0.9) > 4) fail(`expanded sheet ${tall}px`);
  if (!(await panel(page).getByRole('button', { name: 'Collapse' }).isVisible())) fail('no Collapse button');
  await page.keyboard.press('Escape');
  if ((await active(page)).nav !== mBlaze) fail('mobile: Esc did not return focus to the pattern');

  // WCAG 2.4.11: Tab from the sheet title on through the footer, and Shift+Tab back from it: no focused element sits
  // entirely below the sheet's top edge (the page has room to scroll it above the sheet).
  for (const [w, h] of [[390, 844], [320, 225]]) {
    await page.setViewportSize({ width: w, height: h });
    await open(page, `${baseURL}/?session=implementer-checks`);
    await tabToMap(page);
    await page.keyboard.press(']');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    if (!(await titleFocused(page))) fail(`${w}×${h}: focus is not on the sheet title`);
    const where = () => page.evaluate(() => {
      const a = document.activeElement;
      const p = document.querySelector('[data-testid="detail-panel"]');
      if (!a || a === document.body || !p || p.contains(a)) return null;
      const rect = a.getBoundingClientRect();
      return { below: rect.top >= p.getBoundingClientRect().top, footer: Boolean(a.closest('footer')), what: `${a.tagName.toLowerCase()} “${(a.textContent ?? '').trim().slice(0, 30)}”` };
    });
    let footer = false;
    let stops = 0;
    for (const dir of ['Tab', 'Shift+Tab']) {
      await page.locator('[data-testid="detail-panel"] h2').focus();
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press(dir);
        const at = await where();
        if (dir === 'Tab' && !at && footer) break;
        if (!at) continue;
        stops++;
        footer ||= at.footer;
        if (at.below) fail(`${w}×${h}: ${dir} focused ${at.what} behind the sheet`);
      }
    }
    if (!footer) fail(`${w}×${h}: Tab from the sheet never reached the footer`);
    log(`${w}×${h}: ${stops} focus stops outside the sheet checked`);
    await page.keyboard.press('Escape');
  }

  // Dark and reduced motion with the panel open.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await open(page, `${baseURL}/?session=implementer-checks`);
  await tabToMap(page);
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  const anim = await panel(page).evaluate((p) => getComputedStyle(p).animationDuration);
  if (parseFloat(anim) !== 0) fail(`reduced motion: panel animation ${anim}`);
  for (const p of await axeProblems(page, 'panel open, dark', ALL)) fail(p);
  await shot('details-dark');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  void context;
}
