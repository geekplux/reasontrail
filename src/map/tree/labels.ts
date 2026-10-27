// Label placement: every label tries its candidate positions in order and takes the
// first whose box hits no glyph, tip, number, other label, lane block, ribbon, twig, hand-back or reserved zone and
// stays inside the box. Order: root labels, episode numbers, lane blocks, wait texts; each placed label is an obstacle
// for the next.
import type { VerdictTone } from '../gitlist/rows';
import { textWidth } from './text';
import type { Block, Box, EpisodeMark, HandBack, Label, LabelClass, Pt, Ribbon, TipMark, Twig } from './types';

/** A wait text's anchor: `x` on the trunk, the baselines above and below it, and the side away from its limb. */
export interface WaitSrc { laneId: string; text: string; x: number; above: number; below: number; preferBelow: boolean }
interface Input {
  width: number;
  height: number;
  ribbons: Ribbon[];
  twigs: Twig[];
  episodes: EpisodeMark[];
  tips: TipMark[];
  handBacks: HandBack[];
  root: { at: Pt; r: number };
  rootAt: string;
  waits: WaitSrc[];
  /** Each episode's branch heading at its tip (radians). */
  headings: Record<string, number>;
  blocks: { laneId: string; lines: { text: string; cls: LabelClass; icon?: VerdictTone }[] }[];
  /** Zones kept free of text (the legend). */
  reserve: Box[];
}
type Circle = { x: number; y: number; r: number };

const FONT: Record<LabelClass, [12 | 14, 400 | 500 | 600]> = { num: [12, 500], sub: [12, 400], lab: [12, 500], lane: [14, 600] };
const DESCENDER = /[gjpqy,]/;
/** The label's ink box (cap height above the baseline, descenders below only when the text has one), padded by 1px. */
export function labelBox(l: Label): Box {
  const [size, weight] = FONT[l.cls];
  const w = textWidth(l.text, size, weight) + (l.icon ? 20 : 0);
  const x0 = l.anchor === 'start' ? l.x : l.anchor === 'middle' ? l.x - w / 2 : l.x - w;
  // A verdict icon (14px, its top 12px above the baseline) reaches below the cap height.
  const below = l.icon ? 2 : DESCENDER.test(l.text) ? size * 0.25 : 0;
  return { x0: x0 - 1, y0: l.y - (l.icon ? 12 : size * 0.8) - 1, x1: x0 + w + 1, y1: l.y + below + 1 };
}
export const boxesHit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const circleHit = (b: Box, c: Circle) => {
  const dx = Math.max(b.x0 - c.x, 0, c.x - b.x1);
  const dy = Math.max(b.y0 - c.y, 0, c.y - b.y1);
  // A tolerance, so that touching at exactly the padding is not a hit.
  return dx * dx + dy * dy < c.r * c.r - 1e-6;
};
export const union = (bs: Box[]): Box => bs.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }));
const spread = (b: Box): Box => ({ x0: b.x0 - 32, y0: b.y0 - 16, x1: b.x1 + 32, y1: b.y1 + 16 });
const r1 = (v: number) => Math.round(v * 10) / 10;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * What text may not cover besides ribbons and marks: each twig's stroke sampled every 1.5px, its leaf (a circle over
 * the almond), bud or ✕, and each hand-back sampled every 4px. Shared with the tests.
 */
export function twigCircles(twigs: readonly Twig[], backs: readonly HandBack[]): Circle[] {
  const out: Circle[] = [];
  for (const t of twigs) {
    const n = Math.max(1, Math.ceil(dist(t.base, t.tip) / 1.5));
    for (let i = 0; i <= n; i++) out.push({ x: t.base.x + ((t.tip.x - t.base.x) * i) / n, y: t.base.y + ((t.tip.y - t.base.y) * i) / n, r: 1 });
    const a = (t.angle * Math.PI) / 180;
    if (t.mark === 'leaf') out.push({ x: t.tip.x + 5.5 * t.scale * Math.cos(a), y: t.tip.y + 5.5 * t.scale * Math.sin(a), r: 6 * t.scale });
    else if (t.mark === 'bud') out.push({ ...t.tip, r: 3.4 * t.scale });
    else if (t.mark === 'x') out.push({ ...t.tip, r: 4.5 * t.scale });
  }
  for (const b of backs) {
    const n = Math.max(1, Math.ceil((dist(b.from, b.c) + dist(b.c, b.to)) / 4));
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const q = (k: 'x' | 'y') => (1 - s) * (1 - s) * b.from[k] + 2 * s * (1 - s) * b.c[k] + s * s * b.to[k];
      out.push({ x: q('x'), y: q('y'), r: 1.5 });
    }
  }
  return out;
}

/**
 * Places every label. Lane blocks in `first` go before the episode numbers (a second pass gives a block that found no
 * free spot priority); `stuck` lists the lanes whose block still hit something.
 */
export function placeLabels(inp: Input, first: ReadonlySet<string> = new Set()): { labels: Label[]; blocks: Block[]; stuck: string[] } {
  const circles: Circle[] = [{ ...inp.root.at, r: inp.root.r + 2 }];
  for (const rb of inp.ribbons) rb.line.forEach((p, i) => circles.push({ ...p, r: (rb.widths[i] ?? 0) / 2 + 1 }));
  // Glyph halos by episode: a number skips its own (it has its own background halo).
  const glyphs = new Map<string, Circle>();
  for (const e of inp.episodes) glyphs.set(e.episodeId, { ...e.at, r: e.r + 2.5 });
  for (const t of inp.tips) circles.push({ ...t.at, r: t.r + 3 });
  for (const b of inp.handBacks) circles.push({ ...b.to, r: 3.5 });
  // Twigs, leaves and hand-backs: numbers may sit over them (their halo keeps them legible), other text may not. Where
  // no spot is free (lanes spawned together all hand back across each other's tips), a faint dotted hand-back is the
  // last thing text may cross.
  const fine = twigCircles(inp.twigs, []);
  const backs = twigCircles([], inp.handBacks);
  const placed: Box[] = [...inp.reserve];
  // The 1px padding may reach past the box; the text itself may not.
  const out = (b: Box) => b.x0 < -1 || b.y0 < -1 || b.x1 > inp.width + 1 || b.y1 > inp.height + 1;
  const count = <T>(xs: Iterable<T>, f: (x: T) => boolean) => { let n = 0; for (const x of xs) if (f(x)) n++; return n; };
  const hits = (b: Box, all: boolean, own?: string) =>
    count(placed, (p) => boxesHit(p, b)) + count(circles, (c) => circleHit(b, c)) + count(glyphs, ([id, c]) => id !== own && circleHit(b, c))
    + (all ? count(fine, (c) => circleHit(b, c)) + 0.01 * count(backs, (c) => circleHit(b, c)) : 0) + (out(b) ? 99 : 0);
  /** The first free candidate, else the one hitting the fewest obstacles (never silent: the tests assert zero). */
  let lastCost = 0;
  const pick = <T>(cands: T[], boxOf: (c: T) => Box, opt: { all?: boolean; own?: string; ok?: (c: T) => boolean } = {}): T => {
    const cost = (c: T) => hits(boxOf(c), opt.all ?? true, opt.own) + (opt.ok && !opt.ok(c) ? 1 : 0);
    let best = cands[0] as T;
    let bestCost = Infinity;
    for (const c of cands) {
      const k = cost(c);
      if (k < bestCost) { best = c; bestCost = k; }
      if (k === 0) break;
    }
    placed.push(boxOf(best));
    lastCost = bestCost;
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
  // Lane blocks: beside the tip (name 22px above it, as on the canvas), right then left within 20px, then further,
  // never with the block's nearest edge more than 24px above or below the tip.
  const blocks: Block[] = [];
  const stuck: string[] = [];
  const placeBlock = (b: Input['blocks'][number]) => {
    const tip = inp.tips.find((t) => t.laneId === b.laneId);
    if (!tip || b.lines.length === 0) return;
    const lines = (x: number, top: number) => {
      let base = top + (b.lines[0]?.cls === 'lane' ? 14 : 12);
      return b.lines.map((l, i): Label => {
        const prev = b.lines[i - 1];
        if (prev) base += prev.cls === 'lane' || prev.icon ? 20 : 16;
        return { key: `block:${b.laneId}:${i}`, text: l.text, cls: l.cls, x: r1(x), y: r1(base), anchor: 'start', ...(l.icon ? { icon: l.icon } : {}) };
      });
    };
    const w = Math.max(...lines(0, 0).map((l) => labelBox(l).x1 - 1));
    const up = b.lines.length > 2 ? 22 : 14;
    const xs = [tip.at.x + tip.r + 13, tip.at.x - tip.r - 13 - w];
    const near = (ls: Label[]) => { const bx = union(ls.map(labelBox)); return tip.at.y >= bx.y0 - 24 && tip.at.y <= bx.y1 + 24; };
    const at = (dys: number[]) => xs.flatMap((x) => dys.map((dy) => lines(x, tip.at.y + dy - up))).filter(near);
    // Last, further out to the right or left of the tip.
    const away = [12, 24, 36, 48].flatMap((sx) => [0, -10, 10, -20, 20, -30, 30, -40, 40, -50, 50, -60].flatMap((dy) => [lines(xs[0] as number + sx, tip.at.y + dy - up), lines(xs[1] as number - sx, tip.at.y + dy - up)]));
    const cands = [...at([0, -10, 10, -20, 20]), ...at([-30, 30, -40, 40, -50, 50, -60, 60, -70]), ...away.filter(near)];
    const best = pick(cands, (ls) => union(ls.map(labelBox)));
    if (lastCost > 0) stuck.push(b.laneId);
    blocks.push({ laneId: b.laneId, box: union(best.map(labelBox)), lines: best });
  };
  for (const b of inp.blocks) if (first.has(b.laneId)) placeBlock(b);
  // Episode numbers: 15px beyond the glyph along the branch heading, turned up to ±90°, then 21px, then behind it.
  // A number must stay plainly its own glyph's: 6px nearer it than any other glyph or tip, and 1.3× nearer.
  const marks: (Pt & { id?: string })[] = [...inp.episodes.map((e) => ({ ...e.at, id: e.episodeId })), ...inp.tips.map((t) => t.at)];
  const turns = [0, -30, 30, -60, 60, -90, 90];
  for (const e of inp.episodes) {
    const h = inp.headings[e.episodeId] ?? 0;
    const at = (d: number, deg: number): Label => {
      const a = h + (deg * Math.PI) / 180;
      return { key: `num:${e.episodeId}`, text: String(e.n), cls: 'num', x: r1(e.at.x + d * Math.cos(a)), y: r1(e.at.y + d * Math.sin(a) + 4), anchor: 'middle' };
    };
    const cands = [...turns.map((t) => at(15, t)), ...turns.map((t) => at(21, t)), ...[120, -120, 180].flatMap((t) => [at(15, t), at(21, t)])];
    const owned = (l: Label) => {
      const c = { x: l.x, y: l.y - 4 };
      const own = dist(c, e.at);
      return marks.every((q) => q.id === e.episodeId || (dist(c, q) >= own + 6 && dist(c, q) >= 1.3 * own));
    };
    labels.push(pick(cands, labelBox, { all: false, own: e.episodeId, ok: owned }));
  }
  for (const b of inp.blocks) if (!first.has(b.laneId)) placeBlock(b);
  const order = inp.blocks.map((b) => b.laneId);
  blocks.sort((a, b) => order.indexOf(a.laneId) - order.indexOf(b.laneId));
  // Waits: on the trunk between the spawn and the hand-back, on the side away from the limb, unless a number sits on
  // that side within 60px; at least 32px left or right of another wait (16px above or below).
  const nums = labels.filter((l) => l.cls === 'num');
  const waitBoxes: Box[] = [];
  for (const wt of inp.waits) {
    const label = (dx: number, yy: number): Label => ({ key: `wait:${wt.laneId}`, text: wt.text, cls: 'sub', x: r1(wt.x + dx), y: r1(yy), anchor: 'middle' });
    const crowded = (yy: number) => nums.some((n) => dist({ x: n.x, y: n.y - 4 }, { x: wt.x, y: yy - 4 }) <= 60);
    let sides = wt.preferBelow ? [wt.below, wt.above] : [wt.above, wt.below];
    if (crowded(sides[0] as number) && !crowded(sides[1] as number)) sides = [sides[1] as number, sides[0] as number];
    const dxs = [0, -20, 20, -40, 40, -60, 60, -80, 80, -100, 100];
    // Then a line further from the trunk on either side.
    const further = sides.map((yy) => (yy > wt.above ? yy + 16 : yy - 16));
    const cands = [...dxs.flatMap((dx) => sides.map((yy) => label(dx, yy))), ...dxs.flatMap((dx) => further.map((yy) => label(dx, yy)))];
    const best = pick(cands, labelBox, { ok: (l) => waitBoxes.every((b) => !boxesHit(spread(b), labelBox(l))) });
    waitBoxes.push(labelBox(best));
    labels.push(best);
  }
  return { labels, blocks, stuck };
}
