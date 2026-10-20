import type { SampleGarden } from './types';

/**
 * Checks a recorded garden against schemaVersion 1 (docs/llm-provider.md §4) and returns every problem found
 * ([] when valid). Hand-written, so the bundle needs no schema library.
 */
export function sampleProblems(x: unknown): string[] {
  if (!isObject(x)) return ['not an object'];
  const out: string[] = [];
  if (x.schemaVersion !== 1) out.push('schemaVersion is not 1');
  for (const f of ['id', 'title', 'recordedAt'] as const) if (typeof x[f] !== 'string' || !x[f]) out.push(`${f} is missing`);
  if (typeof x.prompt !== 'string' || x.prompt.length < 1 || x.prompt.length > 280) out.push('prompt is not 1-280 chars');
  if (!isObject(x.model) || typeof x.model.provider !== 'string' || typeof x.model.name !== 'string') out.push('model is missing');
  const k = x.k;
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 1) return [...out, 'k is not a positive integer'];
  if (!isObject(x.nodes)) return [...out, 'nodes is missing'];
  if (!Object.hasOwn(x.nodes, '')) out.push('root "" is missing');
  for (const [key, list] of Object.entries(x.nodes)) {
    const at = `nodes[${JSON.stringify(key)}]`;
    if (!Array.isArray(list) || list.length < 1 || list.length > k) {
      out.push(`${at} is not a list of 1-${k} choices`);
      continue;
    }
    const ok = list.every((c) => isObject(c) && typeof c.token === 'string' && c.token !== '' && typeof c.logprob === 'number' && c.logprob <= 0);
    if (!ok) {
      out.push(`${at} has a choice without a token or with logprob > 0`);
      continue;
    }
    const lps = (list as { logprob: number }[]).map((c) => c.logprob);
    if (lps.some((lp, i) => i > 0 && lp > lps[i - 1]!)) out.push(`${at} is not sorted by logprob, descending`);
    if (lps.reduce((s, lp) => s + Math.exp(lp), 0) > 1 + 1e-3) out.push(`${at} has probabilities summing above 1`);
  }
  return out;
}

/** Type guard for a valid recorded garden. */
export function isSampleGarden(x: unknown): x is SampleGarden {
  return sampleProblems(x).length === 0;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
