// Typed output of the tree layout engine (docs/design/v7/PROMPT.md §5). Pure data: every coordinate is in px inside
// the box given to `layoutTree`; the renderer only turns it into SVG.
import type { GlyphKind, VerdictTone } from '../gitlist/rows';

export interface Pt { x: number; y: number }
/** An axis-aligned box: left, top, right, bottom. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

export interface TreeOptions {
  /**
   * The box in px. The smallest drawn is 240 × 120 (`MIN_BOX`); a smaller box, or one that is not finite (NaN,
   * Infinity), gives the empty layout: no ribbons, twigs, marks, labels or hit targets.
   */
  width: number;
  height: number;
  /**
   * Leonardo's constant: width = k·√(tool calls still ahead), in design units. 1.45 at every size: a box shorter than
   * 520px draws the desktop tree scaled down (the canvas's phone tree is the 980 × 520 tree at 0.365), so it needs no
   * thinner k. Override only on purpose.
   */
  k?: number;
  /** Text labels (numbers, lane blocks, waits, root). Off for the phone silhouette. */
  labels?: boolean;
  /** Zones (px) the tree and its text keep clear of, such as the legend; one touching the top or bottom edge pushes
   * whatever lies under it inward. */
  reserve?: Box[];
}

/** A filled part of the tree around its centreline. */
export interface Ribbon {
  /** `trunk`, `limb:<laneId>` or `branch:<episodeId>`. */
  id: string;
  kind: 'trunk' | 'limb' | 'branch';
  laneId: string;
  episodeId?: string;
  /** Closed fill path. */
  d: string;
  /** The centreline, root side first, and the full width at each point (non-increasing toward the tip). */
  line: Pt[];
  widths: number[];
  /** The trunk's widths without the root flare: what a highlighted path is drawn with (tree.mjs). */
  core?: number[];
}

export type TwigKind = 'call' | 'read' | 'thinking' | 'failed';
/** One tool call or thinking step: leaf (call), bud (read), ✕ (failed) or no tip (thinking). */
export interface Twig {
  stepId: string;
  episodeId: string;
  /** The ribbon the twig grows from. */
  part: string;
  kind: TwigKind;
  mark: 'leaf' | 'bud' | 'x' | 'none';
  base: Pt;
  tip: Pt;
  /** Twig direction in degrees (SVG, clockwise from +x): the leaf is drawn rotated by it. */
  angle: number;
  /** Mark scale (1 at full size). */
  scale: number;
}

export type LabelClass = 'num' | 'sub' | 'lab' | 'lane';
/** One line of text: `x`, `y` are the anchor and the baseline. */
export interface Label {
  /** Stable id: `root:task`, `num:<episodeId>`, `wait:<laneId>`, `block:<laneId>:<line>`. */
  key: string;
  text: string;
  cls: LabelClass;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  /** A verdict icon (14px) before the text, its left edge at `x`; the text then starts at x + 20. */
  icon?: VerdictTone;
}

/** An episode's glyph at its branch tip, with its number (shared with the list). */
export interface EpisodeMark { episodeId: string; laneId: string; n: number; kind: GlyphKind; at: Pt; r: number; num?: Label }

/** ◉ at a lane's tip (its verdict), or a small ink dot (r 2.5) ending a trunk without an answer. */
export interface TipMark { laneId: string; kind: 'answer' | 'end'; tone: VerdictTone; at: Pt; r: number; episodeId?: string }

/** The text block beside a tip: lane name (14/600), verdict with icon (12/500), "Agent, N min" (12). */
export interface Block { laneId: string; box: Box; lines: Label[] }

/** Dotted quadratic from a limb tip back to the trunk where the main agent resumed, ending in a hollow dot. */
export interface HandBack { laneId: string; d: string; from: Pt; c: Pt; to: Pt }

export interface HitTarget {
  /** The episode or step id. Episodes are hit on their branch and glyph, their number, their lane's tip and
   * lane block; steps on their twig and its leaf. */
  id: string;
  kind: 'episode' | 'step';
  episodeId: string;
  /** Polyline (or a single point) to measure the pointer's distance to. */
  points: Pt[];
  /** Subtracted from the distance: the radius of a glyph or tip, half the height of a number or lane block. */
  pad?: number;
  /** A lane tip without an episode of its own (its ◉ or lane block): the tooltip is that lane's verdict, at its tip. */
  tipLane?: string;
}

/** A stretch of a ribbon from its root end to point index `to` (inclusive). */
export interface PathPart { part: string; to: number }

export interface TreeLayout {
  width: number;
  height: number;
  ribbons: Ribbon[];
  twigs: Twig[];
  episodes: EpisodeMark[];
  tips: TipMark[];
  handBacks: HandBack[];
  root: { at: Pt; r: number };
  blocks: Block[];
  /** Root labels, wait texts and episode numbers: every free label. */
  labels: Label[];
  hits: HitTarget[];
  /** The path from the root to every episode and step, by id. */
  paths: Record<string, PathPart[]>;
}
