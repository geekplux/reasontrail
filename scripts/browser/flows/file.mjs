// File flow (`pnpm check:browser --file <path>`): one local map page from file://, with the network blocked and zero
// requests besides itself; the v7 viewer's tree, list, outcome, footer, and a step round trip through the hash.
// Screenshots go to the --out dir (.tmp/ by default) and are never committed: the file may be an unredacted session.
import { STRUCTURE_RULES, axeProblems } from '../axe.mjs';
import { blockNetwork, checkFacts, checkLayout, openViewer, stepRoundTrip, toPhone, viewerFacts } from '../viewer.mjs';

export async function run({ page, fileURL, shot, log, fail }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const blocked = await blockNetwork(page);
  await openViewer(page, fileURL);
  const facts = await viewerFacts(page);
  log(JSON.stringify({ ...facts, outcome: facts.outcome.slice(0, 80) }));
  checkFacts(facts, fail, 'file');
  await checkLayout(page, fail, 'file');
  for (const p of await axeProblems(page, 'desktop', STRUCTURE_RULES)) fail(p);
  await shot('file-desktop');
  log(`step ${await stepRoundTrip(page, fail, 'file')}: picked, Esc, deep link`);
  const overflow = await toPhone(page, fail, 'file');
  if (overflow > 0) fail(`mobile: page overflows horizontally by ${overflow}px`);
  await shot('file-mobile');
  if (blocked.length) fail(`the page requested ${blocked.length} URL(s): ${blocked.slice(0, 3).join(', ')}`);
}
