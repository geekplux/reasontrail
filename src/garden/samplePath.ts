import type { TokenChoice } from '../../shared/llm/types';
import { temperChoices } from '../llm/temperature';

export const DEPTH_CAP = 12;
export type StopReason = 'not-recorded' | 'other' | 'depth-cap';

export interface SampledPath {
  /** Continuation keys from the root, one per drawn token. */
  keys: string[];
  stop: StopReason;
  /** Tempered chance of the whole draw (including the final "other" draw). */
  p: number;
  /** Tempered remainder at the last fork when the draw left the top-k. */
  otherP: number;
}

/** mulberry32: a tiny seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A sampler's walk through known next-token lists (recorded or already grown; never a model call): one draw per
 * fork by cumulative tempered chance in rank order, the remainder last. A pure function of (nodes, t, seed).
 */
export function samplePath(nodes: Readonly<Record<string, readonly TokenChoice[]>>, t: number, seed: number): SampledPath {
  const rand = mulberry32(seed);
  const keys: string[] = [];
  let [key, p] = ['', 1];
  while (keys.length < DEPTH_CAP) {
    const choices = Object.hasOwn(nodes, key) ? nodes[key]! : [];
    if (!choices.length) return { keys, stop: 'not-recorded', p, otherP: 0 };
    const { q, rest } = temperChoices(choices, t);
    let u = rand();
    let i = q.findIndex((x) => (u -= x) < 0);
    if (i < 0 && rest > 0) return { keys, stop: 'other', p: p * rest, otherP: rest };
    if (i < 0) i = q.length - 1; // rounding at the very top of [0, 1)
    key += choices[i]!.token;
    p *= q[i]!;
    keys.push(key);
  }
  return { keys, stop: 'depth-cap', p, otherP: 0 };
}

/** Keys the walk drew from, i.e. the forks to open so the whole path is visible. */
export const forksOf = (s: SampledPath) => (s.stop === 'other' ? s.keys : s.keys.slice(0, -1));
