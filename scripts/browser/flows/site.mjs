// Site flow, v7 (docs/design/v7/PROMPT.md §7, §13; phase 32b): deep links. `?session=verify-fail-fix&step=s41` opens
// the Step state (blue path, callout, list, detail panel) with nothing else to do; every `?session=…&step=…` link in
// examples/README.md opens its sample with the panel on that step; an id the sample does not list is ignored; Back and
// Forward walk the selection; a tab switch clears it (URL, tree and panel); offline after the first load the tabs
// still switch. The drop zone and install checks of the pre-v7 site flow return with their restyle (phase 34).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axeProblems } from '../axe.mjs';

const state = (page) => page.evaluate(() => ({
  url: location.search,
  step: document.querySelector('aside.detail')?.getAttribute('data-step') ?? null,
  dim: !!document.querySelector('.hero-tree svg.tree.dim'),
  callout: document.querySelector('.hero-tree .callout')?.textContent ?? '',
  tab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
}));

export async function run({ page, context, baseURL, root, shot, log, fail }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?session=verify-fail-fix&step=s41`, { waitUntil: 'load' });
  await page.waitForSelector('aside.detail', { timeout: 10_000 }).catch(() => fail('the deep link opened no detail panel'));
  await page.evaluate(() => document.fonts.ready);
  const s = await state(page);
  log(`deep link ${JSON.stringify(s)}`);
  if (s.step !== 's41' || !s.dim || s.callout !== 'Inspect vitest config for log suppressionExit code 2, 16 min') fail(`deep link is not the Step state: ${JSON.stringify(s)}`);
  if (await page.evaluate(() => document.activeElement && document.activeElement !== document.body)) fail('a deep link moved focus');
  for (const p of await axeProblems(page, 'deep link, Step state')) fail(p);
  await shot('site-step-deeplink-1440');

  // Every example link.
  const readme = readFileSync(join(root, 'examples', 'README.md'), 'utf8');
  const links = [...readme.matchAll(/\]\(https:\/\/reasontrail\.geekplux\.com\/(\?session=([\w-]+)&step=(\w+))\)/g)];
  if (links.length !== 3) fail(`examples/README.md has ${links.length} deep links, not 3`);
  for (const [, search, , step] of links) {
    await page.goto(`${baseURL}/${search}`, { waitUntil: 'load' });
    await page.waitForSelector(`aside.detail[data-step="${step}"]`, { timeout: 10_000 }).catch(() => fail(`${search} opened no panel on ${step}`));
    const row = await page.locator(`[data-row="step:${step}"]`).getAttribute('aria-selected').catch(() => null);
    if (row !== 'true') fail(`${search}: the list does not select ${step}`);
    log(`example ${search}: ${await page.locator('aside.detail .d-head p').textContent()}`);
  }

  // An id the sample does not list is ignored: the plain home, the outcome column, no dimming.
  await page.goto(`${baseURL}/?session=verify-fail-fix&step=s96`, { waitUntil: 'load' });
  await page.waitForSelector('aside[aria-label="Outcome"]', { timeout: 10_000 }).catch(() => fail('an unlisted step id hid the outcome'));
  if ((await state(page)).dim) fail('an unlisted step id dimmed the tree');

  // Back and Forward, then a tab switch clears the selection.
  await page.goto(`${baseURL}/?session=verify-fail-fix&step=s41`, { waitUntil: 'load' });
  await page.waitForSelector('aside.detail');
  await page.getByRole('button', { name: 'Next step' }).click();
  await page.waitForFunction(() => location.search.endsWith('step=s43'));
  await page.goBack();
  await page.waitForSelector('aside.detail[data-step="s41"]', { timeout: 5_000 }).catch(() => fail('Back did not return to s41'));
  await page.goForward();
  await page.waitForSelector('aside.detail[data-step="s43"]', { timeout: 5_000 }).catch(() => fail('Forward did not return to s43'));
  await page.getByRole('tab', { name: 'Lint and typecheck fail, then pass' }).click();
  await page.waitForFunction(() => location.search === '?session=implementer-checks').catch(() => fail(`tab switch kept the step: ${page.url()}`));
  await page.waitForSelector('.hero-tree svg[role="img"]');
  const after = await state(page);
  if (after.step || after.dim || after.callout) fail(`tab switch left a selection: ${JSON.stringify(after)}`);

  // Offline after the first load: the other samples were fetched while idle, so the tabs still switch.
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('planner-pivot.graph')), null, { timeout: 10_000 }).catch(() => fail('the lazy samples were not prefetched'));
  const favicon = readFileSync(join(root, 'public', 'favicon.svg'));
  await context.route('**/favicon.svg', (route) => route.fulfill({ body: favicon, contentType: 'image/svg+xml' }));
  await context.setOffline(true);
  await page.getByRole('tab', { name: 'A change request rewrites the plan' }).click();
  await page.waitForFunction(() => document.getElementById('sess-title')?.textContent === 'Plan the reasoning-map pivot', null, { timeout: 5_000 }).catch(() => fail('offline tab switch did not swap the session'));
  await context.setOffline(false);
}
