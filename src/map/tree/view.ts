// What the tree renderer needs beyond geometry (docs/design/v7/PROMPT.md §5.4), pure: the layout memoised per graph
// and box, the factual summary for the SVG's label, and the hover tooltip ("7  Edit … +8 more" over "20 steps, 6 tool
// calls, 15 min wait, 17 min"). Numbers, titles and times come from the list's row model, so tree and list agree.
import type { SessionGraph } from '../../../shared/session/types';
import { listRows, type EpisodeRow, type ListRow, type VerdictRow } from '../gitlist/rows';
import { layoutTree } from './layout';
import { labelBox } from './labels';
import { textWidth } from './text';
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
  /** Zones the box keeps clear of (the legend). */
  reserve?: readonly Box[] | undefined;
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
 * the canvas, else right-above, left-above or left-below, else right of the tip under or over its lane's block, the
 * first that keeps clear of the episode's own marks inside
 * the box and off the legend (else the one covering the fewest). Undefined for an id the tree does not draw. */
export function treeTip(g: SessionGraph, t: TreeLayout, episodeId: string, opts: TreeTipOptions = {}): TreeTip | undefined {
  const { rows = listRows(g), tipLane, reserve = [] } = opts;
  const lane = tipLane ? rows.find((r): r is VerdictRow => r.kind === 'verdict' && r.laneId === tipLane) : undefined;
  const tipAt = lane ? t.tips.find((m) => m.laneId === tipLane)?.at : undefined;
  // The tip stands for its lane: its title and facts are the lane's; it keeps clear of the episode it highlights.
  if (lane && tipAt) return place(t, episodeId, undefined, lane.text, laneFacts(g, rows, lane), tipAt, tipLane, reserve);
  const row = rows.find((r): r is EpisodeRow | VerdictRow => (r.kind === 'episode' || r.kind === 'verdict') && r.episodeId === episodeId);
  const at: Pt | undefined = t.episodes.find((m) => m.episodeId === episodeId)?.at ?? t.tips.find((m) => m.episodeId === episodeId)?.at;
  const n = row?.n;
  if (!row || !at || n === undefined) return undefined;
  const ids = new Set(g.episodes.find((e) => e.id === episodeId)?.stepIds);
  const calls = g.steps.filter((s) => ids.has(s.id) && s.kind === 'tool-call').length;
  const failed = row.kind === 'episode' && row.failed > 0 ? `${row.failed} failed` : '';
  const facts = [plural(row.steps ?? ids.size, 'step'), calls > 0 ? plural(calls, 'tool call') : '', failed, row.kind === 'episode' ? row.wait : '', row.at].filter(Boolean).join(', ');
  return place(t, episodeId, n, row.kind === 'episode' ? row.title : row.text, facts, at, row.laneId, reserve);
}

/** A lane's facts for its verdict's tooltip: its steps, tool calls, failed calls and when it ended. */
function laneFacts(g: SessionGraph, rows: readonly ListRow[], v: VerdictRow): string {
  const own = g.steps.filter((s) => s.laneId === v.laneId);
  const calls = own.filter((s) => s.kind === 'tool-call').length;
  const failed = rows.reduce((a, r) => a + (r.kind === 'episode' && r.laneId === v.laneId ? r.failed : 0), 0);
  return [plural(own.length, 'step'), calls > 0 ? plural(calls, 'tool call') : '', failed > 0 ? `${failed} failed` : '', v.at].filter(Boolean).join(', ');
}

function place(t: TreeLayout, episodeId: string, n: number | undefined, title0: string, facts: string, at: Pt, laneId: string | undefined, reserve: readonly Box[]): TreeTip {
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
  const cands: Box[] = spots.map(([x, y]) => ({ x0: x, y0: y, x1: x + w, y1: y + TIP_H }));
  const fits = (b: Box) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= t.width && b.y1 <= t.height && !reserve.some((r) => boxIn(b, r));
  const own = ownMarks(t, episodeId, at, laneId);
  const covered = (b: Box) => own.circles.filter((c) => circleIn(b, c)).length + own.boxes.filter((o) => boxIn(b, o)).length;
  let best: Box | undefined;
  let bestC = Infinity;
  for (const b of cands.filter(fits)) {
    const c = covered(b);
    if (c < bestC) [best, bestC] = [b, c];
    if (c === 0) break;
  }
  // Nowhere fits (a box smaller than the tooltip): right and below, moved inside.
  const box = best ?? (() => { const x = Math.max(0, Math.min(right, t.width - w)); const y = Math.max(0, Math.min(below, t.height - TIP_H)); return { x0: x, y0: y, x1: x + w, y1: y + TIP_H }; })();
  return { episodeId, ...(n === undefined ? {} : { n }), title, facts, box };
}

/** The callout of a selected step (Step.html): its summary over "Exit code 2, 16 min", beside the top or bottom edge
 * of the figure, with a 0.5px leader from the step's ring to the text. Lines are layout px; `anchor` is the text's. */
export interface TreeCallout { stepId: string; ring: Pt; x: number; y: number; anchor: 'start' | 'end'; lines: [string, string]; leader: [Pt, Pt]; box: Box }

const CALL_MAX = 360;
/** How far the callout's text may reach past the figure's left or right edge (the canvas's reaches 18px). */
const CALL_BLEED = 24;

/** Where the selected step's ring and callout go: above the step at the top edge (left of it, as on the canvas, else
 * right), then nearer above, then below at the bottom edge; the first that keeps clear of the tree's text, marks,
 * ribbons and twigs and of `reserve` (else the one hitting the fewest). Undefined for a step the tree does not draw. */
export function treeCallout(t: TreeLayout, stepId: string, lines: [string, string], reserve: readonly Box[] = []): TreeCallout | undefined {
  const w = t.twigs.find((x) => x.stepId === stepId);
  if (!w) return undefined;
  const a = (w.angle * Math.PI) / 180;
  const ring = w.mark === 'leaf' ? { x: w.tip.x + 5.5 * w.scale * Math.cos(a), y: w.tip.y + 5.5 * w.scale * Math.sin(a) } : w.tip;
  let title = lines[0];
  if (textWidth(title, 12, 500) > CALL_MAX) {
    while (title.length > 1 && textWidth(`${title}…`, 12, 500) > CALL_MAX) title = title.slice(0, -1);
    title = `${title.trimEnd()}…`;
  }
  const tw = Math.max(textWidth(title, 12, 500), textWidth(lines[1], 12, 400)) / 1.04;
  // Baselines: the first line's; the box runs from its cap height to 4px under the second line.
  const at = (side: 1 | -1, base: number, below: boolean): TreeCallout => {
    const end = { x: ring.x + 18 * side, y: below ? base - 14 : base + 20 };
    const x = ring.x + 24 * side;
    const box = { x0: side < 0 ? x - tw : x, y0: base - 9, x1: side < 0 ? x : x + tw, y1: base + 20 };
    const d = Math.hypot(end.x - ring.x, end.y - ring.y) || 1;
    const from = { x: ring.x + ((end.x - ring.x) * 10.3) / d, y: ring.y + ((end.y - ring.y) * 10.3) / d };
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return { stepId, ring, x: r1(x), y: r1(base), anchor: side < 0 ? 'end' : 'start', lines: [title, lines[1]], leader: [{ x: r1(from.x), y: r1(from.y) }, { x: r1(end.x), y: r1(end.y) }], box };
  };
  const top = 9.7;
  const bottom = t.height - 20;
  const cands = [at(-1, top, false), at(1, top, false), at(-1, ring.y - 70, false), at(1, ring.y - 70, false), at(-1, bottom, true), at(1, bottom, true), at(-1, ring.y + 60, true), at(1, ring.y + 60, true)]
    .filter((c) => (c.box.y1 < ring.y - 24 || c.box.y0 > ring.y + 24) && c.box.y0 >= 0 && c.box.y1 <= t.height + 4);
  const marks: Circle[] = [{ ...t.root.at, r: t.root.r + 2 }, ...t.episodes.map((m) => ({ ...m.at, r: m.r + 3 })), ...t.tips.map((m) => ({ ...m.at, r: m.r + 3 })), ...t.twigs.map((x) => ({ ...x.tip, r: 6 }))];
  for (const rb of t.ribbons) rb.line.forEach((p, i) => marks.push({ ...p, r: (rb.widths[i] ?? 0) / 2 + 2 }));
  const texts = [...t.labels.map(labelBox), ...t.blocks.map((b) => b.box), ...reserve];
  const cost = (c: TreeCallout) => (c.box.x0 < -CALL_BLEED || c.box.x1 > t.width + CALL_BLEED ? 99 : 0) + marks.filter((m) => circleIn(c.box, m)).length + texts.filter((b) => boxIn(c.box, b)).length;
  let best: TreeCallout | undefined;
  let bestC = Infinity;
  for (const c of cands) {
    const k = cost(c);
    if (k < bestC) [best, bestC] = [c, k];
    if (k === 0) break;
  }
  return best ?? at(-1, top, false);
}
