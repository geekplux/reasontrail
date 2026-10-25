// Injects axe-core from node_modules (inline, no network) and fails on serious/critical violations.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** Runs axe on the current page; returns a list of human-readable serious/critical violations, plus any violation of
 * the rule ids in `alsoFail` (or every violation, `'all'`). */
export async function axeProblems(page, label, alsoFail = []) {
  // A map page is checked at rest: at least 400 ms after `tg:map-ready`, when its draw-in has ended.
  await page.waitForFunction(() => { const m = performance.getEntriesByName('tg:map-ready')[0]; return !m || performance.now() - m.startTime >= 400; });
  // Evaluated through DevTools rather than an inline <script>, so the site's CSP (`check:browser --headers`) allows it.
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => (await window.axe.run(document)).violations);
  return violations
    .filter((v) => alsoFail === 'all' || v.impact === 'serious' || v.impact === 'critical' || alsoFail.includes(v.id))
    .map((v) => `axe ${v.impact} (${label}): ${v.id}: ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`);
}

/** Structure rules the local viewer must also pass (one h1; no skipped heading level; all content inside landmarks). */
export const STRUCTURE_RULES = ['page-has-heading-one', 'heading-order', 'region'];
