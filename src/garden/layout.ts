import { hierarchy, tree } from 'd3-hierarchy';
import { mostLikelyPath, type GardenBranch, type GardenTree } from './buildTree';
import { bundle, linkPath } from './linkPath';
import * as M from './metrics';
import { branchWidth, formatPct, formatToken, formatValue } from './scales';

export interface BranchLayout {
  branch: GardenBranch;
  tipX: number;
  y: number;
  labelX: number;
  labelEnd: number;
  /** Where this branch's own children leave (label end + FORK_DX). */
  forkX: number;
  /** The incoming link, from the parent's fork bundle to this tip. */
  link: string;
  hit: { x: number; y: number; width: number; height: number };
}

/** The "other tokens" stub of an open node: probability outside the shown top-k. */
export interface RemainderLayout {
  parentKey: string;
  p: number;
  tipX: number;
  y: number;
  link: string;
}

export interface GardenLayout {
  branches: BranchLayout[];
  remainders: RemainderLayout[];
  viewBox: { x: number; y: number; width: number; height: number };
}

type Datum = { branch?: GardenBranch | undefined; remainder?: number; parentKey: string; children: Datum[] };

const textWidth = (text: string, px: number) => [...text].length * M.GLYPH_EM * px;
/** Shown (and measured) when a garden has no branches at all. */
export const EMPTY_TEXT = 'This garden has no recorded branches.';
export const remainderLabel = (p: number) => `other ${formatPct(p)}`;
/** Width of the rendered value label box for a branch. */
export const valueWidth = (b: GardenBranch) => textWidth(formatValue(b), M.VALUE_PX) + 2 * M.VALUE_PAD_X;

function toDatum(parentKey: string, list: GardenBranch[], branch?: GardenBranch): Datum {
  const children = list.map((b) => toDatum(b.key, b.children, b));
  const r = Math.max(0, 1 - list.reduce((s, b) => s + b.p, 0));
  if (list.length && r >= 0.0005) children.push({ remainder: r, parentKey, children: [] });
  return { branch, parentKey, children };
}

/** Pure, deterministic layout of the visible garden: horizontal tidy tree, root (seed) at (0, 0). */
export function layoutGarden(garden: GardenTree): GardenLayout {
  const root = tree<Datum>()
    .nodeSize([M.ROW, M.COL])
    .separation((a, b) => (a.parent === b.parent ? 1 : M.COUSIN_SEPARATION))(hierarchy(toDatum('', garden.children)));
  const labelEnd = (b: GardenBranch, tipX: number) => tipX + M.LABEL_DX + textWidth(formatToken(b.token), M.TOKEN_PX);
  const branches: BranchLayout[] = [];
  const remainders: RemainderLayout[] = [];
  let right = garden.children.length === 0 ? M.LABEL_DX + textWidth(EMPTY_TEXT, M.TOKEN_PX) : M.ROOT_FORK_X;
  let top = 0;
  let bottom = 0;
  for (const parent of root.descendants()) {
    if (!parent.children) continue;
    const forkX = parent.data.branch ? labelEnd(parent.data.branch, parent.depth * M.COL) + M.FORK_DX : M.ROOT_FORK_X;
    const ys = bundle(parent.x, parent.children.map((c) => branchWidth(c.data.branch?.p ?? c.data.remainder ?? 0)));
    parent.children.forEach((child, i) => {
      const tipX = child.depth * M.COL;
      const y = child.x;
      const link = linkPath(forkX, ys[i]!, tipX, y);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const b = child.data.branch;
      if (!b) {
        const p = child.data.remainder!;
        remainders.push({ parentKey: child.data.parentKey, p, tipX, y, link });
        right = Math.max(right, tipX + M.LABEL_DX + textWidth(remainderLabel(p), M.VALUE_PX));
        return;
      }
      const end = labelEnd(b, tipX);
      const hitX = tipX - M.HIT_BEFORE;
      const hit = { x: hitX, y: y - M.HIT_H / 2, width: end + M.FORK_DX - hitX, height: M.HIT_H };
      branches.push({ branch: b, tipX, y, labelX: tipX + M.LABEL_DX, labelEnd: end, forkX: end + M.FORK_DX, link, hit });
      // Room for the value label to the right of every label, so it never has to flip over the links.
      right = Math.max(right, end + M.FORK_DX + valueWidth(b));
    });
  }
  return {
    branches,
    remainders,
    viewBox: { x: -M.PAD, y: top - M.ROW / 2, width: right + 2 * M.PAD, height: bottom - top + M.ROW },
  };
}

/** Mobile start position (spec §8): the deepest open fork on the most likely path, 16 px from the left edge. */
export function initialScrollLeft(garden: GardenTree): number {
  const open = mostLikelyPath(garden).filter((b) => b.state === 'expanded');
  return Math.max(0, (open.at(-1)?.depth ?? 0) * M.COL + M.PAD - 16);
}
