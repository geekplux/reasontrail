// The tree layout engine (the algorithm of the design canvas's tree, kept as __fixtures__/tree.mjs, generalised
// for any session). Pure and deterministic: the same graph and box always give the same tree.
// Geometry is computed in a design box 520 units tall (the canvas's hero tree); a shorter box (the phone silhouette)
// scales the whole drawing down, like the canvas does.
import type { SessionGraph } from '../../../shared/session/types';
import { labelBox, placeLabels } from './labels';
import { textWidth } from './text';
import { treeModel, type EpisodeSrc, type PartSrc, type TwigSrc } from './model';
import type { Box, EpisodeMark, HandBack, HitTarget, PathPart, Pt, Ribbon, TipMark, TreeLayout, TreeOptions, Twig } from './types';

const DESIGN_H = 520;
const ROOT_R = 5.5;
/** The trunk's extra width at design u `x`, fading out from the root (tree.mjs; not drawn on a highlighted path). */
const rootFlare = (x: number) => 10 * Math.exp(-(x - ROOT_R) / 16);
const GLYPH_R = 5.5;
/** The smallest along-axis step per record (design units) before records are packed closer. */
const MIN_UNIT = 1.2;
const RISE = 96;
/** The thickest the trunk gets before its root flare (design units). */
const MAX_W = 16;
const PAD = 4;
/** How far (design units) a part's 2-unit tail may reach past the along-axis into the label room. */
const TAIL = 12;
/** The share of the height a one-lane tree grows to. */
const FILL = 0.7;
const N = 40;
/** The right-hand room (design units) of a tree drawn without labels. */
const NO_LABEL_ROOM = 54;
/** A trunk that ends in a dot (no answer) runs at least this far (design units) past its last glyph. */
const DOT_CLEAR = 20;
const rad = (d: number) => (d * Math.PI) / 180;
const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fall = (u: number, b: number, d = 10) => clamp((b + d - u) / d, 0, 1);
const angleOf = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = dx * dx + dy * dy;
  const s = l ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l, 0, 1) : 0;
  return Math.hypot(p.x - a.x - s * dx, p.y - a.y - s * dy);
};

/** A filled ribbon around a centreline with the given full widths (tree.mjs `ribbon()`). */
export function ribbonPath(pts: readonly Pt[], widths: readonly number[]): string {
  const L: string[] = [];
  const R: string[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)] as Pt;
    const b = pts[Math.min(pts.length - 1, i + 1)] as Pt;
    const m = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / m;
    const ny = (b.x - a.x) / m;
    const w = (widths[i] ?? 0) / 2;
    L.push(`${r1(p.x + nx * w)} ${r1(p.y + ny * w)}`);
    R.push(`${r1(p.x - nx * w)} ${r1(p.y - ny * w)}`);
  });
  return `M${L.join('L')}L${R.reverse().join('L')}Z`;
}

interface Line { pts: (Pt & { h?: number })[]; widths: number[] }
type Part = Pick<Ribbon, 'id' | 'kind' | 'laneId' | 'episodeId'> & { line: Line };
type TwigD = Omit<Twig, 'scale'> & { s: number };
/** An episode's branch as grown: its ribbon, twigs, glyph position and the heading at its tip. */
interface Branch { e: EpisodeSrc; side: number; laneId: string; parent: Line; base: PathPart[]; len: number; part: Part; twigs: TwigD[]; at: Pt; h: number; steps: Record<string, PathPart[]> }

/** The point of a centreline at along-position `u` (the first at or past it, else the last), its index and heading. */
function pointAt(line: Line, u: number) {
  const k = line.pts.findIndex((p) => p.x >= u);
  const i = Math.min(line.pts.length - 1, k < 0 ? line.pts.length - 1 : Math.max(1, k));
  const p = line.pts[i] as Pt;
  const q = line.pts[i - 1] ?? p;
  return { x: p.x, y: p.y, a: angleOf(q, p), i };
}
/** The centreline interpolated at along-position `u`, with its heading. */
function lerpAt(line: Line, u: number): Pt & { h: number } {
  const k = clamp(line.pts.findIndex((p) => p.x >= u), 1, line.pts.length - 1);
  const a = line.pts[k - 1] ?? (line.pts[0] as Pt);
  const b = line.pts[k] ?? a;
  const t = b.x > a.x ? clamp((u - a.x) / (b.x - a.x), 0, 1) : 1;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: angleOf(a, b) };
}
/** Does a circle at `c` with radius `r` touch the ribbon (centreline segments, widened by their half widths)? */
function touches(line: Line, c: Pt, r: number): boolean {
  const { pts, widths } = line;
  if (pts.length === 1) return dist(c, pts[0] as Pt) < r + (widths[0] ?? 0) / 2;
  for (let i = 1; i < pts.length; i++) if (segDist(c, pts[i - 1] as Pt, pts[i] as Pt) < r + Math.max(widths[i - 1] ?? 0, widths[i] ?? 0) / 2) return true;
  return false;
}

/** The smallest box (px) a tree is drawn in; below it, or for a box that is not finite, `layoutTree` returns no marks. */
export const MIN_BOX = { width: 240, height: 120 } as const;
const EMPTY = (width: number, height: number): TreeLayout => ({ width, height, ribbons: [], twigs: [], episodes: [], tips: [], handBacks: [], root: { at: { x: 0, y: 0 }, r: 0 }, blocks: [], labels: [], hits: [], paths: {} });

export function layoutTree(g: SessionGraph, opts: TreeOptions): TreeLayout {
  const { width, height, k = 1.45, labels = true, reserve = [] } = opts;
  // Too small to draw, or not a finite box (an infinite one would grow the trunk forever): the empty tree.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < MIN_BOX.width || height < MIN_BOX.height) return EMPTY(width, height);
  const z = Math.min(1, height / DESIGN_H);
  const W = width / z;
  const H = height / z;
  const m = treeModel(g);
  const U0 = ROOT_R + 10;
  // Room on the right for the tip's text block (about 210px on the canvas).
  const blockW = Math.max(0, ...m.trunk.block.map((l) => labelBox({ key: '', x: 0, y: 0, anchor: 'start', ...l }).x1));
  // As tree.mjs: 28 units on the left (root, flare), the label room on the right (54 units without labels, which puts
  // the phone silhouette's tips on the canvas's phone frame).
  const along = Math.max(1, W - 28 - (labels ? Math.max(210, blockW + 26) / z : NO_LABEL_ROOM));
  // Along-axis: one unit per record, +9 after a spawn, +4 on return to main, packed closer below MIN_UNIT. Each part
  // ends 2 units after its last record; that tail may reach TAIL units into the label room (one unit of it on the
  // canvas), so a short session with huge units still ends inside the box.
  const uMax = U0 + along + TAIL;
  const gaps = m.records.reduce((a, r) => a + r.gap, 0);
  const n = Math.max(1, m.records.length);
  let unit = 1;
  const U = new Map<number, number>();
  /** Lays the records along `a` units. */
  const axis = (a: number) => {
    let w = 1;
    unit = Math.min(a / (gaps + n), (a + TAIL) / (gaps + n + 1));
    if (unit < MIN_UNIT) {
      w = Math.max(0.15, (a / MIN_UNIT - gaps - 2) / n);
      unit = a / (gaps + n * w + 2);
    }
    let acc = 0;
    m.records.forEach((r, i) => { acc += r.gap + (i ? w : 0); U.set(r.seq, U0 + acc * unit); });
  };
  axis(along);
  const uOf = (seq: number) => U.get(seq) ?? U0;
  const callsOf = (twigs: TwigSrc[]) => twigs.filter((t) => t.kind !== 'thinking').length;
  const partCalls = (p: PartSrc) => p.episodes.reduce((a, e) => a + e.calls, 0) + callsOf(p.twigs);
  // Leonardo's rule, with k lowered for very large sessions so the trunk stays at most MAX_W thick (same √ proportions).
  const total = [m.trunk, ...m.limbs].reduce((a, p) => a + partCalls(p) + 1, 0);
  const kk = Math.min(k, MAX_W / Math.sqrt(total));
  const W0 = (c: number) => kk * Math.sqrt(Math.max(c, 1));
  const ahead = (p: PartSrc, u: number) => p.episodes.reduce((a, e) => a + e.calls * fall(u, uOf(e.first)), 0) + p.twigs.reduce((a, t) => a + (t.kind === 'thinking' ? 0 : fall(u, uOf(t.seq))), 0);
  const noLimbs = m.limbs.length === 0;
  // A side stacks its limbs (decreasing amplitude) when there are more than four limbs or two limbs on it run at once.
  const sideOf = (i: number) => (i % 2 === 0 ? -1 : 1);
  const overlap = (a: PartSrc, b: PartSrc) => a.from <= b.last && b.from <= a.last;
  const stacked = [0, 1].map((s) => m.limbs.length > 4 || m.limbs.some((a, i) => i % 2 === s && m.limbs.some((b, j) => j > i && j % 2 === s && overlap(a, b))));

  let vs = 1;
  let gs = 1;
  let out = grow();
  // One lane: no limbs fill the height, so the branches grow longer (up to 2×) until the tree, with its labels, uses
  // about FILL of it (only the branches scale, so a few passes converge on it).
  for (let i = 0; i < (noLimbs ? 3 : 0); i++) {
    const [top, bottom] = out.extent;
    const next = clamp((gs * FILL * (H - 2 * PAD)) / Math.max(1, bottom - top), 1, 2);
    if (Math.abs(next - gs) < 0.02) break;
    gs = next;
    out = grow();
  }
  // One lane: a branch shortened to end before the trunk's tip makes the records pack closer, to give it the room.
  for (let i = 0, a = along; i < (noLimbs ? 2 : 0) && out.short > 1; i++) {
    a = Math.max(1, a - out.short);
    axis(a);
    out = grow();
  }
  for (let i = 0; i < 4; i++) {
    const [top, bottom] = out.extent;
    if (bottom - top <= H - 2 * PAD) break;
    vs *= ((H - 2 * PAD) / (bottom - top)) * 0.98;
    out = grow();
  }
  const [top, bottom] = out.extent;
  // Spare height splits about 1:2 above:below with limbs, so the tree sits a little high in its box as on the canvas
  // (0.38 puts verify-fail-fix's trunk line on the canvas's y 300); evenly for one lane.
  const MID = PAD - top + Math.max(0, H - 2 * PAD - (bottom - top)) * (noLimbs ? 0.5 : 0.38);
  const S = (p: Pt): Pt => ({ x: r1(p.x * z), y: r1((MID + p.y) * z) });
  const ribbons: Ribbon[] = out.parts.map((p) => {
    const line = p.line.pts.map(S);
    const widths = p.line.widths.map((x) => r1(x * z));
    const core = p.kind === 'trunk' ? { core: p.line.widths.map((x, i) => r1((x - rootFlare(p.line.pts[i]?.x ?? 0)) * z)) } : {};
    return { id: p.id, kind: p.kind, laneId: p.laneId, ...(p.episodeId ? { episodeId: p.episodeId } : {}), d: ribbonPath(line, widths), line, widths, ...core };
  });
  const twigs: Twig[] = out.twigs.map(({ s, ...t }) => ({ ...t, base: S(t.base), tip: S(t.tip), scale: Math.round(z * s * 100) / 100 }));
  const episodes: EpisodeMark[] = out.episodes.map((e) => ({ ...e, at: S(e.at), r: r1(e.r * z) }));
  const tips: TipMark[] = out.tips.map((t) => ({ ...t, at: S(t.at), r: r1(t.r * z) }));
  const handBacks: HandBack[] = out.handBacks.map((b) => {
    const [from, c, to] = [S(b.from), S(b.c), S(b.to)];
    return { laneId: b.laneId, d: `M${from.x} ${from.y}Q${c.x} ${c.y} ${to.x} ${to.y}`, from, c, to };
  });
  const root = { at: S({ x: ROOT_R, y: 0 }), r: r1(ROOT_R * z) };
  const waits = out.waits.map((x) => {
    const at = S({ x: x.x, y: x.edge });
    return { laneId: x.laneId, text: x.text, x: at.x, above: r1(at.y - 2), below: r1(root.at.y + 24), preferBelow: x.below };
  });
  const input = { width, height, ribbons, twigs, episodes, tips, handBacks, root, rootAt: m.rootAt, waits, headings: out.headings, reserve, blocks: [m.trunk, ...m.limbs].map((p) => ({ laneId: p.tipLane, lines: p.block })) };
  let text = labels ? placeLabels(input) : { labels: [], blocks: [], stuck: [] };
  // A lane block that found no free spot goes before the numbers on a second pass (they have more places to go).
  if (text.stuck.length) text = placeLabels(input, new Set(text.stuck));
  const byPart = new Map(ribbons.map((r) => [r.id, r]));
  const episodeHit = (id: string, points: Pt[], pad = 0, tipLane?: string): HitTarget => ({ id, kind: 'episode', episodeId: id, points, ...(pad ? { pad } : {}), ...(tipLane ? { tipLane } : {}) });
  /** A text box hit as the segment through its vertical middle, padded by half its height; inset by that much at
   * both ends (numbers and lane blocks alike), so its hit area does not reach far past the text. */
  const boxHit = (id: string, b: Box, tipLane?: string, inset = false) => {
    const y = r1((b.y0 + b.y1) / 2);
    const pad = (b.y1 - b.y0) / 2;
    const d = inset ? Math.min(pad, (b.x1 - b.x0) / 2) : 0;
    return episodeHit(id, [{ x: b.x0 + d, y }, { x: b.x1 - d, y }], pad, tipLane);
  };
  // A tip without an episode of its own (an errored lane's ◉, the trunk's end dot) hits its lane's last episode, and
  // its tooltip is the lane's verdict; the lane block beside a tip hits the same episode.
  const tipOf = (laneId: string) => { const t = tips.find((x) => x.laneId === laneId); const id = t?.episodeId ?? m.lastEpisode[laneId]; return id ? { id, ...(t && !t.episodeId ? { lane: t.laneId } : {}) } : undefined; };
  const hits: HitTarget[] = [
    ...episodes.map((e) => episodeHit(e.episodeId, [...(byPart.get(`branch:${e.episodeId}`)?.line ?? []), e.at])),
    ...episodes.map((e) => episodeHit(e.episodeId, [e.at], e.r)),
    ...tips.flatMap((t) => { const o = tipOf(t.laneId); return o ? [episodeHit(o.id, [t.at], t.r, o.lane)] : []; }),
    ...text.labels.filter((l) => l.key.startsWith('num:')).map((l) => boxHit(l.key.slice(4), labelBox(l), undefined, true)),
    ...text.blocks.flatMap((b) => { const o = tipOf(b.laneId); return o ? [boxHit(o.id, b.box, o.lane, true)] : []; }),
    // A twig of an episode the tree draws no path to (a delegate's thinking on the trunk) picks nothing.
    ...twigs.filter((t) => out.paths[t.episodeId]).map((t) => {
      const a = rad(t.angle);
      const far = { x: r1(t.tip.x + 11 * t.scale * Math.cos(a)), y: r1(t.tip.y + 11 * t.scale * Math.sin(a)) };
      return { id: t.stepId, kind: 'step' as const, episodeId: t.episodeId, points: t.mark === 'leaf' ? [t.base, t.tip, far] : [t.base, t.tip] };
    }),
  ];
  return { width, height, ribbons, twigs, episodes, tips, handBacks, root, blocks: text.blocks, labels: text.labels, hits, paths: out.paths };

  /** Every part's centreline, widths, twigs and marks in design units around a trunk at v = 0. */
  function grow() {
    const groups: { part: Part; branches: Branch[]; twigs: TwigD[]; src: PartSrc; side: number; to: (u: number) => PathPart[]; at: (x: number) => { pt: Pt; w: number } }[] = [];
    const paths: Record<string, PathPart[]> = {};
    const branchLen = (e: EpisodeSrc) => Math.min(Math.max(22, (uOf(e.last) - uOf(e.first) + unit) * 1.55 * gs), 150 * gs * vs);
    // One lane: the trunk runs on past its last branch.
    const lastEp = noLimbs ? m.trunk.episodes.at(-1) : undefined;
    const trunkEnd = Math.min(uMax, Math.max(uOf(m.trunk.last) + 2 * unit, lastEp ? uOf(lastEp.first) + branchLen(lastEp) * 0.9 + 16 : 0));
    let short = 0;
    const arch = (u: number) => -10 * vs * Math.sin((Math.PI * 0.9 * Math.max(0, u - U0)) / Math.max(1, trunkEnd - U0));
    const trunkCalls = (u: number) => m.limbs.reduce((a, l) => a + (partCalls(l) + 1) * fall(u, uOf(l.from)), 0) + ahead(m.trunk, u);
    const trunkAt = (x: number) => ({ pt: { x, y: arch(x) }, w: W0(trunkCalls(x)) + rootFlare(x) });
    const trunk = line(ROOT_R, trunkEnd, trunkAt);
    const trunkTo = (u: number): PathPart[] => [{ part: 'trunk', to: pointAt(trunk, u).i }];
    groups.push({ part: { id: 'trunk', kind: 'trunk', laneId: m.trunk.laneId, line: trunk }, branches: [], twigs: [], src: m.trunk, side: -1, to: trunkTo, at: trunkAt });
    // Limbs: first up, then down, alternating; a stacked side lowers the amplitude of each later limb.
    const perSide = [0, 0];
    m.limbs.forEach((l, i) => {
      const side = sideOf(i);
      const j = perSide[i % 2] ?? 0;
      perSide[i % 2] = j + 1;
      const nSide = Math.ceil((m.limbs.length - (i % 2)) / 2);
      const full = (side < 0 ? 128 : 112) * vs;
      const amp = full * (stacked[i % 2] && nSide > 1 ? 1 - (0.5 * j) / (nSide - 1) : 1);
      const uF = uOf(l.from);
      const uE = Math.min(uMax, Math.max(uOf(l.last) + 2 * unit, uF + 4));
      const v0 = arch(uF);
      const limbAt = (x: number) => {
        const t = (x - uF) / RISE;
        const t2 = Math.max(0, (x - uF - RISE) / Math.max(1, uE - uF - RISE));
        // The swing after the rise is 34 at full amplitude and shrinks with stacking.
        const v = t < 1 ? amp * (1 - (1 - t) ** 2.1) : amp + 34 * (amp / full) * vs * Math.sin(t2 * Math.PI * 0.62);
        return { pt: { x, y: side * v + v0 * Math.max(0, 1 - (x - uF) / 120) }, w: W0(ahead(l, x)) };
      };
      const ln = line(uF, Math.max(uE, uF + 0.5), limbAt);
      const id = `limb:${l.laneId}`;
      groups.push({ part: { id, kind: 'limb', laneId: l.laneId, line: ln }, branches: [], twigs: [], src: l, side, to: (u) => [...trunkTo(uF), { part: id, to: pointAt(ln, u).i }], at: limbAt });
    });
    for (const gr of groups) grown(gr);
    const branches = groups.flatMap((gr) => gr.branches);
    const allTwigs = () => groups.flatMap((gr) => [...gr.branches.flatMap((b) => b.twigs), ...gr.twigs]);
    // Each part's end grows (2 units at a time, up to the along-axis end) until its tip clears the glyphs on it.
    for (const gr of groups) {
      const tipR = gr.src.tip.kind === 'answer' ? 7 : 2.5;
      const ln = gr.part.line;
      const keep = ln.pts.length;
      const clear = () => gr.branches.every((b) => dist(b.at, ln.pts.at(-1) as Pt) >= tipR + GLYPH_R + 6);
      while (!clear() && (ln.pts.at(-1) as Pt).x + 2 <= uMax) push(ln, gr.at((ln.pts.at(-1) as Pt).x + 2));
      if (!clear()) { ln.pts.length = keep; ln.widths.length = keep; }
    }
    // A trunk ending in a dot runs on until the dot is DOT_CLEAR units right of its last glyph, so it does not crowd
    // it; it may reach into the label room as far as still leaves its own block ("Session ends") room on the right.
    const tg = groups[0];
    if (tg && tg.src.tip.kind === 'end' && tg.branches.length) {
      const ln = tg.part.line;
      const most = Math.max(uMax, W - PAD - (labels ? (blockW + 24) / z : 12));
      let last = -Infinity;
      for (const b of tg.branches) last = Math.max(last, b.at.x);
      while ((ln.pts.at(-1) as Pt).x < last + DOT_CLEAR && (ln.pts.at(-1) as Pt).x + 2 <= most) push(ln, tg.at((ln.pts.at(-1) as Pt).x + 2));
    }
    // A glyph that lands on another ribbon, glyph, tip or ✕ (or whose branch runs over another glyph) grows its branch
    // 4 units at a time, at most 40; failing that, the branch tries the other side (up to 60 longer there), then shorter.
    const tipPts = groups.map((gr) => ({ at: gr.part.line.pts.at(-1) as Pt, r: gr.src.tip.kind === 'answer' ? 7 : 2.5 }));
    const clash = (b: Branch) => {
      let c = 0;
      const xs = allTwigs().filter((t) => t.mark === 'x');
      for (const gr of groups) {
        if (touches(gr.part.line, b.at, GLYPH_R + 2.5)) c++;
        for (const o of gr.branches) {
          if (o === b) continue;
          if (touches(o.part.line, b.at, GLYPH_R + 2.5) || touches(b.part.line, o.at, GLYPH_R + 2.5)) c++;
          if (dist(o.at, b.at) < 2 * (GLYPH_R + 2.5)) c++;
          for (const t of b.twigs) if (t.mark === 'x' && dist(t.tip, o.at) < GLYPH_R + 6) c++;
        }
      }
      for (const t of tipPts) if (dist(t.at, b.at) < t.r + GLYPH_R + 6) c++;
      for (const t of xs) if (!b.twigs.includes(t) && dist(t.tip, b.at) < GLYPH_R + 6) c++;
      return c;
    };
    for (const b of branches) {
      if (clash(b) === 0) continue;
      const len0 = b.len;
      const side0 = b.side;
      let best = { len: len0, side: side0, c: clash(b) };
      // Longer, then on the other side, then (last) shorter, down to 12 units.
      const longer = Array.from({ length: 10 }, (_, i) => 4 * (i + 1));
      const other = Array.from({ length: 16 }, (_, i) => 4 * i);
      const shorter = Array.from({ length: Math.max(0, Math.floor((len0 - 12) / 4)) }, (_, i) => -4 * (i + 1));
      const tries: [number, number][] = [...longer.map((d): [number, number] => [side0, d]), ...other.map((d): [number, number] => [-side0, d]), ...shorter.flatMap((d): [number, number][] => [[side0, d], [-side0, d]])];
      for (const [side, d] of tries) {
        if (best.c === 0) break;
        b.side = side;
        build(b, len0 + d);
        const c = clash(b);
        if (c < best.c) best = { len: len0 + d, side, c };
      }
      b.side = best.side;
      build(b, best.len);
    }
    // Tips, hand-backs and waits.
    const tps: TipMark[] = [];
    const backs: { laneId: string; from: Pt; c: Pt; to: Pt }[] = [];
    const waitSrc: { laneId: string; text: string; x: number; edge: number; below: boolean }[] = [];
    for (const gr of groups) {
      const p = gr.src;
      const tip = gr.part.line.pts.at(-1) as Pt;
      tps.push({ laneId: p.tipLane, kind: p.tip.kind, tone: p.tip.tone, at: { x: tip.x, y: tip.y }, r: p.tip.kind === 'answer' ? 7 : 2.5, ...(p.tip.episodeId ? { episodeId: p.tip.episodeId } : {}) });
      if (p.tip.episodeId) paths[p.tip.episodeId] = gr.to(Infinity);
      if (p === m.trunk || p.resume === undefined) continue;
      const to = pointAt(trunk, uOf(p.resume));
      const from = { x: tip.x, y: tip.y - gr.side * 10 };
      backs.push({ laneId: p.laneId, from, c: { x: to.x, y: from.y }, to: { x: to.x, y: to.y } });
      if (p.wait) {
        // "Below" hangs from the flat baseline (tree.mjs `proj({u, v: 0})`); "above" sits on the trunk's upper edge
        // under the text.
        const x = pointAt(trunk, (uOf(p.from) + to.x) / 2).x;
        const say = waitSrc.length ? p.wait : `Main agent waits, ${p.wait}`;
        const half = (textWidth(say, 12, 400) / 2 + 2) / z;
        let edge = Infinity;
        trunk.pts.forEach((q, i) => { if (Math.abs(q.x - x) <= half) edge = Math.min(edge, q.y - (trunk.widths[i] ?? 0) / 2); });
        waitSrc.push({ laneId: p.laneId, text: say, x, edge: Number.isFinite(edge) ? edge : 0, below: gr.side < 0 });
      }
    }
    const parts = groups.flatMap((gr) => [gr.part, ...gr.branches.map((b) => b.part)]);
    const tw = groups.flatMap((gr) => [...gr.branches.flatMap((b) => b.twigs), ...gr.twigs]);
    const eps: EpisodeMark[] = branches.map((b) => ({ episodeId: b.e.id, laneId: b.laneId, n: b.e.n, kind: b.e.glyph, at: b.at, r: GLYPH_R }));
    const headings: Record<string, number> = {};
    for (const b of branches) {
      headings[b.e.id] = b.h;
      paths[b.e.id] = [...b.base, { part: b.part.id, to: N }];
      Object.assign(paths, b.steps);
    }

    // The vertical extent, with label room: a number reaches about 18px from its glyph; a block runs from 24px above
    // its tip to 38px below. A reserved zone on the top or bottom edge pushes whatever lies under it inward.
    const rz = reserve.map((b) => ({ x0: b.x0 / z, x1: b.x1 / z, top: b.y0 <= 0 ? b.y1 / z : 0, bottom: b.y1 >= height ? (height - b.y0) / z : 0 }));
    let lo = Infinity;
    let hi = -Infinity;
    const span = (y: number, r: number, x0: number, x1 = x0) => {
      let up = 0;
      let down = 0;
      for (const b of rz) if (x0 < b.x1 && b.x0 < x1) { up = Math.max(up, b.top); down = Math.max(down, b.bottom); }
      lo = Math.min(lo, y - r - up);
      hi = Math.max(hi, y + r + down);
    };
    for (const p of parts) p.line.pts.forEach((q, i) => { const r = (p.line.widths[i] ?? 0) / 2; span(q.y, r, q.x - r, q.x + r); });
    for (const t of tw) span(t.tip.y, 6, t.tip.x - 12, t.tip.x + 12);
    for (const e of eps) span(e.at.y, labels ? 18 / z : e.r + 2.5, e.at.x - 18 / z, e.at.x + 18 / z);
    for (const t of tps) {
      span(t.at.y, t.r + 3, t.at.x - t.r - 3, t.at.x + t.r + 3);
      if (labels) { span(t.at.y - 24 / z, 0, t.at.x, t.at.x + 220 / z); span(t.at.y + 38 / z, 0, t.at.x, t.at.x + 220 / z); }
    }
    if (labels) span(46 / z, 0, 0, 60 / z);
    return { parts, twigs: tw, episodes: eps, tips: tps, handBacks: backs, waits: waitSrc, headings, paths, extent: [lo, hi] as const, short };

    function line(from: number, to: number, at: (x: number) => { pt: Pt; w: number }): Line {
      const ln: Line = { pts: [], widths: [] };
      for (let u = from; u < to + 2; u += 2) push(ln, at(Math.min(u, to)));
      return ln;
    }
    function push(ln: Line, q: { pt: Pt; w: number }) {
      ln.pts.push(q.pt);
      ln.widths.push(q.w);
    }
    /** A part's branches (alternating sides) and its own twigs. */
    function grown(gr: (typeof groups)[number]) {
      const p = gr.src;
      // On the trunk, a branch that would grow into a limb spawned beside it takes the other side.
      let next = -gr.side;
      for (const e of p.episodes) {
        const u0 = uOf(e.first);
        const near = (s: number) => p === m.trunk && m.limbs.some((l, i) => sideOf(i) === s && uOf(l.from) > u0 - 16 && uOf(l.from) < u0 + branchLen(e) * 0.8);
        const s = near(next) && !near(-next) ? -next : next;
        const b = { e, side: s, laneId: p.laneId, parent: gr.part.line, base: gr.to(u0) } as Branch;
        build(b, branchLen(e));
        gr.branches.push(b);
        next = -s;
      }
      let side = 1;
      for (const t of p.twigs) {
        side = -side;
        gr.twigs.push(twig(t, lerpAt(gr.part.line, uOf(t.seq)), side, gr.part.id, 1));
        paths[t.stepId] = gr.to(uOf(t.seq));
      }
    }
    /** An episode's branch: heading ±58° bending to ±10°, pulled 16% toward vertical-up; width by its calls ahead. */
    function build(b: Branch, len0: number) {
      const { e, side: s, parent } = b;
      const u0 = uOf(e.first);
      const at = pointAt(parent, u0);
      const slot = uOf(e.last) - u0 + unit;
      const h0 = at.a + s * rad(58);
      const h1 = at.a + s * rad(10) + (rad(-90) - (at.a + s * rad(10))) * 0.16;
      const shape = (len: number) => {
        const pts: (Pt & { h: number })[] = [{ x: at.x, y: at.y, h: h0 }];
        for (let j = 1; j <= N; j++) {
          const h = h0 + (h1 - h0) * (j / N);
          const q = pts[j - 1] as Pt;
          pts.push({ x: q.x + (len / N) * Math.cos(h), y: q.y + (len / N) * Math.sin(h), h });
        }
        return pts;
      };
      let len = len0;
      let pts = shape(len);
      // One lane: a branch's glyph stays 12 units short of the trunk's end.
      const dx = (pts[N] as Pt).x - at.x;
      if (noLimbs && dx > 0 && at.x + dx > trunkEnd - 12) {
        short = Math.max(short, at.x + dx - (trunkEnd - 12));
        len *= Math.max(0.2, (trunkEnd - 12 - at.x) / dx);
        pts = shape(len);
      }
      const fOf = (t: TwigSrc) => clamp(((uOf(t.seq) - u0 + 0.6 * unit) / slot) * 0.92, 0, 1);
      const calls = e.twigs.filter((t) => t.kind !== 'thinking').map(fOf);
      const id = `branch:${e.id}`;
      const end = pts[N] as Pt & { h: number };
      const glyph = { x: end.x, y: end.y };
      // A failed call's ✕ keeps clear of its glyph: on the other side, else further down the branch.
      const fmax = Math.max(0, 1 - (GLYPH_R + 2.5 + 16) / len);
      const sides: number[] = [];
      const fs = e.twigs.map((t, i) => {
        let side = i % 2 === 0 ? -1 : 1;
        let f = fOf(t);
        if (t.kind === 'failed') {
          const xTip = (sd: number, ff: number) => { const q = alongBranch(pts, ff); const a = q.h + sd * rad(52); return { x: q.x + 16 * Math.cos(a), y: q.y + 16 * Math.sin(a) }; };
          if (dist(xTip(side, f), glyph) < GLYPH_R + 6 + 1) side = -side;
          if (dist(xTip(side, f), glyph) < GLYPH_R + 6 + 1) f = Math.min(f, fmax);
        }
        sides.push(side);
        return f;
      });
      // Dense branches: the marks shrink with the spacing of same-side twigs (5.5 units at full size, half at most).
      let gap = Infinity;
      for (let i = 2; i < fs.length; i++) if (sides[i] === sides[i - 2]) gap = Math.min(gap, Math.abs((fs[i] as number) - (fs[i - 2] as number)) * len);
      const sc = clamp(gap / 5.5, 0.5, 1);
      b.len = len;
      b.part = { id, kind: 'branch', laneId: b.laneId, episodeId: e.id, line: { pts, widths: pts.map((_, i) => W0(calls.filter((f) => f >= i / N - 0.02).length)) } };
      b.twigs = e.twigs.map((t, i) => twig(t, alongBranch(pts, fs[i] as number), sides[i] as number, id, sc));
      b.steps = Object.fromEntries(e.twigs.map((t, i) => [t.stepId, [...b.base, { part: id, to: Math.min(N, Math.ceil((fs[i] as number) * N)) }]]));
      b.at = glyph;
      b.h = end.h;
    }
    function twig(t: TwigSrc, q: Pt & { h: number }, side: number, part: string, s: number): TwigD {
      const a = q.h + side * rad(t.kind === 'thinking' ? 70 : 52);
      const l = (t.kind === 'thinking' ? 5 : t.kind === 'failed' ? 16 : 7) * s;
      const tip = { x: q.x + l * Math.cos(a), y: q.y + l * Math.sin(a) };
      const mark = t.kind === 'thinking' ? 'none' : t.kind === 'failed' ? 'x' : t.kind === 'read' ? 'bud' : 'leaf';
      return { stepId: t.stepId, episodeId: t.episodeId, part, kind: t.kind, mark, base: { x: q.x, y: q.y }, tip, angle: r1((a * 180) / Math.PI), s };
    }
  }
}

/** A branch's centreline interpolated at fraction `f` of its length (its points are evenly spaced). */
function alongBranch(pts: readonly (Pt & { h: number })[], f: number): Pt & { h: number } {
  const x = clamp(f, 0, 1) * N;
  const j = Math.min(N - 1, Math.floor(x));
  const a = pts[j] as Pt & { h: number };
  const b = pts[j + 1] as Pt & { h: number };
  const t = x - j;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: a.h + (b.h - a.h) * t };
}

