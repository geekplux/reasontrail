import type { GardenBranch, GardenTree } from './buildTree';

/** A visible branch in tree order (depth-first, siblings by rank), with what ARIA needs about its siblings. */
export interface TreeItem {
  branch: GardenBranch;
  parentKey: string | null;
  setSize: number;
}

/** Every visible branch in the order Up/Down walk them (WAI-ARIA tree: depth-first, as drawn top to bottom). */
export function visibleItems(tree: GardenTree): TreeItem[] {
  const out: TreeItem[] = [];
  const walk = (list: GardenBranch[], parentKey: string | null) => {
    for (const branch of list) {
      out.push({ branch, parentKey, setSize: list.length });
      walk(branch.children, branch.key);
    }
  };
  walk(tree.children, null);
  return out;
}

/** `focus` moves the roving focus (and the selection); `activate` is the same toggle as a click. */
export type TreeAction = { type: 'focus' | 'activate'; key: string } | null;

/** WAI-ARIA tree keys (no type-ahead): what pressing `key` on the branch `focusedKey` does. */
export function treeKeyAction(items: readonly TreeItem[], focusedKey: string, key: string): TreeAction {
  const i = items.findIndex((it) => it.branch.key === focusedKey);
  const item = items[i];
  if (!item) return null;
  const { branch: b, parentKey } = item;
  const focus = (k: string | null | undefined): TreeAction => (k == null || k === b.key ? null : { type: 'focus', key: k });
  const activate: TreeAction = { type: 'activate', key: b.key };
  switch (key) {
    case 'ArrowDown':
      return focus(items[i + 1]?.branch.key);
    case 'ArrowUp':
      return focus(items[i - 1]?.branch.key);
    case 'Home':
      return focus(items[0]?.branch.key);
    case 'End':
      return focus(items.at(-1)?.branch.key);
    case 'ArrowRight':
      return b.state === 'expanded' ? focus(b.children[0]?.key) : b.state === 'expandable' ? activate : null;
    case 'ArrowLeft':
      return b.state === 'expanded' ? activate : focus(parentKey);
    case 'Enter':
    case ' ':
      return activate;
    default:
      return null;
  }
}
