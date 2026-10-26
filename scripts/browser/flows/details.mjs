// Details flow, v7 (docs/design/v7/PROMPT.md §4.5, §5.4, §9.6; phase 32b), keyboard only: Tab into the list, open
// episode 6 of verify-fail-fix, Enter on its failed step opens the detail panel (focus stays in the list) and lights
// the step in the tree; the panel shows the command, the output, the next step and the source; Previous step is
// greyed on the episode's first step (s41) and stays there, Next and Previous walk s43 and back; Esc in the list closes the panel, a second Esc closes the episode. Under reduced motion
// nothing transitions.
import { axeProblems } from '../axe.mjs';

export async function run({ page, baseURL, shot, log, fail }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('.gl [role="treeitem"]', { timeout: 10_000 });

  const row = () => page.evaluate(() => (document.activeElement?.getAttribute('role') === 'treeitem' ? document.activeElement.getAttribute('data-row') : null));
  let tabs = 0;
  while (!(await row()) && tabs++ < 80) await page.keyboard.press('Tab');
  if (!(await row())) return fail('Tab never reached the list');
  const walk = async (key) => {
    for (let i = 0; i < 80 && (await row()) !== key; i++) await page.keyboard.press('ArrowDown');
    if ((await row()) !== key) fail(`ArrowDown never reached ${key}`);
    return (await row()) === key;
  };
  if (!(await walk('ep:e18'))) return;
  await page.keyboard.press('ArrowRight'); // open episode 6
  await page.keyboard.press('ArrowDown'); // its first step, s41
  await page.keyboard.press('Enter');
  await page.waitForSelector('aside.detail', { timeout: 5_000 }).catch(() => fail('Enter on a step opened no detail panel'));
  const m = await page.evaluate(() => {
    const p = document.querySelector('aside.detail');
    return {
      focus: document.activeElement?.getAttribute('data-row'),
      url: location.search,
      tree: document.querySelector('.hero-tree svg.tree')?.classList.contains('dim'),
      cmd: p?.querySelector('pre.cmd')?.textContent,
      labels: [...(p?.querySelectorAll('.d-label') ?? [])].map((h) => h.textContent),
      next: p?.querySelector('.d-next p')?.textContent,
      src: p?.querySelector('.d-src')?.textContent,
      transitions: [...document.querySelectorAll('.hero-tree path.b, .gl-row, .v7 .btn')].map((el) => getComputedStyle(el).transitionDuration).filter((d) => d.split(',').some((x) => parseFloat(x) > 0)).length,
      radius: p ? getComputedStyle(p).borderRadius : '',
      width: Math.round(p?.getBoundingClientRect().width ?? 0),
    };
  });
  log(JSON.stringify(m));
  if (m.focus !== 'step:s41') fail(`Enter moved focus off the step row: ${m.focus}`);
  if (m.url !== '?step=s41' || !m.tree) fail(`Enter did not select s41 everywhere: ${m.url} ${m.tree}`);
  if (!m.cmd?.startsWith('$ cat vitest.config.*')) fail(`command: ${m.cmd}`);
  if (m.labels.join('|') !== 'Output Exit code 2, no output|Next step 16 min') fail(`labels: ${m.labels}`);
  if (m.next !== 'List repo files and check config') fail(`next step: ${m.next}`);
  if (m.src !== 'Source agent-ad0e51f3501a3ddc3.jsonl line 132') fail(`source: ${m.src}`);
  if (m.transitions) fail(`${m.transitions} elements still transition under reduced motion`);
  if (m.radius !== '14px' || m.width !== 360) fail(`panel ${m.width}px wide, radius ${m.radius}`);
  for (const p of await axeProblems(page, 'details, panel open by keyboard')) fail(p);
  await shot('details-keyboard-1440');

  // Previous / Next stay within the episode: on its first step (s41) Previous is greyed and does nothing (Tab reaches
  // the panel's buttons); Next goes to s43, Previous back to s41.
  const head = () => page.locator('aside.detail .d-head p').textContent();
  const prev = page.getByRole('button', { name: 'Previous step' });
  if ((await prev.getAttribute('aria-disabled')) !== 'true') fail(`Previous step on s41: aria-disabled ${await prev.getAttribute('aria-disabled')}`);
  await prev.focus();
  await page.keyboard.press('Enter');
  const stay = { head: await head(), url: await page.evaluate(() => location.search) };
  log(`Previous on s41 ${JSON.stringify(stay)}`);
  if (stay.head !== 'Verify phase 12, episode 6, step 1 of 28' || stay.url !== '?step=s41') fail(`greyed Previous step moved the panel: ${JSON.stringify(stay)}`);
  await page.getByRole('button', { name: 'Next step' }).press('Enter');
  await page.waitForFunction(() => location.search === '?step=s43').catch(() => fail(`Next step: ${page.url()}`));
  if ((await page.locator('aside.detail').getAttribute('data-step')) !== 's43') fail('Next step did not show s43');
  await prev.press('Enter');
  await page.waitForFunction(() => location.search === '?step=s41').catch(() => fail(`Previous step: ${page.url()}`));
  if ((await head()) !== 'Verify phase 12, episode 6, step 1 of 28') fail(`Previous step did not come back to s41: ${await head()}`);

  // Esc from the list: the panel closes, then the episode.
  await page.locator('[data-row="step:s41"]').focus();
  await page.keyboard.press('Escape');
  const one = await page.evaluate(() => ({ panel: !!document.querySelector('aside.detail'), open: document.querySelector('[data-row="ep:e18"]')?.getAttribute('aria-expanded') }));
  if (one.panel || one.open !== 'true') fail(`first Esc: ${JSON.stringify(one)}`);
  await page.keyboard.press('Escape');
  const two = await page.evaluate(() => ({ open: document.querySelector('[data-row="ep:e18"]')?.getAttribute('aria-expanded'), focus: document.activeElement?.getAttribute('data-row') }));
  if (two.open !== 'false' || two.focus !== 'ep:e18') fail(`second Esc: ${JSON.stringify(two)}`);
}
