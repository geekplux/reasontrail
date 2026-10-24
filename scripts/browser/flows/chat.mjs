// Chat flow (phase 23): paste text → map (T1); a ChatGPT and a Claude export → picker → map (T2); a share link → the
// paste-text message with focus back on the paste box (T3); zero requests while parsing (T4, V1); the paste box is the
// focal point (CL1) with few chrome controls; the drop zone's unsupported message links here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axeProblems } from '../axe.mjs';

const ready = (page) => page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });
const SHARE = "We couldn't read that link. Paste the conversation text instead.";

export async function run({ page, baseURL, root, log, fail }) {
  const chats = join(root, 'fixtures', 'chats');
  let requests = [];
  page.on('request', (r) => !r.url().endsWith('/favicon.svg') && requests.push(r.url()));
  await page.setViewportSize({ width: 1440, height: 900 });

  // The drop zone's unsupported message offers the paste page, which focuses the paste box.
  await page.goto(`${baseURL}/?view=open`, { waitUntil: 'load' });
  await page.locator('input[type="file"]').setInputFiles({ name: 'notes.jsonl', mimeType: 'application/jsonl', buffer: Buffer.from('{"a":1}\n') });
  const offer = page.getByRole('link', { name: 'For a chat, paste the conversation text instead.' });
  await offer.waitFor({ timeout: 5_000 }).catch(() => fail('unsupported file: no link to the paste page'));
  await offer.click();
  await page.waitForFunction(() => document.activeElement?.id === 'chat-text').catch(() => fail('the paste page did not focus the paste box'));
  if ((await page.title()) !== 'Map a chat – Reasontrail') fail(`chat title: ${await page.title()}`);
  const box = await page.locator('#chat-text').boundingBox();
  if (!box || box.y + box.height > 900) fail(`CL1: the paste box is not inside the first viewport (${JSON.stringify(box)})`);
  for (const p of await axeProblems(page, 'chat paste')) fail(p);

  // T1: pasted ChatGPT text maps, with zero requests.
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('parse.worker')), null, { timeout: 10_000 }).catch(() => {});
  await page.locator('#chat-text').fill(readFileSync(join(chats, 'pasted-chatgpt.txt'), 'utf8'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, '.tmp', 'chat-paste.webp'), type: 'webp', quality: 80 });
  requests = [];
  await page.getByRole('button', { name: 'Map this conversation' }).click();
  await ready(page);
  if (requests.length) fail(`V1 paste: ${requests.length} requests: ${requests.slice(0, 3)}`);
  const label = await page.locator('[data-region="task"]').first().textContent();
  if (!/CHAT/i.test(label ?? '')) fail(`the task label does not say CHAT: ${label?.slice(0, 80)}`);
  // CM1 / CM3: the meta line starts with the source and ends with the "pasted" tag; the chat's own honesty line; the controls come after the map.
  const meta = await page.locator('.task-meta .meta-item').allTextContents();
  if (meta[0] !== 'Chat' || meta.at(-1) !== 'pasted') fail(`CM3: meta line "${meta.join(', ')}"`);
  if (!(label ?? '').includes("The replies are the model's own account, not a record of how it computed them.")) fail('CM1: no chat honesty line');
  if (!(await page.locator('[data-testid="map"] ~ .open-after').count())) fail('CM3: Map another chat and Save are not after the map');
  const said = await page.locator('[data-role="intake-live"]').textContent();
  if (!/^Map ready: 3 episodes, 1 detected pattern$/.test(said ?? '')) fail(`paste announce: "${said}"`);
  // A chat's own wording: two neutral glance rows, a final-answer destination, and only the legend entries it uses.
  const rows = await page.locator('[data-region="glance"] li').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-glance')}:${e.getAttribute('data-status')}`));
  if (rows.join() !== 'turns:unknown,trouble:ok') fail(`chat glance rows: ${rows}`);
  const dest = await page.locator('#h-outcome').textContent();
  if (!/Destination\s*final answer$/.test(dest ?? '')) fail(`chat destination heading: "${dest}"`);
  if (await page.locator('[data-region="outcome"] .sub-label').count()) fail('chat destination still shows the files or verification columns');
  const legend = await page.locator('.route-head .legend li').allTextContents();
  if (legend.join() !== 'ask,answer,resolved') fail(`chat legend: ${legend}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  for (const p of await axeProblems(page, 'chat map')) fail(p);
  await page.screenshot({ path: join(root, '.tmp', 'chat-map.webp'), type: 'webp', quality: 80 });
  log('pasted ChatGPT text mapped: 3 episodes, 1 detected pattern');
  // Phase 25 review: the answer-only destination's label lines up with "Where it got stuck".
  const tops = await page.evaluate(() => ['#h-stuck', '#h-outcome'].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1));
  if (Math.abs(tops[0] - tops[1]) > 1) fail(`chat bottom band: stuck label at ${tops[0]}, destination label at ${tops[1]}`);
  // On a phone the destination bar opens the final answer's step, not an empty "0 files changed".
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.dest-bar').click();
  await page.locator('[data-testid="detail-panel"] .step-block').waitFor({ timeout: 5_000 }).catch(() => fail('chat dest bar: no step in the detail panel'));
  if (/0 files changed/.test((await page.locator('[data-testid="detail-panel"]').textContent()) ?? '')) fail('chat dest bar opened "0 files changed"');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });

  // Alternating fallback says so on the map.
  await page.getByRole('button', { name: 'Map another chat' }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'chat-text').catch(() => fail('Map another chat did not focus the paste box'));
  await page.locator('#chat-text').fill(readFileSync(join(chats, 'pasted-plain.txt'), 'utf8'));
  await page.getByRole('button', { name: 'Map this conversation' }).click();
  await ready(page);
  if (!(await page.getByText('No speaker names were found').first().isVisible())) fail('the alternating-turns note is not shown');

  // T3: a share link is not fetched; the message shows and the paste box keeps focus.
  await page.getByRole('button', { name: 'Map another chat' }).click();
  await page.locator('#chat-text').fill('https://chatgpt.com/share/0000-fixture');
  requests = [];
  await page.getByRole('button', { name: 'Map this conversation' }).click();
  await page.waitForFunction((m) => document.querySelector('[role="alert"]')?.textContent?.includes(m), SHARE, { timeout: 5_000 }).catch(() => fail('T3: no share-link message'));
  if (!(await page.evaluate(() => document.activeElement?.id === 'chat-text'))) fail('T3: the paste box does not have focus');
  if (requests.length) fail(`T4: the share link caused ${requests.length} requests: ${requests.slice(0, 3)}`);
  if ((await page.locator('#chat-text').getAttribute('aria-describedby')) !== 'chat-text-hint intake-error') fail('T3: the paste box is not described by the message');
  // The same link again: the message is re-added (so it is announced again) and focus stays.
  await page.evaluate(() => {
    window.tgAlerts = 0;
    new MutationObserver((records) => (window.tgAlerts += records.length)).observe(document.querySelector('[role="alert"]'), { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: 'Map this conversation' }).click();
  await page.waitForFunction(() => window.tgAlerts >= 2, null, { timeout: 3_000 }).catch(() => fail('T3: a repeated share link is not announced again'));

  // T2: exports open a searchable picker, then the picked map (zero requests).
  for (const [kind, pick, count] of [['chatgpt', 'Garden club name', 3], ['claude', 'Dense bread bottom', 2]]) {
    requests = [];
    await page.locator('.file-link input[type="file"]').setInputFiles(join(chats, kind, 'conversations.json'));
    const search = page.getByLabel('Search by title');
    await search.waitFor({ timeout: 5_000 });
    if (!(await search.evaluate((el) => el === document.activeElement))) fail(`${kind}: the picker search is not focused`);
    if ((await page.locator('.chat-choice').count()) !== count) fail(`${kind}: the picker lists ${await page.locator('.chat-choice').count()}, not ${count}`);
    if (kind === 'chatgpt') for (const p of await axeProblems(page, 'chat picker')) fail(p);
    if (kind === 'chatgpt') {
      // Escape in the search goes back to the paste box; the export opens the picker again.
      await search.press('Escape');
      await page.waitForFunction(() => document.activeElement?.id === 'chat-text', null, { timeout: 3_000 }).catch(() => fail('Escape in the picker did not return to the paste box'));
      await page.locator('.file-link input[type="file"]').setInputFiles(join(chats, kind, 'conversations.json'));
      await search.waitFor({ timeout: 5_000 });
    }
    await search.fill(pick.split(' ')[0].toLowerCase());
    if ((await page.locator('.chat-choice').count()) !== 1) fail(`${kind}: search did not narrow the list`);
    await page.locator('.chat-choice').first().click();
    await ready(page);
    if (requests.length) fail(`V1 ${kind}: ${requests.length} requests: ${requests.slice(0, 3)}`);
    const h1 = await page.locator('h1.open-file').textContent();
    if (!h1?.includes(`conversations.json › ${pick}`)) fail(`${kind}: map heading is "${h1}"`);
    log(`${kind} export → picker → "${pick}"`);
    await page.getByRole('button', { name: 'Map another chat' }).click();
  }
}
