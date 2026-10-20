import { temperChoices } from '../llm/temperature';
import type { SampleGarden } from '../samples/types';
import { entropy } from './entropy';

/** Phase 10 adds the live-only states (`leaf` = end of text, `loading`, `error`, `depth-limit`). */
export type BranchState = 'expandable' | 'expanded' | 'not-recorded';

/** A branch of the garden: one next-token choice after the continuation `parentKey`. */
export interface GardenBranch {
  /** Continuation key after the prompt: parentKey + token. */
  key: string;
  token: string;
  logprob: number;
  /** Shown conditional probability: exp(logprob), tempered (PLAN D8); equal to `recordedP` at T = 1. */
  p: number;
  recordedP: number;
  /** Probability of the whole continuation: the product of `p` from the root. */
  pathP: number;
  /** 1 for the root's branches. */
  depth: number;
  /** 0-based rank among its siblings (0 = most probable). */
  rank: number;
  state: BranchState;
  children: GardenBranch[];
  /** Once open: the shown chance of everything outside its children, and the entropy (bits) of its fork. */
  next?: Fork;
}

export interface Fork {
  rest: number;
  entropy: number;
}

/** The visible garden: the prompt plus its first-level branches. */
export interface GardenTree {
  prompt: string;
  children: GardenBranch[];
  next?: Fork;
}

/** The prompt and the next-token lists known so far, by continuation key ('' = root). */
export type TreeSource = Pick<SampleGarden, 'prompt' | 'nodes'>;
/** Whether a branch can be grown (recorded); decides `expandable` vs `not-recorded` before anyone clicks. */
export type CanGrow = (key: string) => boolean;

function forkAt(src: TreeSource, canGrow: CanGrow, parentKey: string, parentP: number, depth: number, expanded: ReadonlySet<string>, t: number) {
  const choices = src.nodes[parentKey] ?? [];
  const { q, rest } = temperChoices(choices, t);
  const children = choices.map((choice, rank): GardenBranch => {
    const key = parentKey + choice.token;
    const recorded = canGrow(key);
    const open = expanded.has(key) && Object.hasOwn(src.nodes, key);
    const p = q[rank]!;
    const sub = open ? forkAt(src, canGrow, key, parentP * p, depth + 1, expanded, t) : null;
    return {
      key,
      token: choice.token,
      logprob: choice.logprob,
      p,
      recordedP: Math.exp(choice.logprob),
      pathP: parentP * p,
      depth,
      rank,
      state: open ? 'expanded' : recorded ? 'expandable' : 'not-recorded',
      children: sub?.children ?? [],
      ...(sub ? { next: sub.next } : {}),
    };
  });
  return { children, next: { rest, entropy: entropy([...q, rest]) } };
}

/**
 * Builds the visible tree at temperature `t`: the root is always open; other keys open when in `expanded` and their children are known.
 * `canGrow` defaults to "has a list in `src.nodes`", which is right when `src` is a whole recording.
 */
export function buildTree(src: TreeSource, expanded: ReadonlySet<string>, canGrow: CanGrow = (key) => Object.hasOwn(src.nodes, key), t = 1): GardenTree {
  return { prompt: src.prompt, ...forkAt(src, canGrow, '', 1, 1, expanded, t) };
}

/** Default expansion (PLAN D11): the root plus its most probable child, if that child is recorded. */
export function defaultExpanded(sample: SampleGarden): Set<string> {
  const top = sample.nodes['']?.[0];
  return new Set(top && Object.hasOwn(sample.nodes, top.token) ? [top.token] : []);
}

/** Depth-first list of every visible branch, in drawing order. */
export function flattenBranches(tree: GardenTree): GardenBranch[] {
  const out: GardenBranch[] = [];
  const walk = (list: GardenBranch[]) => {
    for (const b of list) {
      out.push(b);
      walk(b.children);
    }
  };
  walk(tree.children);
  return out;
}

/** The visible branches from the root down to `key` (empty when `key` is not visible). */
export function pathTo(tree: GardenTree, key: string): GardenBranch[] {
  const walk = (list: GardenBranch[]): GardenBranch[] => {
    for (const b of list) {
      if (b.key === key) return [b];
      const rest = key.startsWith(b.key) ? walk(b.children) : [];
      if (rest.length) return [b, ...rest];
    }
    return [];
  };
  return walk(tree.children);
}

/** The most likely visible continuation: rank-0 children, followed while they are open. */
export function mostLikelyPath(tree: GardenTree): GardenBranch[] {
  const out: GardenBranch[] = [];
  for (let b = tree.children[0]; b; b = b.children[0]) out.push(b);
  return out;
}
