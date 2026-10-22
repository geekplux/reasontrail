// Chat flow (phase 23): paste text → map (T1); a ChatGPT and a Claude export → picker → map (T2); a share link → the
// paste-text message with focus back on the paste box (T3); zero requests while parsing (T4, V1); the paste box is the
// focal point (CL1) with few chrome controls; the drop zone's unsupported message links here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axeProblems } from '../axe.mjs';

const ready = (page) => page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 15_000 });
const SHARE = "Share links can't be read from here; paste the conversation text instead.";

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
  if ((await page.title()) !== 'Map a chat · Reasontrail') fail(`chat title: ${await page.title()}`);
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
  const said = await page.locator('[data-role="intake-live"]').textContent();
  if (!/^Map ready: 4 episodes, 1 detected pattern$/.test(said ?? '')) fail(`paste announce: "${said}"`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  for (const p of await axeProblems(page, 'chat map')) fail(p);
  await page.screenshot({ path: join(root, '.tmp', 'chat-map.webp'), type: 'webp', quality: 80 });
  log('pasted ChatGPT text mapped: 4 episodes, 1 detected pattern');

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

  // T2: exports open a searchable picker, then the picked map (zero requests).
  for (const [kind, pick, count] of [['chatgpt', 'Garden club name', 3], ['claude', 'Dense bread bottom', 2]]) {
    requests = [];
    await page.locator('.file-link input[type="file"]').setInputFiles(join(chats, kind, 'conversations.json'));
    const search = page.getByLabel('Search by title');
    await search.waitFor({ timeout: 5_000 });
    if (!(await search.evaluate((el) => el === document.activeElement))) fail(`${kind}: the picker search is not focused`);
    if ((await page.locator('.chat-choice').count()) !== count) fail(`${kind}: the picker lists ${await page.locator('.chat-choice').count()}, not ${count}`);
    if (kind === 'chatgpt') for (const p of await axeProblems(page, 'chat picker')) fail(p);
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
