// Lens flow, v7: the footer's "Next-token garden" opens the garden in
// the website's v7 header and footer (120px edges, no "·" in the chrome); a recorded lens sentence (`?sample=lens-…`)
// opens on its own offline data with the Z2 line and grows recorded branches with no request at all; its breadcrumb
// "Map" goes back to the home; More options holds the live opt-in, which calls `/api/next-tokens` only after it is
// chosen (faked), and on `vite preview` (no Worker) ends in the calm message with the garden still shown. Reduced
// motion: no animation. One 1440 light WebP goes to .tmp/ (lens-recorded).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { axeProblems } from '../axe.mjs';

const Z2 = "An open model's predictions for this text, not what the session's model computed.";
const ready = (page) => page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
/** Grows the first branch that can grow now (keys hold spaces, quotes and newlines, so by position). */
const growOne = async (page, state = 'expandable') => {
  const b = page.locator(`g.branch[data-state="${state}"] [data-role="hit"]`).first();
  if (!(await b.count())) return false;
  await b.click();
  return true;
};

/** The v7 chrome: header bar and footer present, their content on the 120px edges at 1440, no middle dot in them. */
const chrome = (page) => page.evaluate(() => {
  const left = (s) => Math.round(document.querySelector(s)?.getBoundingClientRect().left ?? -1);
  const text = [...document.querySelectorAll('header.v7.bar, footer.v7.foot')].map((e) => e.textContent).join(' ');
  return { header: left('header.v7.bar .brand'), footer: left('footer.v7.foot .brand'), garden: left('.controls > :first-child, .lens-crumbs'), dot: text.includes('·'), links: [...document.querySelectorAll('footer.v7.foot a')].map((a) => a.textContent) };
});

export async function run({ page, baseURL, root, log, fail }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const out = join(root, '.tmp');
  mkdirSync(out, { recursive: true });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const api = () => requests.filter((u) => new URL(u).pathname.startsWith('/api/'));

  // The footer link from the home opens the garden in the site's chrome.
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.locator('footer.v7.foot').getByRole('link', { name: 'Next-token garden' }).click();
  await ready(page);
  const c = await chrome(page);
  log(`garden chrome: ${JSON.stringify(c)}`);
  if (c.header !== 120 || c.footer !== 120 || c.garden !== 120) fail(`garden: edges ${c.header}/${c.garden}/${c.footer}, not 120`);
  if (c.dot) fail('garden: a "·" in the header or footer');
  if (c.links.join() !== 'Reasontrail,How to read a map,Next-token garden,GitHub') fail(`garden footer links: ${c.links}`);
  if (!(await page.locator('header.v7.bar').getByRole('button', { name: 'Copy link' }).isVisible())) fail('garden: no Copy link in the header');
  if (!(await page.locator('main .garden-notes').textContent())?.includes('nothing you do with samples leaves your browser')) fail('garden: no privacy line');
  for (const p of await axeProblems(page, 'garden')) fail(p);

  // A recorded lens sentence: offline data, the Z2 line, recorded branches grow with no request.
  await page.goto(`${baseURL}/?session=planner-pivot&sample=lens-planner-pivot-1`, { waitUntil: 'load' });
  await ready(page);
  if ((await page.locator('.lens-z2').textContent())?.trim() !== Z2) fail(`Z2 line: ${await page.locator('.lens-z2').textContent()}`);
  if (!(await page.locator('.lens-quote').textContent())?.includes('Now the planner rewrites the plan')) fail('recorded lens: no sentence');
  if (!/^Map.*Sentence$/s.test((await page.locator('.lens-breadcrumb').textContent()) ?? '')) fail('breadcrumb');
  const h1s = await page.evaluate(() => [...document.querySelectorAll('h1')].filter((h) => !h.closest('[hidden]')).map((h) => h.textContent));
  if (h1s.length !== 1 || !h1s[0].startsWith('Zoom-in lens')) fail(`the lens's h1s: ${JSON.stringify(h1s)}`);
  if ((await chrome(page)).garden !== 120) fail('recorded lens: the head is not on the 120px edge');
  const before = requests.length;
  for (let i = 0; i < 3; i++) await growOne(page);
  if ((await page.locator('g.branch[data-state="expanded"]').count()) < 2) fail('recorded branches did not grow');
  if (requests.length !== before) fail(`growing recorded branches made requests: ${requests.slice(before).join(', ')}`);
  if (api().length) fail(`API requests for a recorded sentence: ${api().join(', ')}`);
  await page.locator('.lens-options summary').click();
  if (!(await page.getByRole('button', { name: 'Grow live with an open model', exact: true }).isVisible())) fail('no live opt-in in More options');
  if (!(await page.locator('.lens-options').textContent())?.includes('Recorded, works offline')) fail('the recorded sentence does not say it works offline');
  if (!(await page.locator('.lens-options .lens-cap').textContent())?.includes('capped per day')) fail('no daily-cap note beside the live opt-in');
  const describedBy = await page.getByRole('button', { name: 'Grow live with an open model', exact: true }).evaluate((b) =>
    (b.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.className ?? null),
  );
  if (!describedBy.includes('lens-cap') || !describedBy.includes('muted')) fail(`the live opt-in's aria-describedby does not point at its note and the .lens-cap line: ${JSON.stringify(describedBy)}`);
  for (const p of await axeProblems(page, 'lens recorded')) fail(p);
  await page.locator('.lens-options summary').click();
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  writeFileSync(join(out, 'lens-recorded.webp'), await page.screenshot({ type: 'webp', quality: 80 }));

  // The breadcrumb's "Map" goes back to the home (with its sample).
  await page.locator('.lens-breadcrumb a').first().click();
  await page.waitForSelector('.v7.home .gl [role="treeitem"]', { timeout: 10_000 }).catch(() => fail('Map did not return to the home'));
  if (/[?&](sample|lens)=/.test(page.url())) fail(`Map: ${page.url()}`);

  // Live growth: nothing before the opt-in; after it, calls through /api/next-tokens; a repeated prefix is free.
  const sent = [];
  await page.route('**/api/next-tokens', async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? '{}'));
    const tokens = [' map', ' plan', ' team', ' code', ' work'].map((token, i) => ({ token, logprob: -0.6 - i * 0.5 }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: 'fake-open-model', tokens }) });
  });
  await page.goto(`${baseURL}/?sample=lens-planner-pivot-1`, { waitUntil: 'load' });
  await ready(page);
  await page.waitForTimeout(300);
  if (sent.length) fail(`live calls before the opt-in: ${sent.length}`);
  await page.locator('.lens-options summary').click();
  await page.getByRole('button', { name: 'Grow live with an open model', exact: true }).click();
  await page.locator('.lens-live').waitFor({ timeout: 5_000 }).catch(() => fail('no live status after the opt-in'));
  // The key of the branch past the recording that grows live (keys are continuations, so its children extend it).
  let liveKey = null;
  for (let i = 0; i < 8 && sent.length === 0; i++) {
    const missing = page.locator('g.branch[data-state="not-recorded"]').first();
    const b = (await missing.count()) ? missing : page.locator('g.branch[data-state="expandable"]').first();
    if (!(await b.count())) break;
    liveKey = await b.getAttribute('data-key'); // the last branch clicked is the one that called
    await b.locator('[data-role="hit"]').first().click();
    await page.waitForTimeout(300);
  }
  const opened = sent.length;
  if (opened < 1 || opened > 2 || sent.some((b) => b.k !== 5)) fail(`live calls after the opt-in: ${JSON.stringify(sent)}`);
  if (liveKey === null || !opened) fail('no branch past the recording grew live');
  else {
    // A branch by its key (any text): its index among the drawn branches, so no selector escaping.
    const hitOf = async (key) => {
      const i = await page.locator('g.branch[data-key]').evaluateAll((els, k) => els.findIndex((e) => e.getAttribute('data-key') === k), key);
      return page.locator('g.branch[data-key]').nth(i).locator('[data-role="hit"]').first();
    };
    const state = async () => (await page.locator('g.branch[data-key]').evaluateAll((els, k) => els.find((e) => e.getAttribute('data-key') === k)?.getAttribute('data-state'), liveKey));
    if ((await state()) !== 'expanded') fail(`the live branch is ${await state()}, not expanded`);
    await (await hitOf(liveKey)).click(); // collapse
    await (await hitOf(liveKey)).click(); // open again: from the cache
    await page.waitForTimeout(300);
    if (sent.length !== opened) fail(`a repeated prefix made ${sent.length - opened} more calls`);
    const child = await page.locator('g.branch[data-state="expandable"]').evaluateAll((els, k) => els.map((e) => e.getAttribute('data-key')).find((key) => key !== k && key?.startsWith(k)), liveKey);
    if (!child) fail('no live child branch to grow');
    else {
      await (await hitOf(child)).click();
      await page.waitForTimeout(300);
      if (sent.length !== opened + 1) fail(`growing a new live branch made ${sent.length - opened} calls`);
    }
  }
  await page.unroute('**/api/next-tokens');

  // No Worker behind `vite preview`: a live call ends in the calm message, and the garden still shows.
  await page.goto(`${baseURL}/?sample=lens-planner-pivot-1`, { waitUntil: 'load' });
  await ready(page);
  await page.locator('.lens-options summary').click();
  await page.getByRole('button', { name: 'Grow live with an open model', exact: true }).click();
  // A branch past the recording grows live, and the preview has no Worker behind /api/next-tokens.
  for (let i = 0; i < 8 && !(await page.locator('.lens-status .inline-note').count()); i++) {
    if (!(await growOne(page, 'not-recorded')) && !(await growOne(page))) break;
    await page.waitForTimeout(300);
  }
  const msg = (await page.locator('.lens-status').textContent()) ?? '';
  if (!msg.includes("Live growth isn't available here")) fail(`no-Worker message missing: "${msg.trim()}"`);
  if (!(await page.locator('[data-testid="garden"][data-ready="true"]').isVisible())) fail('the garden is gone after a failed live call');

  // Reduced motion: the lens opens with no transition time.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.lens-head')).animationDuration);
  if (dur !== '0s') fail(`reduced motion: lens animation ${dur}`);
  log(`requests: ${requests.length}, live calls faked: ${sent.length}, no-Worker: "${msg.trim()}"`);
}
