// Samples flow (phase 6): the picker by mouse and keyboard, `?sample=` deep links and the unknown-sample notice,
// a recorded spine grown to depth 5, everything still working offline after load (O2), and mobile.
// Expectations come from the committed sample JSON, so re-recording a garden does not break the flow.
import { readFileSync } from 'node:fs';
import { axeProblems } from '../axe.mjs';
import { loadSample } from '../lib.mjs';

const IDS = ['lighthouse', 'robot', 'language', 'autumn', 'recipe', 'cat'];
const S = Object.fromEntries(IDS.map((id) => [id, loadSample(id)]));
const hit = (key) => `g.branch[data-key="${key}"] [data-role="hit"]`;
/** Waits for the garden (of the sample titled `want`, when given) to be drawn. */
async function ready(page, want) {
  if (want) await page.waitForFunction((t) => document.querySelector('#specimen-title')?.textContent === t, want, { timeout: 5_000 }).catch(() => {});
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
}
const title = (page) => page.locator('#specimen-title').textContent();
const selected = (page) => page.locator('[data-role="value-label"]').getAttribute('data-key').catch(() => null);
const search = (page, want) => page.waitForFunction((w) => window.location.search === w, want, { timeout: 2_000 }).then(() => true, () => false);
/** The key reached by following child ranks from the root. */
const keyAt = (sample, ranks) => ranks.reduce((key, r) => key + sample.nodes[key][r].token, '');
/** The deepest recorded chain: keys from depth 1 down to the first recorded key of the given depth. */
function spine(sample, depth) {
  const walk = (key, d) => {
    if (d === depth) return [key];
    for (const c of sample.nodes[key] ?? []) {
      const rest = Object.hasOwn(sample.nodes, key + c.token) && walk(key + c.token, d + 1);
      if (rest) return d === 0 ? rest : [key, ...rest];
    }
    return null;
  };
  return walk('', 0);
}
/** Grows every not-yet-grown branch on `keys`, in order. */
async function grow(page, keys) {
  for (const key of keys) {
    const g = page.locator(`g.branch[data-key="${key}"]`);
    if ((await g.getAttribute('data-state')) === 'expandable') await page.locator(hit(key)).click();
    await page.waitForSelector(`g.branch[data-key="${key}"][data-state="expanded"]`, { timeout: 2_000 });
  }
}

export async function run({ page, context, baseURL, shot, log, fail }) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseURL}/?sample=lighthouse`, { waitUntil: 'load' });
  await ready(page);

  // F2 by mouse: six options, the default chosen; choosing one opens it with the default expansion and its own URL.
  const radios = page.locator('input[type="radio"][name="sample"]');
  const values = await radios.evaluateAll((rs) => rs.map((r) => `${r.value}${r.checked ? '*' : ''}`));
  if (values.join() !== IDS.map((id, i) => (i ? id : `${id}*`)).join()) fail(`F2: picker options ${values}`);
  await page.getByRole('radio', { name: new RegExp(`^${S.robot.title}`) }).click();
  await ready(page, S.robot.title);
  if ((await title(page)) !== S.robot.title || !(await search(page, '?sample=robot'))) fail(`F2 mouse: title ${await title(page)}, url ${page.url()}`);
  const recordedWith = await page.locator('.specimen-fields').textContent();
  if (!recordedWith.includes('SmolLM2-135M') || !recordedWith.includes(S.robot.recordedAt.slice(0, 4))) fail(`F12: label says ${recordedWith}`);

  // F2 by keyboard: arrows move the choice within the group; the chosen one keeps a visible focus ring.
  await page.locator('input[name="sample"]:checked').focus();
  await page.keyboard.press('ArrowRight');
  await ready(page, S.language.title);
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  if ((await title(page)) !== S.language.title || !(await search(page, '?sample=language')) || ring === 'none') fail(`F2 keyboard: title ${await title(page)}, url ${page.url()}, outline ${ring}`);
  for (const p of await axeProblems(page, 'samples picker')) fail(p);
  await shot('samples-picker');

  // Deep links: a fork in another garden, and an unknown garden falling back with the notice (§3.6).
  await page.goto(`${baseURL}/?sample=cat&path=0.1`, { waitUntil: 'load' });
  await ready(page);
  const fork = keyAt(S.cat, [0, 1]);
  if ((await title(page)) !== S.cat.title || (await selected(page)) !== fork) fail(`F2 deep link: title ${await title(page)}, selected ${await selected(page)}`);
  if (!(await page.getByRole('radio', { name: new RegExp(`^${S.cat.title}`) }).isChecked())) fail('F2 deep link: cat not chosen in the picker');
  await shot('samples-cat-deeplink');
  await page.goto(`${baseURL}/?sample=nope`, { waitUntil: 'load' });
  await ready(page);
  const notice = await page.locator('.garden-figure > .inline-note').textContent().catch(() => null);
  if ((await title(page)) !== S.lighthouse.title || !notice?.includes("That garden isn't here")) fail(`F2 unknown: title ${await title(page)}, notice ${notice}`);

  // A recorded spine grown to depth 5: its depth-6 branches appear.
  await page.goto(`${baseURL}/?sample=cat`, { waitUntil: 'load' });
  await ready(page);
  const chain = spine(S.cat, 5);
  if (!chain) fail('cat has no recorded chain to depth 5');
  else {
    await grow(page, chain);
    const deep = await page.locator('g.branch[data-depth="6"]').count();
    log(`spine ${JSON.stringify(chain.at(-1))}: ${deep} depth-6 branches`);
    if (deep !== S.cat.nodes[chain.at(-1)].length) fail(`spine: ${deep} depth-6 branches`);
    await page.locator(hit(chain.at(-1))).hover();
    await page.waitForTimeout(700); // let the newest branches finish growing in
    await shot('samples-spine-depth5');
  }

  // O2: after load, offline: switch gardens, grow a branch, and go Back to a share link, all with no network.
  await page.goto(`${baseURL}/?sample=lighthouse`, { waitUntil: 'load' });
  await ready(page);
  const entered = keyAt(S.lighthouse, [1]);
  await page.locator(hit(entered)).click();
  if (!(await search(page, '?sample=lighthouse&path=1'))) fail(`O2: url after selecting ${entered} is ${page.url()}`);
  // Chrome re-asks for the favicon on each history step; a real browser answers that from its cache, so do the same.
  const favicon = readFileSync(new URL('../../../public/favicon.svg', import.meta.url));
  await context.route('**/favicon.svg', (route) => route.fulfill({ body: favicon, contentType: 'image/svg+xml' }));
  await context.setOffline(true);
  await page.getByRole('radio', { name: new RegExp(`^${S.autumn.title}`) }).click();
  await ready(page, S.autumn.title);
  await grow(page, spine(S.autumn, 2) ?? []);
  if ((await title(page)) !== S.autumn.title || !(await search(page, '?sample=autumn'))) fail(`O2 switch: title ${await title(page)}, url ${page.url()}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await shot('samples-offline');
  await page.goBack();
  await ready(page, S.lighthouse.title);
  if ((await title(page)) !== S.lighthouse.title || (await selected(page)) !== entered) fail(`O2 back: title ${await title(page)}, selected ${await selected(page)}`);
  await context.setOffline(false);

  // Mobile: the picker wraps, nothing overflows the page.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/?sample=recipe`, { waitUntil: 'load' });
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`mobile: page overflows horizontally by ${overflow}px`);
  for (const p of await axeProblems(page, 'samples mobile')) fail(p);
  await shot('samples-mobile');
}
