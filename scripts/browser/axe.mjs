// Injects axe-core from node_modules (inline, no network) and fails on serious/critical violations.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

/** Runs axe on the current page; returns a list of human-readable serious/critical violations. */
export async function axeProblems(page, label) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => (await window.axe.run(document)).violations);
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `axe ${v.impact} (${label}): ${v.id}: ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`);
}
