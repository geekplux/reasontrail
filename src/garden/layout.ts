import { hierarchy, tree } from 'd3-hierarchy';
import { mostLikelyPath, type GardenBranch, type GardenTree } from './buildTree';
import { bundle, linkLength, linkPath } from './linkPath';
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
  /** The incoming link, from the parent's fork bundle to this tip, and its length (for dash fitting). */
  link: string;
  length: number;
  hit: { x: number; y: number; width: number; height: number };
}

/** The "other tokens" stub of an open node: probability outside the shown top-k. */
export interface RemainderLayout {
  parentKey: string;
  p: number;
  tipX: number;
  y: number;
  link: string;
  length: number;
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
      const length = linkLength(forkX, ys[i]!, tipX, y);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const b = child.data.branch;
      if (!b) {
        const p = child.data.remainder!;
        remainders.push({ parentKey: child.data.parentKey, p, tipX, y, link, length });
        right = Math.max(right, tipX + M.LABEL_DX + textWidth(remainderLabel(p), M.VALUE_PX));
        return;
      }
      const end = labelEnd(b, tipX);
      const hitX = tipX - M.HIT_BEFORE;
      const hit = { x: hitX, y: y - M.HIT_H / 2, width: end + M.FORK_DX - hitX, height: M.HIT_H };
      branches.push({ branch: b, tipX, y, labelX: tipX + M.LABEL_DX, labelEnd: end, forkX: end + M.FORK_DX, link, length, hit });
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

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const hits = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const span = (x0: number, x1: number, y0: number, y1: number): Box => ({ x: x0, y: Math.min(y0, y1), width: x1 - x0, height: Math.abs(y1 - y0) });

/**
 * Where a branch note (e.g. "Not in this recording.") goes without covering data (spec §5): below the branch's label,
 * else above it, else nowhere (`null`: show it on the path readout). A candidate is rejected if it leaves the drawing
 * or overlaps any incoming link's box or any label. Width is estimated from the glyph count like labels, never measured.
 */
export function placeNote(layout: GardenLayout, key: string, glyphs: number): Box | null {
  const at = layout.branches.find((b) => b.branch.key === key);
  if (!at) return null;
  const width = (glyphs + 2) * M.GLYPH_EM * M.VALUE_PX + 2 * M.NOTE_PAD_X;
  const link = (parentKey: string, tipX: number, y: number) => {
    const p = layout.branches.find((b) => b.branch.key === parentKey);
    return span(p ? p.forkX : M.ROOT_FORK_X, tipX, p ? p.y : 0, y);
  };
  const half = M.TOKEN_PX / 2;
  const taken: Box[] = [
    ...layout.branches.flatMap((b) => [link(b.branch.key.slice(0, b.branch.key.length - b.branch.token.length), b.tipX, b.y), span(b.labelX, b.labelEnd, b.y - half, b.y + half)]),
    ...layout.remainders.flatMap((r) => [
      link(r.parentKey, r.tipX, r.y),
      span(r.tipX + M.LABEL_DX, r.tipX + M.LABEL_DX + [...remainderLabel(r.p)].length * M.GLYPH_EM * M.VALUE_PX, r.y - half, r.y + half),
    ]),
  ];
  const { y: top, height } = layout.viewBox;
  const candidates = [at.y + M.HIT_H / 2, at.y - M.HIT_H / 2 - M.NOTE_H].map((y): Box => ({ x: at.labelX, y, width, height: M.NOTE_H }));
  return candidates.find((c) => c.y >= top && c.y + c.height <= top + height && !taken.some((t) => hits(c, t))) ?? null;
}
