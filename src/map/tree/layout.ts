// The tree layout engine (docs/design/v7/PROMPT.md §5.2–5.3; the algorithm of docs/design/v7/tree.mjs, generalised for
// any session). Pure and deterministic: the same graph and box always give the same tree.
// Geometry is computed in a design box 520 units tall (the canvas's hero tree); a shorter box (the phone silhouette)
// scales the whole drawing down, like the canvas does.
import type { SessionGraph } from '../../../shared/session/types';
import { labelBox, placeLabels } from './labels';
import { treeModel, type EpisodeSrc, type PartSrc, type TwigSrc } from './model';
import type { EpisodeMark, HandBack, HitTarget, PathPart, Pt, Ribbon, TipMark, TreeLayout, TreeOptions, Twig } from './types';

const DESIGN_H = 520;
const ROOT_R = 5.5;
/** The smallest along-axis step per record (design units) before records are packed closer. */
const MIN_UNIT = 1.2;
const RISE = 96;
/** The thickest the trunk gets before its root flare (design units). */
const MAX_W = 16;
const PAD = 4;
const rad = (d: number) => (d * Math.PI) / 180;
const r1 = (v: number) => Math.round(v * 10) / 10;
const fall = (u: number, b: number, d = 10) => Math.min(1, Math.max(0, (b + d - u) / d));
const angleOf = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);

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
/** The point of a centreline at along-position `u`, its index and heading. */
function pointAt(line: Line, u: number) {
  const i = Math.max(1, line.pts.findIndex((p) => p.x >= u));
  const p = (line.pts[i] ?? line.pts.at(-1)) as Pt;
  const q = line.pts[Math.min(i, line.pts.length - 1) - 1] ?? p;
  return { x: p.x, y: p.y, a: angleOf(q, p), i: line.pts[i] ? i : line.pts.length - 1 };
}

export function layoutTree(g: SessionGraph, opts: TreeOptions): TreeLayout {
  const { width, height, k = 1.45, labels = true } = opts;
  const z = Math.min(1, height / DESIGN_H);
  const W = width / z;
  const H = height / z;
  const m = treeModel(g);
  const U0 = ROOT_R + 10;
  // Room on the right for the tip's text block (about 210px on the canvas).
  const blockW = Math.max(0, ...m.trunk.block.map((l) => labelBox({ key: '', x: 0, y: 0, anchor: 'start', ...l }).x1));
  // As tree.mjs: 28 units on the left (root, flare), the label room on the right.
  const along = W - 28 - (labels ? Math.max(210, blockW + 26) / z : 48);
  // Along-axis: one unit per record, +9 after a spawn, +4 on return to main; packed closer below MIN_UNIT.
  const gaps = m.records.reduce((a, r) => a + r.gap, 0);
  const n = Math.max(1, m.records.length);
  let w = 1;
  let unit = along / (gaps + n);
  if (unit < MIN_UNIT) {
    w = Math.max(0.15, (along / MIN_UNIT - gaps) / n);
    unit = along / (gaps + n * w);
  }
  const U = new Map<number, number>();
  let acc = 0;
  m.records.forEach((r, i) => { acc += r.gap + (i ? w : 0); U.set(r.seq, U0 + acc * unit); });
  const uOf = (seq: number) => U.get(seq) ?? U0;
  const callsOf = (twigs: TwigSrc[]) => twigs.filter((t) => t.kind !== 'thinking').length;
  const partCalls = (p: PartSrc) => p.episodes.reduce((a, e) => a + e.calls, 0) + callsOf(p.twigs);
  // Leonardo's rule, with k lowered for very large sessions so the trunk stays at most MAX_W thick (same √ proportions).
  const total = [m.trunk, ...m.limbs].reduce((a, p) => a + partCalls(p) + 1, 0);
  const kk = Math.min(k, MAX_W / Math.sqrt(total));
  const W0 = (c: number) => kk * Math.sqrt(Math.max(c, 1));
  const ahead = (p: PartSrc, u: number) => p.episodes.reduce((a, e) => a + e.calls * fall(u, uOf(e.first)), 0) + p.twigs.reduce((a, t) => a + (t.kind === 'thinking' ? 0 : fall(u, uOf(t.seq))), 0);

  let vs = 1;
  let out = grow();
  for (let i = 0; i < 4; i++) {
    const [top, bottom] = out.extent;
    if (bottom - top <= H - 2 * PAD) break;
    vs *= ((H - 2 * PAD) / (bottom - top)) * 0.98;
    out = grow();
  }
  const [top, bottom] = out.extent;
  // Spare height splits about 1:2 above:below, so the tree sits a little high in its box, as on the canvas.
  const MID = PAD - top + Math.max(0, H - 2 * PAD - (bottom - top)) * 0.35;
  const S = (p: Pt): Pt => ({ x: r1(p.x * z), y: r1((MID + p.y) * z) });
  const ribbons: Ribbon[] = out.parts.map((p) => {
    const line = p.line.pts.map(S);
    const widths = p.line.widths.map((x) => r1(x * z));
    return { id: p.id, kind: p.kind, laneId: p.laneId, ...(p.episodeId ? { episodeId: p.episodeId } : {}), d: ribbonPath(line, widths), line, widths };
  });
  const twigs: Twig[] = out.twigs.map((t) => ({ ...t, base: S(t.base), tip: S(t.tip), scale: r1(z * 100) / 100 }));
  const episodes: EpisodeMark[] = out.episodes.map((e) => ({ ...e, at: S(e.at), r: r1(e.r * z) }));
  const tips: TipMark[] = out.tips.map((t) => ({ ...t, at: S(t.at), r: r1(t.r * z) }));
  const handBacks: HandBack[] = out.handBacks.map((b) => {
    const [from, c, to] = [S(b.from), S(b.c), S(b.to)];
    return { laneId: b.laneId, d: `M${from.x} ${from.y}Q${c.x} ${c.y} ${to.x} ${to.y}`, from, to };
  });
  const root = { at: S({ x: ROOT_R, y: 0 }), r: r1(ROOT_R * z) };
  const byPart = new Map(ribbons.map((r) => [r.id, r]));
  const hits: HitTarget[] = [
    ...episodes.map((e) => ({ id: e.episodeId, kind: 'episode' as const, episodeId: e.episodeId, points: [...(byPart.get(`branch:${e.episodeId}`)?.line ?? []), e.at] })),
    ...twigs.map((t) => ({ id: t.stepId, kind: 'step' as const, episodeId: t.episodeId, points: [t.base, t.tip] })),
  ];
  const text = labels ? placeLabels({ width, height, ribbons, twigs, episodes, tips, root, rootAt: m.rootAt, waits: out.waits.map((x) => ({ ...x, at: S(x.at) })), headings: out.headings, blocks: [m.trunk, ...m.limbs].map((p) => ({ laneId: p.tipLane, lines: p.block })) }) : { labels: [], blocks: [] };
  return { width, height, ribbons, twigs, episodes, tips, handBacks, root, blocks: text.blocks, labels: text.labels, hits, paths: out.paths };

  /** Every part's centreline, widths, twigs and marks in design units around a trunk at v = 0. */
  function grow() {
    const parts: (Pick<Ribbon, 'id' | 'kind' | 'laneId' | 'episodeId'> & { line: Line })[] = [];
    const tw: Omit<Twig, 'scale'>[] = [];
    const eps: EpisodeMark[] = [];
    const tps: TipMark[] = [];
    const backs: { laneId: string; from: Pt; c: Pt; to: Pt }[] = [];
    const waits: { laneId: string; text: string; at: Pt; below: boolean }[] = [];
    const headings: Record<string, number> = {};
    const paths: Record<string, PathPart[]> = {};
    const branchLen = (e: EpisodeSrc) => Math.min(Math.max(22, (uOf(e.last) - uOf(e.first) + unit) * 1.55), 150 * vs);
    // The trunk's tip stays clear of a short last branch (its glyph would sit on the tip mark).
    const tipU = (p: PartSrc) => Math.max(uOf(p.last) + 2 * unit, ...(p === m.trunk ? p.episodes.slice(-1).filter((e) => branchLen(e) < 40).map((e) => uOf(e.first) + branchLen(e) + 16) : []));
    const trunkEnd = Math.max(tipU(m.trunk), ...m.limbs.map((l) => uOf(l.from) + 2 * unit));
    const arch = (u: number) => -10 * vs * Math.sin((Math.PI * 0.9 * Math.max(0, u - U0)) / Math.max(1, trunkEnd - U0));
    const trunkCalls = (u: number) => m.limbs.reduce((a, l) => a + (partCalls(l) + 1) * fall(u, uOf(l.from)), 0) + ahead(m.trunk, u);
    const trunk: Line = { pts: [], widths: [] };
    for (let u = ROOT_R; u < trunkEnd + 2; u += 2) {
      const x = Math.min(u, trunkEnd);
      trunk.pts.push({ x, y: arch(x) });
      trunk.widths.push(W0(trunkCalls(x)) + 10 * Math.exp(-(x - ROOT_R) / 16));
    }
    parts.push({ id: 'trunk', kind: 'trunk', laneId: m.trunk.laneId, line: trunk });
    const trunkTo = (u: number): PathPart[] => [{ part: 'trunk', to: pointAt(trunk, u).i }];
    grown(m.trunk, trunk, -1, trunkTo);
    // Limbs: first up, then down, alternating; more than four stack per side with decreasing amplitude.
    const perSide = [0, 0];
    m.limbs.forEach((l, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const j = perSide[i % 2] ?? 0;
      perSide[i % 2] = j + 1;
      const nSide = Math.ceil((m.limbs.length - (i % 2)) / 2);
      const amp = (side < 0 ? 128 : 112) * vs * (m.limbs.length > 4 ? 1 - (0.5 * j) / Math.max(1, nSide - 1) : 1);
      const uF = uOf(l.from);
      const uE = Math.max(tipU(l), uF + 4);
      const v0 = arch(uF);
      const line: Line = { pts: [], widths: [] };
      for (let u = uF; u < uE + 2; u += 2) {
        const x = Math.min(u, uE);
        const t = (x - uF) / RISE;
        const t2 = Math.max(0, (x - uF - RISE) / Math.max(1, uE - uF - RISE));
        const v = t < 1 ? amp * (1 - (1 - t) ** 2.1) : amp + 34 * (amp / 128) * Math.sin(t2 * Math.PI * 0.62);
        line.pts.push({ x, y: side * v + v0 * Math.max(0, 1 - (x - uF) / 120) });
        line.widths.push(W0(ahead(l, x)));
      }
      parts.push({ id: `limb:${l.laneId}`, kind: 'limb', laneId: l.laneId, line });
      const limbTo = (u: number): PathPart[] => [...trunkTo(uF), { part: `limb:${l.laneId}`, to: pointAt(line, u).i }];
      const tip = grown(l, line, side, limbTo);
      if (l.resume !== undefined) {
        const to = pointAt(trunk, uOf(l.resume));
        const from = { x: tip.x, y: tip.y - side * 10 };
        backs.push({ laneId: l.laneId, from, c: { x: to.x, y: from.y }, to });
        if (l.wait) waits.push({ laneId: l.laneId, text: waits.length ? l.wait : `Main agent waits, ${l.wait}`, at: pointAt(trunk, (uF + to.x) / 2), below: side < 0 });
      }
    });
    let lo = Infinity;
    let hi = -Infinity;
    const span = (y: number, r: number) => { lo = Math.min(lo, y - r); hi = Math.max(hi, y + r); };
    for (const p of parts) p.line.pts.forEach((q, i) => span(q.y, (p.line.widths[i] ?? 0) / 2));
    for (const t of tw) span(t.tip.y, 6);
    // With labels: a number reaches about 18px from its glyph; a block runs from 24px above its tip to 38px below.
    for (const e of eps) span(e.at.y, labels ? 18 / z : e.r + 2.5);
    for (const t of tps) {
      span(t.at.y, t.r + 3);
      if (labels) { span(t.at.y - 24 / z, 0); span(t.at.y + 38 / z, 0); }
    }
    if (labels) span(46 / z, 0);
    return { parts, twigs: tw, episodes: eps, tips: tps, handBacks: backs, waits, headings, paths, extent: [lo, hi] as const };

    /** A part's branches, its own tw and its tip; returns the tip. */
    function grown(p: PartSrc, parent: Line, side: number, to: (u: number) => PathPart[]): Pt {
      // Alternate sides; on the trunk, a branch that would grow into a limb spawned beside it takes the other side.
      let next = -side;
      for (const e of p.episodes) {
        const u0 = uOf(e.first);
        const near = (s: number) => p === m.trunk && m.limbs.some((l, i) => (i % 2 === 0 ? -1 : 1) === s && uOf(l.from) > u0 - 16 && uOf(l.from) < u0 + branchLen(e) * 0.8);
        const s = near(next) && !near(-next) ? -next : next;
        branch(e, s, p.laneId, parent, to);
        next = -s;
      }
      twigsOn(p.twigs, parent, p.id, (t) => to(uOf(t.seq)));
      const tip = parent.pts.at(-1) as Pt;
      tps.push({ laneId: p.tipLane, kind: p.tip.kind, tone: p.tip.tone, at: tip, r: p.tip.kind === 'answer' ? 7 : 2.5, ...(p.tip.episodeId ? { episodeId: p.tip.episodeId } : {}) });
      if (p.tip.episodeId) paths[p.tip.episodeId] = to(Infinity);
      return tip;
    }
    /** An episode's branch: heading ±58° bending to ±10°, pulled 16% toward vertical-up; width by its calls ahead. */
    function branch(e: EpisodeSrc, s: number, laneId: string, parent: Line, to: (u: number) => PathPart[]) {
      const u0 = uOf(e.first);
      const b = pointAt(parent, u0);
      const slot = uOf(e.last) - u0 + unit;
      const len = branchLen(e);
      const N = 40;
      const h0 = b.a + s * rad(58);
      const h1 = b.a + s * rad(10) + (rad(-90) - (b.a + s * rad(10))) * 0.16;
      const pts: (Pt & { h: number })[] = [{ x: b.x, y: b.y, h: h0 }];
      for (let j = 1; j <= N; j++) {
        const h = h0 + (h1 - h0) * (j / N);
        const q = pts[j - 1] as Pt;
        pts.push({ x: q.x + (len / N) * Math.cos(h), y: q.y + (len / N) * Math.sin(h), h });
      }
      const fOf = (t: TwigSrc) => ((uOf(t.seq) - u0 + 0.6 * unit) / slot) * 0.92;
      const calls = e.twigs.filter((t) => t.kind !== 'thinking').map(fOf);
      const line: Line = { pts, widths: pts.map((_, i) => W0(calls.filter((f) => f >= i / N - 0.02).length)) };
      const id = `branch:${e.id}`;
      parts.push({ id, kind: 'branch', laneId, episodeId: e.id, line });
      const base = to(u0);
      paths[e.id] = [...base, { part: id, to: N }];
      let side = 1;
      for (const t of e.twigs) {
        const i = Math.min(N, Math.round(fOf(t) * N));
        side = -side;
        twig(t, pts[i] as Pt & { h: number }, side, id);
        paths[t.stepId] = [...base, { part: id, to: i }];
      }
      const end = pts[N] as Pt & { h: number };
      eps.push({ episodeId: e.id, laneId, n: e.n, kind: e.glyph, at: { x: end.x, y: end.y }, r: 5.5 });
      headings[e.id] = end.h;
    }
    function twigsOn(list: TwigSrc[], line: Line, part: string, to: (t: TwigSrc) => PathPart[]) {
      let side = 1;
      for (const t of list) {
        const q = pointAt(line, uOf(t.seq));
        side = -side;
        twig(t, { x: q.x, y: q.y, h: q.a }, side, part);
        paths[t.stepId] = to(t);
      }
    }
    function twig(t: TwigSrc, q: Pt & { h: number }, side: number, part: string) {
      const a = q.h + side * rad(t.kind === 'thinking' ? 70 : 52);
      const l = t.kind === 'thinking' ? 5 : t.kind === 'failed' ? 16 : 7;
      const tip = { x: q.x + l * Math.cos(a), y: q.y + l * Math.sin(a) };
      const mark = t.kind === 'thinking' ? 'none' : t.kind === 'failed' ? 'x' : t.kind === 'read' ? 'bud' : 'leaf';
      tw.push({ stepId: t.stepId, episodeId: t.episodeId, part, kind: t.kind, mark, base: { x: q.x, y: q.y }, tip, angle: r1((a * 180) / Math.PI) });
    }
  }
}
