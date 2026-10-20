import type { SampleGarden } from '../samples/types';

export type BranchState = 'expandable' | 'expanded' | 'leaf';

/** A branch of the garden: one next-token choice after the continuation `parentKey`. */
export interface GardenBranch {
  /** Continuation key after the prompt: parentKey + token. */
  key: string;
  token: string;
  logprob: number;
  /** Conditional probability exp(logprob). */
  p: number;
  /** 1 for the root's branches. */
  depth: number;
  /** 0-based rank among its siblings (0 = most probable). */
  rank: number;
  state: BranchState;
  children: GardenBranch[];
}

/** The visible garden: the prompt plus its first-level branches. */
export interface GardenTree {
  prompt: string;
  children: GardenBranch[];
}

function branchesAt(sample: SampleGarden, parentKey: string, depth: number, expanded: ReadonlySet<string>): GardenBranch[] {
  const choices = sample.nodes[parentKey] ?? [];
  return choices.map((choice, rank) => {
    const key = parentKey + choice.token;
    const recorded = key in sample.nodes;
    const open = recorded && expanded.has(key);
    return {
      key,
      token: choice.token,
      logprob: choice.logprob,
      p: Math.exp(choice.logprob),
      depth,
      rank,
      state: open ? 'expanded' : recorded ? 'expandable' : 'leaf',
      children: open ? branchesAt(sample, key, depth + 1, expanded) : [],
    };
  });
}

/** Builds the visible tree: the root is always open; other recorded keys open when in `expanded`. */
export function buildTree(sample: SampleGarden, expanded: ReadonlySet<string>): GardenTree {
  return { prompt: sample.prompt, children: branchesAt(sample, '', 1, expanded) };
}

/** Default expansion (PLAN D11): the root plus its most probable child, if that child is recorded. */
export function defaultExpanded(sample: SampleGarden): Set<string> {
  const top = sample.nodes['']?.[0];
  return new Set(top && top.token in sample.nodes ? [top.token] : []);
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
