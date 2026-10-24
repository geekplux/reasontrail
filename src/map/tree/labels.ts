// Label placement (docs/design/v7/PROMPT.md §5.2): every label tries its candidate positions in order and takes the
// first whose box hits no glyph, tip, number, other label, lane block, ribbon or twig and stays inside the box.
// Order: root labels, episode numbers, lane blocks, wait texts; each placed label is an obstacle for the next.
import type { VerdictTone } from '../gitlist/rows';
import { textWidth } from './text';
import type { Block, Box, EpisodeMark, Label, LabelClass, Pt, Ribbon, TipMark, Twig } from './types';

interface Input {
  width: number;
  height: number;
  ribbons: Ribbon[];
  twigs: Twig[];
  episodes: EpisodeMark[];
  tips: TipMark[];
  root: { at: Pt; r: number };
  rootAt: string;
  waits: { laneId: string; text: string; at: Pt; below: boolean }[];
  /** Each episode's branch heading at its tip (radians). */
  headings: Record<string, number>;
  blocks: { laneId: string; lines: { text: string; cls: LabelClass; icon?: VerdictTone }[] }[];
}
type Circle = { x: number; y: number; r: number };

const FONT: Record<LabelClass, [12 | 14, 400 | 500 | 600]> = { num: [12, 500], sub: [12, 400], lab: [12, 500], lane: [14, 600] };
/** The label's ink box (cap height above the baseline, descenders below), padded by 2px. */
export function labelBox(l: Label): Box {
  const [size, weight] = FONT[l.cls];
  const w = textWidth(l.text, size, weight) + (l.icon ? 20 : 0);
  const x0 = l.anchor === 'start' ? l.x : l.anchor === 'middle' ? l.x - w / 2 : l.x - w;
  return { x0: x0 - 2, y0: l.y - size * 0.8 - 2, x1: x0 + w + 2, y1: l.y + size * 0.25 + 2 };
}
export const boxesHit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const circleHit = (b: Box, c: Circle) => {
  const dx = Math.max(b.x0 - c.x, 0, c.x - b.x1);
  const dy = Math.max(b.y0 - c.y, 0, c.y - b.y1);
  return dx * dx + dy * dy < c.r * c.r;
};
const union = (bs: Box[]): Box => ({ x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) });
const r1 = (v: number) => Math.round(v * 10) / 10;

export function placeLabels(inp: Input): { labels: Label[]; blocks: Block[] } {
  const circles: Circle[] = [{ ...inp.root.at, r: inp.root.r + 2 }];
  for (const rb of inp.ribbons) rb.line.forEach((p, i) => circles.push({ ...p, r: (rb.widths[i] ?? 0) / 2 + 1 }));
  for (const e of inp.episodes) circles.push({ ...e.at, r: e.r + 2.5 });
  for (const t of inp.tips) circles.push({ ...t.at, r: t.r + 3 });
  // Twigs and their tips: numbers may sit over them (their halo keeps them legible), other text may not.
  const twigs: Circle[] = inp.twigs.flatMap((t) => [{ x: (t.base.x + t.tip.x) / 2, y: (t.base.y + t.tip.y) / 2, r: 1.5 }, { ...t.tip, r: t.mark === 'none' ? 1.5 : 4 * t.scale }]);
  const placed: Box[] = [];
  // The 2px padding may reach past the box; the text itself may not.
  const out = (b: Box) => b.x0 < -2 || b.y0 < -2 || b.x1 > inp.width + 2 || b.y1 > inp.height + 2;
  const hits = (b: Box, all: boolean) => placed.filter((p) => boxesHit(p, b)).length + circles.filter((c) => circleHit(b, c)).length + (all ? twigs.filter((c) => circleHit(b, c)).length : 0) + (out(b) ? 99 : 0);
  /** The first free candidate, else the one hitting the fewest obstacles (never silent: the tests assert zero). */
  const pick = <T>(cands: T[], boxOf: (c: T) => Box, all = true): T => {
    const best = cands.find((c) => hits(boxOf(c), all) === 0) ?? [...cands].sort((a, b) => hits(boxOf(a), all) - hits(boxOf(b), all))[0] as T;
    placed.push(boxOf(best));
    return best;
  };
  const labels: Label[] = [];
  // Root: "Task" and the start time, left-aligned to the content edge, under the root (else above it).
  const { y } = inp.root.at;
  const rootPair = (dy: number): Label[] => [
    { key: 'root:task', text: 'Task', cls: 'lab', x: 0, y: r1(y + dy), anchor: 'start' },
    { key: 'root:at', text: inp.rootAt, cls: 'sub', x: 0, y: r1(y + dy + 16), anchor: 'start' },
  ];
  const rootLabels = pick([26, -28, 34, -36].map(rootPair), (ls) => union(ls.map(labelBox)));
  labels.push(...rootLabels.filter((l) => l.text));
  // Episode numbers: beyond the branch tip along its heading, else turned around the glyph.
  for (const e of inp.episodes) {
    const h = inp.headings[e.episodeId] ?? 0;
    const cands = [15, 21].flatMap((d) => [0, -40, 40, -80, 80, -120, 120, 180].map((deg): Label => {
      const a = h + (deg * Math.PI) / 180;
      return { key: `num:${e.episodeId}`, text: String(e.n), cls: 'num', x: r1(e.at.x + d * Math.cos(a)), y: r1(e.at.y + d * Math.sin(a) + 4), anchor: 'middle' };
    }));
    labels.push(pick(cands, labelBox, false));
  }
  // Lane blocks: right of the tip, nudged up or down; else left of it.
  const blocks: Block[] = [];
  for (const b of inp.blocks) {
    const tip = inp.tips.find((t) => t.laneId === b.laneId);
    if (!tip || b.lines.length === 0) continue;
    const lines = (x: number, top: number) => {
      let base = top + (b.lines[0]?.cls === 'lane' ? 14 : 12);
      return b.lines.map((l, i): Label => {
        const prev = b.lines[i - 1];
        if (prev) base += prev.cls === 'lane' || prev.icon ? 20 : 16;
        return { key: `block:${b.laneId}:${i}`, text: l.text, cls: l.cls, x: r1(x), y: r1(base), anchor: 'start', ...(l.icon ? { icon: l.icon } : {}) };
      });
    };
    const w = Math.max(...lines(0, 0).map((l) => labelBox(l).x1 - 2));
    const h = b.lines.length > 2 ? 58 : 34;
    // Beside the tip (name 22px above it, as on the canvas), then nudged up or down in 10px steps.
    const dys = [0, -10, 10, -20, 20, -30, 30, -40, 40, -60, 60, -80, 80].map((d) => d - (h === 58 ? 22 : 14));
    const xs = [tip.at.x + tip.r + 13, tip.at.x - tip.r - 13 - w];
    const cands = xs.flatMap((x) => dys.map((dy) => lines(x, tip.at.y + dy)));
    const best = pick(cands, (ls) => union(ls.map(labelBox)));
    blocks.push({ laneId: b.laneId, box: union(best.map(labelBox)), lines: best });
  }
  // Waits: on the trunk between the spawn and the hand-back, on the side away from the limb.
  for (const wt of inp.waits) {
    const cands = [0, -40, 40, -80, 80].flatMap((dx) => (wt.below ? [24, -14] : [-14, 24]).map((dy): Label => ({ key: `wait:${wt.laneId}`, text: wt.text, cls: 'sub', x: r1(wt.at.x + dx), y: r1(wt.at.y + dy), anchor: 'middle' })));
    labels.push(pick(cands, labelBox));
  }
  return { labels, blocks };
}
