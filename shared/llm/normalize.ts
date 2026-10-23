// Turns raw upstream top-k entries into the provider contract (docs/llm-provider.md §3): no special or empty tokens,
// one entry per token (duplicates merged with log-sum-exp), sorted by logprob descending, at most k long.
import type { TokenChoice } from './types';

/** How many next tokens the Worker always asks the upstream for and caches; smaller k is served by slicing. */
export const K_FETCH = 8;

const SPECIAL = /^<\|[^|]*\|>$|^<\/?(?:s|think|eos|bos|pad|unk)>$|^\[(?:gMASK|sMASK|MASK|sop|eop)\]$/;

/** True for reasoning markers such as `<think>`; a response that starts with one carries no continuation. */
export function isThinkingToken(token: string): boolean {
  return /^<\/?think>$/.test(token.trim());
}

/** True for tokens that must never be shown as a branch: empty, control/special markers, or undecodable bytes. */
export function isDroppedToken(token: string): boolean {
  return token.length === 0 || SPECIAL.test(token.trim()) || token.includes('�');
}

/** log(e^a + e^b) without overflow. */
export function logSumExp(a: number, b: number): number {
  const hi = Math.max(a, b);
  return hi + Math.log1p(Math.exp(Math.min(a, b) - hi));
}

/** Normalizes raw choices; non-finite logprobs are dropped and tiny positive rounding errors clamp to 0. */
export function normalize(choices: readonly TokenChoice[], k: number = K_FETCH): TokenChoice[] {
  const merged = new Map<string, number>();
  for (const { token, logprob } of choices) {
    if (typeof token !== 'string' || !Number.isFinite(logprob) || isDroppedToken(token)) continue;
    const prev = merged.get(token);
    merged.set(token, Math.min(0, prev === undefined ? logprob : logSumExp(prev, logprob)));
  }
  return [...merged]
    .map(([token, logprob]) => ({ token, logprob }))
    .sort((a, b) => b.logprob - a.logprob || (a.token < b.token ? -1 : a.token > b.token ? 1 : 0))
    .slice(0, k);
}
