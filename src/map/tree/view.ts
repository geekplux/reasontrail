// What the tree renderer needs beyond geometry (docs/design/v7/PROMPT.md §5.4), pure: the layout memoised per graph
// and box, the factual summary for the SVG's label, and the hover tooltip ("7  Edit … +8 more" over "20 steps, 6 tool
// calls, 15 min wait, 17 min"). Numbers, titles and times come from the list's row model, so tree and list agree.
import type { SessionGraph } from '../../../shared/session/types';
import { listRows, type EpisodeRow, type ListRow, type VerdictRow } from '../gitlist/rows';
import { layoutTree } from './layout';
import { treeModel } from './model';
import { labelBox } from './labels';
import { textWidth } from './text';
import { segDist } from '.';
import type { Box, Pt, TreeLayout } from './types';

const SIZES_KEPT = 4;
const cache = new WeakMap<SessionGraph, Map<string, TreeLayout>>();

/** `layoutTree`, memoised per graph and box (the last few sizes per graph): a re-render, a hover or a tab switch back
 * reuses the layout. */
export function treeFor(g: SessionGraph, width: number, height: number, labels = true, reserve: readonly Box[] = []): TreeLayout {
  const key = JSON.stringify([width, height, labels, reserve]);
  let sizes = cache.get(g);
  if (!sizes) cache.set(g, (sizes = new Map()));
  const hit = sizes.get(key);
  if (hit) return hit;
  const t = layoutTree(g, { width, height, labels, reserve: [...reserve] });
  sizes.set(key, t);
  if (sizes.size > SIZES_KEPT) sizes.delete(sizes.keys().next().value as string);
  return t;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The SVG's `aria-label`: what the drawing shows, in one or two sentences (the list is the operable structure). */
export function treeSummary(g: SessionGraph, rows: readonly ListRow[] = listRows(g)): string {
  const episodes = rows.reduce((m, r) => Math.max(m, r.kind === 'episode' ? r.n : r.kind === 'verdict' ? (r.n ?? 0) : 0), 0);
  const calls = g.steps.filter((s) => s.kind === 'tool-call').length;
  const end = rows.find((r) => r.kind === 'end')?.at;
  const head = `Tree: ${[plural(episodes, 'episode'), plural(calls, 'tool call'), end].filter(Boolean).join(', ')}`;
  const lanes = rows.filter((r) => r.kind === 'lane').slice(1);
  if (lanes.length === 0) {
    const failed = rows.reduce((a, r) => a + (r.kind === 'episode' ? r.failed : 0), 0);
    const counts = [plural(episodes, 'episode'), `${plural(calls, 'tool call')}${failed > 0 ? ` (${failed} failed)` : ''}`, end].filter(Boolean).join(', ');
    return `Tree: ${counts}, all by the main agent.`;
  }
  const verdicts = new Map(rows.flatMap((r) => (r.kind === 'verdict' ? [[r.laneId, r] as const] : [])));
  const runs = lanes.map((l) => {
    const v = verdicts.get(l.laneId);
    return v ? `${l.name} (${v.text.charAt(0).toLowerCase()}${v.text.slice(1)})` : l.name;
  });
  return `${head}. The main agent spawns ${plural(lanes.length, 'subagent')}: ${runs.join(', ')}.`;
}

/** The hover tooltip of an episode: number (none for a lane's verdict), title, facts and the box (layout px). */
export interface TreeTip { episodeId: string; n?: number; title: string; facts: string; box: Box }
export interface TreeTipOptions {
  rows?: readonly ListRow[];
  /** The tooltip of a lane tip without an episode of its own: that lane's verdict, at its tip. */
  tipLane?: string | undefined;
  /** Zones the box keeps clear of where it can (the legend, a selected step's callout). */
  reserve?: readonly Box[] | undefined;
  /** A selected step's ring: the box never covers it where any spot is clear of it. */
  ring?: Box | undefined;
}

const TIP_H = 56;
const TIP_TITLE_MAX = 360;
const TIP_GAP = { x: 16, y: 10 };

interface Circle extends Pt { r: number }
const circleIn = (b: Box, c: Circle) => Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.y0 - c.y, 0, c.y - b.y1)) < c.r;
const boxIn = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** What the tooltip of an episode must not cover: its glyph (and the tip it was opened from) with the halo, the
 * highlighted path's last part, number, twig tips and its lane's block. A lane tip passes the episode it highlights. */
function ownMarks(t: TreeLayout, episodeId: string, at: Pt, laneId: string | undefined): { circles: Circle[]; boxes: Box[] } {
  const glyph = t.episodes.find((m) => m.episodeId === episodeId);
  const circles: Circle[] = [{ ...at, r: (t.tips.find((m) => m.at === at)?.r ?? glyph?.r ?? 5.5) + 3 }];
  if (glyph && glyph.at !== at) circles.push({ ...glyph.at, r: glyph.r + 3 });
  const last = t.paths[episodeId]?.at(-1);
  const part = last && t.ribbons.find((r) => r.id === last.part);
  if (last && part) part.line.slice(0, last.to + 1).forEach((p, i) => circles.push({ ...p, r: (part.widths[i] ?? 0) / 2 + 1 }));
  for (const w of t.twigs) if (w.episodeId === episodeId) circles.push({ ...w.tip, r: 3 });
  const grow = (b: Box): Box => ({ x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3 });
  const boxes = [...t.labels.filter((l) => l.key === `num:${episodeId}`).map(labelBox), ...t.blocks.filter((b) => b.laneId === laneId).map((b) => b.box)].map(grow);
  return { circles, boxes };
}

/** The tooltip for `episodeId` (an episode row's or a lane answer's), beside its glyph or tip: right and below as on
 * the canvas, else right-above, left-above or left-below, else right of the tip under or over its lane's block. Each
 * spot is moved inside the figure; the first that covers the least wins, in order of weight: the selected step's
 * ring, the reserved zones (legend, callout), being moved, then the episode's own marks. Undefined for an id the tree
 * does not draw. */
export function treeTip(g: SessionGraph, t: TreeLayout, episodeId: string, opts: TreeTipOptions = {}): TreeTip | undefined {
  const { rows = listRows(g), tipLane, reserve = [], ring } = opts;
  const keep = { reserve, ring };
  const lane = tipLane ? rows.find((r): r is VerdictRow => r.kind === 'verdict' && r.laneId === tipLane) : undefined;
  const tipAt = lane ? t.tips.find((m) => m.laneId === tipLane)?.at : undefined;
  // The tip stands for its lane: its title and facts are the lane's; it keeps clear of the episode it highlights.
  if (lane && tipAt) return place(t, episodeId, undefined, lane.text, laneFacts(g, rows, lane), tipAt, tipLane, keep);
  const row = rows.find((r): r is EpisodeRow | VerdictRow => (r.kind === 'episode' || r.kind === 'verdict') && r.episodeId === episodeId);
  const at: Pt | undefined = t.episodes.find((m) => m.episodeId === episodeId)?.at ?? t.tips.find((m) => m.episodeId === episodeId)?.at;
  const n = row?.n;
  if (!row || !at || n === undefined) return undefined;
  const ids = new Set(g.episodes.find((e) => e.id === episodeId)?.stepIds);
  const calls = g.steps.filter((s) => ids.has(s.id) && s.kind === 'tool-call').length;
  const failed = row.kind === 'episode' && row.failed > 0 ? `${row.failed} failed` : '';
  const facts = [plural(row.steps ?? ids.size, 'step'), calls > 0 ? plural(calls, 'tool call') : '', failed, row.kind === 'episode' ? row.wait : '', row.at].filter(Boolean).join(', ');
  return place(t, episodeId, n, row.kind === 'episode' ? row.title : row.text, facts, at, row.laneId, keep);
}

/** A lane's facts for its verdict's tooltip: its steps, tool calls, failed calls and when it ended. */
function laneFacts(g: SessionGraph, rows: readonly ListRow[], v: VerdictRow): string {
  const own = g.steps.filter((s) => s.laneId === v.laneId);
  const calls = own.filter((s) => s.kind === 'tool-call').length;
  const failed = rows.reduce((a, r) => a + (r.kind === 'episode' && r.laneId === v.laneId ? r.failed : 0), 0);
  return [plural(own.length, 'step'), calls > 0 ? plural(calls, 'tool call') : '', failed > 0 ? `${failed} failed` : '', v.at].filter(Boolean).join(', ');
}

/** Weights of what a tooltip spot covers: the ring above any number of reserved zones, a reserved zone above being
 * moved inside the figure, that above any count of the episode's own marks. */
const TIP_COST = { ring: 1e6, reserve: 1e4, moved: 100 };

function place(t: TreeLayout, episodeId: string, n: number | undefined, title0: string, facts: string, at: Pt, laneId: string | undefined, keep: { reserve: readonly Box[]; ring?: Box | undefined }): TreeTip {
  let title = title0;
  // A long recorded request is cut with an ellipsis, as the list's row is.
  if (textWidth(title, 14, 500) > TIP_TITLE_MAX) {
    while (title.length > 1 && textWidth(`${title}…`, 14, 500) > TIP_TITLE_MAX) title = title.slice(0, -1);
    title = `${title.trimEnd()}…`;
  }
  // textWidth carries a 4% margin; without it, the text plus 14px on the right (the canvas's 300 for episode 7).
  const left = n === undefined ? 12 : 34;
  const w = Math.ceil(left + Math.max(textWidth(title, 14, 500), textWidth(facts, 12, 400)) / 1.04 + 14);
  const right = at.x + TIP_GAP.x;
  const below = at.y + TIP_GAP.y;
  const block = t.blocks.find((b) => b.laneId === laneId)?.box;
  const spots: [number, number][] = [[right, below], [right, at.y - TIP_GAP.y - TIP_H], [at.x - TIP_GAP.x - w, at.y - TIP_GAP.y - TIP_H], [at.x - TIP_GAP.x - w, below]];
  if (block) spots.push([right, block.y1 + 6], [right, block.y0 - 6 - TIP_H]);
  const own = ownMarks(t, episodeId, at, laneId);
  const cost = ([x0, y0]: [number, number]) => {
    const x = Math.max(0, Math.min(x0, t.width - w));
    const y = Math.max(0, Math.min(y0, t.height - TIP_H));
    const b = { x0: x, y0: y, x1: x + w, y1: y + TIP_H };
    const c = (keep.ring && boxIn(b, keep.ring) ? TIP_COST.ring : 0) + TIP_COST.reserve * keep.reserve.filter((r) => boxIn(b, r)).length
      + (x !== x0 || y !== y0 ? TIP_COST.moved : 0) + own.circles.filter((o) => circleIn(b, o)).length + own.boxes.filter((o) => boxIn(b, o)).length;
    return { b, c };
  };
  let best = cost(spots[0] as [number, number]);
  for (const s of spots.slice(1)) {
    if (best.c === 0) break;
    const k = cost(s);
    if (k.c < best.c) best = k;
  }
  const box = best.b;
  return { episodeId, ...(n === undefined ? {} : { n }), title, facts, box };
}

/** The callout of a selected step (Step.html): its summary over "Exit code 2, 16 min", beside the step or by the top
 * or bottom edge of the figure, with a 0.5px leader from the step's ring to the text. Lines are layout px; `anchor` is the text's. */
export interface TreeCallout { stepId: string; ring: Pt; x: number; y: number; anchor: 'start' | 'end'; lines: [string, string]; leader: [Pt, Pt]; box: Box }

const CALL_MAX = 360;
/** How far the callout's text may reach past the figure's left or right edge (the canvas's reaches 18px). */
const CALL_BLEED = 24;

/** Whether the segment `a`–`b` crosses the box (Liang–Barsky clipping). */
function segInBox(a: Pt, b: Pt, box: Box): boolean {
  let lo = 0;
  let hi = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.x0], [dx, box.x1 - a.x], [-dy, a.y - box.y0], [dy, box.y1 - a.y]] as const) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) lo = Math.max(lo, r);
    else hi = Math.min(hi, r);
    if (lo >= hi) return false;
  }
  return true;
}

/** The ring's radius as a keep-out for the callout's text (the ring is drawn at 8). */
const RING_CLEAR = 10;
/** A callout over the tree's own text costs more than one over a mark or ribbon: the text would be unreadable. */
const TEXT_COST = 30;
/** The clearance the callout's text keeps from the tree's text and marks. */
const CALL_AIR = 4;

/** The selected step's ring: at the twig's tip, or at a leaf's middle. Undefined for a step the tree does not draw. */
export function treeRing(t: TreeLayout, stepId: string): Pt | undefined {
  const w = t.twigs.find((x) => x.stepId === stepId);
  if (!w) return undefined;
  const a = (w.angle * Math.PI) / 180;
  return w.mark === 'leaf' ? { x: w.tip.x + 5.5 * w.scale * Math.cos(a), y: w.tip.y + 5.5 * w.scale * Math.sin(a) } : w.tip;
}

/** Where the selected step's callout goes: beside the step at its own height, above it at the top edge (left of it,
 * as on the canvas, else right), nearer above, or below at the bottom edge. The text keeps off the ring and inside
 * the figure; the one whose text and leader cover the fewest of the tree's text, marks and ribbons wins, with the
 * legend (`reserve`) weighted far above the rest, then the shortest leader. Undefined for a step the tree does not draw. */
export function treeCallout(t: TreeLayout, stepId: string, lines: [string, string], reserve: readonly Box[] = []): TreeCallout | undefined {
  const ring = treeRing(t, stepId);
  if (!ring) return undefined;
  let title = lines[0];
  if (textWidth(title, 12, 500) > CALL_MAX) {
    while (title.length > 1 && textWidth(`${title}…`, 12, 500) > CALL_MAX) title = title.slice(0, -1);
    title = `${title.trimEnd()}…`;
  }
  const tw = Math.max(textWidth(title, 12, 500), textWidth(lines[1], 12, 400)) / 1.04;
  // Baselines: the first line's; the box runs from its ascent (12px above) to 4px under the second line. The leader runs from
  // 10.3px off the ring to 18px across: up or down to the text's near corner, or level for a callout beside the step.
  const at = (side: 1 | -1, base: number, to: 'above' | 'below' | 'beside'): TreeCallout => {
    const end = { x: ring.x + 18 * side, y: to === 'beside' ? ring.y : to === 'below' ? base - 14 : base + 20 };
    const x = ring.x + 24 * side;
    const box = { x0: side < 0 ? x - tw : x, y0: base - 12, x1: side < 0 ? x : x + tw, y1: base + 20 };
    const d = Math.hypot(end.x - ring.x, end.y - ring.y) || 1;
    const from = { x: ring.x + ((end.x - ring.x) * 10.3) / d, y: ring.y + ((end.y - ring.y) * 10.3) / d };
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return { stepId, ring, x: r1(x), y: r1(base), anchor: side < 0 ? 'end' : 'start', lines: [title, lines[1]], leader: [{ x: r1(from.x), y: r1(from.y) }, { x: r1(end.x), y: r1(end.y) }], box };
  };
  const top = 9.7;
  const bottom = t.height - 20;
  const cands = [
    at(-1, top, 'above'), at(1, top, 'above'), at(-1, ring.y - 70, 'above'), at(1, ring.y - 70, 'above'),
    at(-1, ring.y - 4, 'beside'), at(1, ring.y - 4, 'beside'),
    at(-1, bottom, 'below'), at(1, bottom, 'below'), at(-1, ring.y + 60, 'below'), at(1, ring.y + 60, 'below'),
    // The box's top is the text's ascent: at the top edge (baseline 9.7, as on the canvas) it reaches 2.3px past the
    // figure, above the glyphs' ink.
  ].filter((c) => !circleIn(c.box, { ...ring, r: RING_CLEAR }) && c.box.y0 >= top - 12 && c.box.y1 <= t.height + 4);
  const marks: Circle[] = [{ ...t.root.at, r: t.root.r + 2 }, ...t.episodes.map((m) => ({ ...m.at, r: m.r + 3 })), ...t.tips.map((m) => ({ ...m.at, r: m.r + 3 })), ...t.twigs.map((x) => ({ ...x.tip, r: 6 }))];
  for (const rb of t.ribbons) rb.line.forEach((p, i) => marks.push({ ...p, r: (rb.widths[i] ?? 0) / 2 + 2 }));
  const texts = [...t.labels.map(labelBox), ...t.blocks.map((b) => b.box)];
  const len = (c: TreeCallout) => Math.hypot(c.leader[1].x - c.leader[0].x, c.leader[1].y - c.leader[0].y);
  const cost = (c: TreeCallout) => {
    const [a, b] = c.leader;
    // 4px of air between the text and the tree's numbers, labels and glyphs.
    const near = { x0: c.box.x0 - CALL_AIR, y0: c.box.y0 - CALL_AIR, x1: c.box.x1 + CALL_AIR, y1: c.box.y1 + CALL_AIR };
    const out = c.box.x0 < -CALL_BLEED || c.box.x1 > t.width + CALL_BLEED ? 99 : 0;
    const legend = 99 * reserve.filter((r) => boxIn(c.box, r) || segInBox(a, b, r)).length;
    const text = TEXT_COST * texts.filter((r) => boxIn(near, r)).length + 99 * texts.filter((r) => segInBox(a, b, r)).length;
    return out + legend + text + marks.filter((m) => circleIn(near, m) || segDist(m, a, b) < m.r).length;
  };
  let best: TreeCallout | undefined;
  let bestC = Infinity;
  for (const c of cands) {
    const k = cost(c);
    if (k < bestC || (k === bestC && best && len(c) < len(best))) [best, bestC] = [c, k];
  }
  return best ?? at(-1, top, 'above');
}

/** The vertical window of a session page's tree (not the home's, which keeps the canvas's 1200 × 520): from `pad` above
 * the drawing's top to `pad` under its bottom, at least `min` tall, and starting no higher than the reserved zones
 * touching the top (the legend) less the drawing's top, so the legend never sits on the tree. Layout px. */
export function treeCrop(t: TreeLayout, reserve: readonly Box[] = [], { pad = 24, min = 240 } = {}): { y0: number; y1: number } {
  let top = Infinity;
  let bottom = -Infinity;
  const take = (y0: number, y1: number) => {
    top = Math.min(top, y0);
    bottom = Math.max(bottom, y1);
  };
  for (const r of t.ribbons) r.line.forEach((p, i) => take(p.y - (r.widths[i] ?? 0) / 2, p.y + (r.widths[i] ?? 0) / 2));
  for (const w of t.twigs) take(Math.min(w.base.y, w.tip.y) - 6 * w.scale, Math.max(w.base.y, w.tip.y) + 6 * w.scale);
  for (const m of [...t.episodes, ...t.tips, t.root]) take(m.at.y - m.r - 3, m.at.y + m.r + 3);
  for (const b of t.handBacks) take(Math.min(b.from.y, b.c.y, b.to.y), Math.max(b.from.y, b.c.y, b.to.y));
  for (const l of [...t.labels, ...t.blocks.flatMap((b) => b.lines)]) {
    const b = labelBox(l);
    take(b.y0, b.y1);
  }
  if (!Number.isFinite(top)) return { y0: 0, y1: t.height };
  const under = Math.max(0, ...reserve.filter((r) => r.y0 <= 0).map((r) => r.y1));
  let y0 = Math.max(0, Math.min(top - pad, top - under - pad / 2));
  let y1 = Math.min(t.height, bottom + pad);
  if (y1 - y0 < min) {
    y1 = Math.min(t.height, y0 + min);
    y0 = Math.max(0, y1 - min);
  }
  return { y0: Math.floor(y0), y1: Math.ceil(y1) };
}

/** Legend entries: the five episode kinds, then Command, Thinking, Failed and Width. */
export type LegendKey = 'discuss' | 'explore' | 'change' | 'verify' | 'answer' | 'command' | 'thinking' | 'failed' | 'width';

/** The legend entries a session's tree draws (an opened session's legend lists only these; the home keeps them all). */
export function legendKeys(g: SessionGraph): Set<LegendKey> {
  const m = treeModel(g);
  const keys = new Set<LegendKey>();
  for (const p of [m.trunk, ...m.limbs]) {
    for (const e of p.episodes) keys.add(e.glyph);
    if (p.tip.kind === 'answer') keys.add('answer');
    for (const w of [...p.twigs, ...p.episodes.flatMap((e) => e.twigs)]) keys.add(w.kind === 'thinking' ? 'thinking' : w.kind === 'failed' ? 'failed' : 'command');
  }
  if (keys.has('command') || keys.has('failed')) keys.add('width');
  return keys;
}
