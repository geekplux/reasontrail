// Map flow, v7 (docs/design/v7/PROMPT.md §4.5, §5.4; docs/design/v7/preview/Step.html; phase 32b): a click on the
// failed twig of verify-fail-fix (s41) selects it: its path from the root turns blue-9 and the rest dims to slate-9,
// the step gets a ring and the callout "Inspect vitest config for log suppression" / "Exit code 2, 16 min", the list
// opens episode 6 with the step selected, and the detail panel replaces the outcome column. Previous / Next step,
// Esc closes the panel and puts focus on the step's row; the URL carries the step; axe is clean with the panel open.
import { axeProblems } from '../axe.mjs';

export const tipOf = (page, stepId) => page.evaluate((id) => {
  const tw = document.querySelector(`.hero-tree path.tw[data-step="${id}"]`);
  if (!tw) return null;
  const p = tw.getPointAtLength(tw.getTotalLength());
  const k = tw.getScreenCTM();
  return { x: k.a * p.x + k.c * p.y + k.e, y: k.b * p.x + k.d * p.y + k.f };
}, stepId);

export async function run({ page, baseURL, shot, log, fail }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('.hero-tree svg[role="img"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);

  const at = await tipOf(page, 's41');
  if (!at) return fail('no twig for s41 in the tree');
  await page.mouse.click(at.x + 2, at.y - 2); // within 12px of the mark
  await page.waitForSelector('aside.detail', { timeout: 5_000 }).catch(() => fail('a click on the failed twig opened no detail panel'));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400); // the 250ms colour transitions
  const m = await page.evaluate(() => {
    const svg = document.querySelector('.hero-tree svg.tree');
    const fill = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fill : ''; };
    const p = document.querySelector('aside.detail');
    return {
      url: location.search,
      dim: svg?.classList.contains('dim'),
      hi: fill('.hero-tree path.b.hi'),
      off: fill('.hero-tree path.b:not(.hi)'),
      blue9: getComputedStyle(document.documentElement).getPropertyValue('--blue-9').trim(),
      ring: document.querySelectorAll('.hero-tree circle.ring').length,
      callout: [...document.querySelectorAll('.hero-tree .callout text')].map((t) => t.textContent),
      leader: document.querySelector('.hero-tree .callout .lead') ? getComputedStyle(document.querySelector('.hero-tree .callout .lead')).strokeWidth : '',
      open: document.querySelector('[data-row="ep:e18"]')?.getAttribute('aria-expanded'),
      selected: document.querySelector('[data-row="step:s41"]')?.getAttribute('aria-selected'),
      head: p?.querySelector('.d-head p')?.textContent,
      title: p?.querySelector('.d-h')?.textContent,
      focus: document.activeElement?.textContent,
      outcome: !!document.querySelector('aside[aria-label="Outcome"]'),
      // Focus must not land off-screen (WCAG 2.4.11): the ring and the panel's title are both in the viewport.
      inView: ['.hero-tree circle.ring', 'aside.detail .d-h'].map((sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      }),
    };
  });
  log(JSON.stringify(m));
  if (m.url !== '?step=s41') fail(`URL after selecting: ${m.url}`);
  if (!m.dim || !m.hi || m.hi === m.off) fail(`tree not in the Step state: ${JSON.stringify({ dim: m.dim, hi: m.hi, off: m.off })}`);
  if (m.ring !== 1) fail(`${m.ring} rings in the tree`);
  if (m.callout.join('|') !== 'Inspect vitest config for log suppression|Exit code 2, 16 min') fail(`callout reads ${JSON.stringify(m.callout)}`);
  if (m.leader !== '0.5px' && m.leader !== '0.5') fail(`leader stroke ${m.leader}`);
  if (m.open !== 'true' || m.selected !== 'true') fail(`list does not show the selection: ${m.open} ${m.selected}`);
  if (m.head !== 'Verify phase 12, episode 6, step 1 of 28' || m.title !== 'Command failed') fail(`panel reads ${m.head} / ${m.title}`);
  if (m.focus !== 'Command failed') fail(`focus after a tree click is on ${JSON.stringify(m.focus)}, not the panel title`);
  if (m.outcome) fail('the outcome column is still shown beside the panel');
  if (m.inView.join() !== 'true,true') fail(`after a tree click [ring, panel title] in view: ${m.inView}`);
  await shot('map-step-1440');

  await page.getByRole('button', { name: 'Next step' }).click();
  await page.waitForFunction(() => location.search === '?step=s43').catch(() => fail(`Next step: ${page.url()}`));
  if ((await page.locator('aside.detail .d-h').textContent()) !== 'Command') fail('Next step did not show s43');
  await page.getByRole('button', { name: 'Previous step' }).click();
  await page.waitForFunction(() => location.search === '?step=s41').catch(() => fail(`Previous step: ${page.url()}`));
  for (const p of await axeProblems(page, 'Step state, panel open')) fail(p);

  await page.locator('aside.detail .d-h').focus();
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => ({ panel: !!document.querySelector('aside.detail'), url: location.search, focus: document.activeElement?.getAttribute('data-row'), dim: document.querySelector('.hero-tree svg.tree')?.classList.contains('dim') }));
  log(`Esc ${JSON.stringify(closed)}`);
  if (closed.panel || closed.url !== '' || closed.dim) fail(`Esc did not close the Step state: ${JSON.stringify(closed)}`);
  if (closed.focus !== 'step:s41') fail(`focus after Esc on ${closed.focus}, not the step's row`);
  await page.goBack();
  await page.waitForSelector('aside.detail[data-step="s41"]', { timeout: 5_000 }).catch(() => fail('Back did not reopen the step'));
  await page.goForward();
  await page.waitForFunction(() => !document.querySelector('aside.detail')).catch(() => fail('Forward did not close the step'));
}
