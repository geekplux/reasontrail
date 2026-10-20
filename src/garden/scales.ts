import type { BranchState, GardenBranch } from './buildTree';
import { DASH_FROM, MAX_GLYPHS } from './metrics';

/** Branch stroke width in px, linear in the conditional probability (PLAN D5): 1.5 px floor, 20 px at p = 1. */
export function branchWidth(p: number): number {
  const clamped = Math.min(1, Math.max(0, p));
  return 1.5 + 18.5 * clamped;
}

const DASH = { 'not-recorded': [4, 3], other: [6, 4] } as const;

/**
 * Dash pattern for a dashed stroke: `4 3` (not recorded) or `6 4` (other tokens), scaled by `w / 8` on thick strokes.
 * Given the path length, the gap is stretched slightly so the stroke ends on a whole dash, never a sliver.
 */
export function dashArray(kind: keyof typeof DASH, w: number, length = 0): string {
  const s = Math.max(1, w / DASH_FROM);
  const [dash, gap] = DASH[kind].map((d) => d * s) as [number, number];
  const n = Math.round((length - dash) / (dash + gap));
  const fitted = n >= 1 ? (length - dash) / n - dash : gap;
  return [dash, fitted >= gap / 2 ? fitted : gap].map((d) => Number(d.toFixed(2))).join(' ');
}

export type Band = 'lo' | 'mid' | 'hi';

/** Probability band, the secondary colour channel (`--tg-branch-<band>`). */
export function band(p: number): Band {
  return p < 0.1 ? 'lo' : p < 0.4 ? 'mid' : 'hi';
}

/** Probability as a short percentage label, e.g. 0.447 -> "44.7%", tiny values -> "<0.1%". */
export function formatPct(p: number): string {
  if (p > 0 && p < 0.0005) return '<0.1%';
  return `${(p * 100).toFixed(1)}%`;
}

/** The value label: the branch's own chance, plus the whole continuation's chance below the first fork. */
export function formatValue(b: { p: number; pathP: number; depth: number }): string {
  return b.depth > 1 ? `${formatPct(b.p)} · path ${formatPct(b.pathP)}` : formatPct(b.p);
}

const WS: Record<string, string> = { ' ': '·', '\n': '↵', '\t': '⇥' };
const WS_GLYPHS = new Set(Object.values(WS));

/** Token text with visible whitespace: space -> ·, newline -> ↵, tab -> ⇥. */
export function visibleWs(token: string): string {
  return token.replace(/[ \n\t]/g, (c) => WS[c]!);
}

/** A token label: visible whitespace, at most MAX_GLYPHS glyphs (first 11 + …). */
export function formatToken(token: string): string {
  const glyphs = [...visibleWs(token)];
  return glyphs.length > MAX_GLYPHS ? `${glyphs.slice(0, MAX_GLYPHS - 1).join('')}…` : glyphs.join('');
}

/** Splits shown text into runs so whitespace glyphs can be set in a muted colour. */
export function wsRuns(text: string): { text: string; ws: boolean }[] {
  const runs: { text: string; ws: boolean }[] = [];
  for (const c of text) {
    const ws = WS_GLYPHS.has(c);
    const last = runs.at(-1);
    if (last?.ws === ws) last.text += c;
    else runs.push({ text: c, ws });
  }
  return runs;
}

export type MarkerKind = 'bud' | 'knot' | 'ring';

/** Tip marker per state (spec §3): shape, not colour, tells the states apart. */
export const MARKER: Record<BranchState, MarkerKind> = { expandable: 'bud', expanded: 'knot', 'not-recorded': 'ring' };

/** What each state means, in words (table view, legend, accessible names). */
export const STATE_TEXT: Record<BranchState, string> = { expandable: 'can grow', expanded: 'grown', 'not-recorded': 'not recorded' };

const SPOKEN_WS: Record<string, string> = { ' ': 'space', '\n': 'newline', '\t': 'tab' };

/** A token as a screen reader should say it: its text without edge spaces, or its whitespace by name. */
export function spokenToken(token: string): string {
  return token.trim() || [...token].map((c) => SPOKEN_WS[c] ?? c).join(' ');
}

/** A percentage in words: 0.0892 -> "8.9 percent", tiny -> "less than 0.1 percent". */
export const spokenPct = (p: number) => formatPct(p).replace('<', 'less than ').replace('%', ' percent');

/** A branch's accessible name: "looked, 8.9 percent" (+ path chance below the first fork, + "not in this recording"). */
export function spokenBranch(b: Pick<GardenBranch, 'token' | 'p' | 'pathP' | 'depth' | 'state'>): string {
  const path = b.depth > 1 ? `, path ${spokenPct(b.pathP)}` : '';
  return `${spokenToken(b.token)}, ${spokenPct(b.p)}${path}${b.state === 'not-recorded' ? ', not in this recording' : ''}`;
}

/** The polite announcement after a branch grows: "Grew ‘looked’: 5 branches, top ‘out’ 30.1 percent". */
export function grewMessage(b: Pick<GardenBranch, 'token' | 'children'>): string {
  const [top, n] = [b.children[0], b.children.length];
  return `Grew ‘${spokenToken(b.token)}’: ${n} ${n === 1 ? 'branch' : 'branches'}${top ? `, top ‘${spokenToken(top.token)}’ ${spokenPct(top.p)}` : ''}`;
}
