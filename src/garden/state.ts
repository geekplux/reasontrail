import { ProviderError, type LogprobProvider, type TokenChoice } from '../../shared/llm/types';

/** Why a branch shows a note instead of children. Phase 10 adds `loading` visuals and live errors. */
export type NodeStatus = 'loading' | 'not-recorded' | 'error';

export interface GardenState {
  /** Provider answers by continuation key ('' = root): the client prefix cache. */
  nodes: Readonly<Record<string, TokenChoice[]>>;
  expanded: ReadonlySet<string>;
  status: Readonly<Record<string, NodeStatus>>;
  /** The single selection source (click in phase 4, focus in phase 5). */
  selectedKey: string | null;
}

export type GardenAction =
  | { type: 'expand'; key: string; choices?: TokenChoice[] }
  | { type: 'collapse'; key: string }
  | { type: 'toggle'; key: string }
  | { type: 'select'; key: string | null }
  | { type: 'status'; key: string; status: NodeStatus }
  /** Merge answers and open keys; `select` (when given) replaces the selection. */
  | { type: 'openPath'; nodes: Record<string, TokenChoice[]>; expand: string[]; select?: string | null };

export const initialGardenState: GardenState = { nodes: {}, expanded: new Set(), status: {}, selectedKey: null };

const without = <T>(record: Readonly<Record<string, T>>, key: string) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

/** Pure state transitions. `expand`/`toggle` only open keys whose children are cached; fetching is `useGarden`'s job. */
export function gardenReducer(s: GardenState, a: GardenAction): GardenState {
  switch (a.type) {
    case 'expand': {
      const nodes = a.choices ? { ...s.nodes, [a.key]: a.choices } : s.nodes;
      if (!Object.hasOwn(nodes, a.key)) return s;
      return { ...s, nodes, expanded: new Set(s.expanded).add(a.key), status: without(s.status, a.key) };
    }
    case 'collapse': {
      const expanded = new Set(s.expanded);
      expanded.delete(a.key);
      return { ...s, expanded };
    }
    case 'toggle':
      return gardenReducer(s, { type: s.expanded.has(a.key) ? 'collapse' : 'expand', key: a.key });
    case 'select':
      return { ...s, selectedKey: a.key };
    case 'status':
      return { ...s, status: { ...s.status, [a.key]: a.status } };
    case 'openPath': {
      const nodes = { ...s.nodes, ...a.nodes };
      const expanded = new Set([...s.expanded, ...a.expand.filter((k) => Object.hasOwn(nodes, k))]);
      return { ...s, nodes, expanded, selectedKey: a.select === undefined ? s.selectedKey : a.select };
    }
  }
}

export interface OpenedPath {
  nodes: Record<string, TokenChoice[]>;
  /** Keys to open: the default branch (PLAN D11) and every recorded key along the path. */
  expand: string[];
  /** The last key of the longest valid prefix of the path, or null. */
  select: string | null;
  /** False when part of the path could not be followed (out-of-range rank or unrecorded step). */
  complete: boolean;
}

/**
 * Asks the provider for the root, the most probable child (default expansion, D11) and each step of `ranks`
 * (rank indices from the root, D12). Stops at the first step that is not there; never throws for missing data.
 */
export async function openPath(provider: LogprobProvider, prompt: string, k: number, ranks: readonly number[]): Promise<OpenedPath> {
  const nodes: Record<string, TokenChoice[]> = {};
  const get = async (key: string) => {
    if (!Object.hasOwn(nodes, key)) {
      try {
        nodes[key] = await provider.nextTokens(prompt + key, k);
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        return undefined;
      }
    }
    return nodes[key];
  };
  const root = await get('');
  const expand = new Set<string>();
  const top = root?.[0]?.token;
  if (top !== undefined && (await get(top))) expand.add(top);
  let list = root;
  let key = '';
  let select: string | null = null;
  for (const rank of ranks) {
    const choice = list?.[rank];
    if (!choice) return { nodes, expand: [...expand], select, complete: false };
    key += choice.token;
    select = key;
    list = await get(key);
    if (list) expand.add(key);
  }
  return { nodes, expand: [...expand], select, complete: true };
}
