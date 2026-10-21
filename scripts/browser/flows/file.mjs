// File flow (`pnpm check:browser --file <path>`): one local map page from file://, with zero requests besides itself.
// Screenshots go to the --out dir (.tmp/ by default) and are never committed: the file may be an unredacted session.
import { STRUCTURE_RULES, axeProblems } from '../axe.mjs';

export async function run({ page, fileURL, shot, log, fail }) {
  await page.goto(fileURL, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="map"][data-ready="true"]', { timeout: 10_000 });
  log(`regions: ${await page.$$eval('[data-region]', (els) => els.map((e) => e.getAttribute('data-region')).join(', '))}`);
  for (const p of await axeProblems(page, 'desktop', STRUCTURE_RULES)) fail(p);
  await shot('file-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`mobile: page overflows horizontally by ${overflow}px`);
  await shot('file-mobile');
}
