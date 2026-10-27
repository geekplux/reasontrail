import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../../shared/session/types';
// @ts-expect-error: the design canvas's reference geometry is plain JS (__fixtures__/tree.mjs reads __fixtures__/vff.json)
import { LANES as REF_LANES, tree as refTree } from './__fixtures__/tree.mjs';
import implementer from '../../sessions/samples/implementer-checks.graph.json';
import planner from '../../sessions/samples/planner-pivot.graph.json';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
import { listRows, type EpisodeRow, type VerdictRow } from '../gitlist/rows';
import { highlight, layoutTree, MIN_BOX, nearest, type Box, type Pt, type TreeLayout, type TreeOptions } from '.';
import { boxesHit, labelBox } from './labels';
import { treeModel } from './model';
import { eightLanes, longSession, synthGraph } from './synthetic';
import { textWidth } from './text';

const VFF = vff as unknown as SessionGraph;
const GRAPHS: [string, SessionGraph][] = [
  ['verify-fail-fix', VFF],
  ['implementer-checks', implementer as unknown as SessionGraph],
  ['planner-pivot', planner as unknown as SessionGraph],
  ['eight lanes', eightLanes()],
  ['one lane, 12 episodes, ~1000 records', longSession()],
  ['one call', synthGraph([{ main: { kind: 'change', calls: 1 } }])],
  ['three calls', synthGraph([{ main: { kind: 'explore', calls: 3, reads: 2 } }])],
  ['three concurrent lanes', synthGraph([
    { main: { kind: 'explore', calls: 3, reads: 2 } },
    { spawn: [{ name: 'Check the parser', agentType: 'reviewer', episodes: [{ kind: 'explore', calls: 5, reads: 3 }] }, { name: 'Check the renderer', agentType: 'reviewer', episodes: [{ kind: 'explore', calls: 4 }, { kind: 'verify', calls: 3, failed: 1 }] }, { name: 'Check the docs', agentType: 'reviewer', episodes: [{ kind: 'explore', calls: 6, reads: 6 }] }] },
    { main: { kind: 'change', calls: 4 } },
  ])],
  ['five concurrent lanes, three on one side', synthGraph([
    { main: { kind: 'explore', calls: 2 } },
    { spawn: ['one', 'two', 'three', 'four', 'five'].map((x, i) => ({ name: `Review part ${x}`, agentType: 'reviewer', episodes: [{ kind: 'explore' as const, calls: 3 + i, reads: 2 }, { kind: 'verify' as const, calls: 2 }] })) },
    { main: { kind: 'change', calls: 3 } },
  ])],
];
const DESKTOP: TreeOptions = { width: 1200, height: 520 };
// The canvas's phone tree is the desktop tree (k = 1.45) at 980 design units, scaled by 0.365.
const PHONE: TreeOptions = { width: 358, height: 190, labels: false };

/** Text as placed: the root's two lines are one label, a block is one label. */
const textBoxes = (t: TreeLayout) => {
  const root = t.labels.filter((l) => l.key.startsWith('root:')).map(labelBox);
  return [
    ...(root.length ? [{ key: 'root', box: { x0: Math.min(...root.map((b) => b.x0)), y0: Math.min(...root.map((b) => b.y0)), x1: Math.max(...root.map((b) => b.x1)), y1: Math.max(...root.map((b) => b.y1)) } }] : []),
    ...t.labels.filter((l) => !l.key.startsWith('root:')).map((l) => ({ key: l.key, box: labelBox(l) })),
    ...t.blocks.map((b) => ({ key: `block:${b.laneId}`, box: b.box })),
  ];
};
/** The corner points of a ribbon's outline. */
const outline = (d: string) => (d.match(/-?[\d.]+ -?[\d.]+/g) ?? []).map((xy) => { const [x, y] = xy.split(' ').map(Number); return { x: x as number, y: y as number, r: 0 }; });
const hitsCircle = (b: Box, c: Pt, r: number) => Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.y0 - c.y, 0, c.y - b.y1)) < r;
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = dx * dx + dy * dy;
  const s = l ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - s * dx, p.y - a.y - s * dy);
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** Points along a segment or a quadratic, every `step` px. */
const sample = (pts: Pt[], step: number): Pt[] => {
  const [a, c, b] = pts.length === 3 ? pts as [Pt, Pt, Pt] : [pts[0] as Pt, pts[0] as Pt, pts[1] as Pt];
  const n = Math.max(1, Math.ceil((dist(a, c) + dist(c, b)) / step));
  return Array.from({ length: n + 1 }, (_, i) => { const s = i / n; return { x: (1 - s) ** 2 * a.x + 2 * s * (1 - s) * c.x + s * s * b.x, y: (1 - s) ** 2 * a.y + 2 * s * (1 - s) * c.y + s * s * b.y }; });
};
/** How far the box's nearest edge or corner is from `p` (0 when it contains it). */
const boxDist = (b: Box, p: Pt) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));

/**
 * Known gaps of the two stress cases: where lanes spawned together all hand back across each other's tips, nothing
 * near the tip is free, so the text crosses a dotted hand-back (the last resort) or, once, a twig, and three blocks
 * move further out to the side of their tip ("Review part four" the furthest).
 */
const KNOWN: Record<string, string[]> = {
  'eight lanes': ['wait:agent-1 × hand-back agent-1'],
  'five concurrent lanes, three on one side': ['block:agent-3 × twig s88', 'block:agent-4 × hand-back agent-2', 'block:agent-1 31px from its tip', 'block:agent-3 31px from its tip', 'block:agent-4 70px from its tip'],
};

describe.each(GRAPHS)('layoutTree: %s', (name, g) => {
  const t = layoutTree(g, DESKTOP);

  it('places no label over another label, a block, a glyph, a tip, the root or a ribbon', () => {
    const boxes = textBoxes(t);
    const clashes: string[] = [];
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => boxesHit(a.box, b.box) && clashes.push(`${a.key} × ${b.key}`)));
    for (const { key, box } of boxes) {
      // A number has its own background halo and sits beside its own glyph.
      for (const e of t.episodes) if (key !== `num:${e.episodeId}` && hitsCircle(box, e.at, e.r + 2.5)) clashes.push(`${key} × glyph ${e.n}`);
      for (const m of t.tips) if (hitsCircle(box, m.at, m.r + 3)) clashes.push(`${key} × tip ${m.laneId}`);
      if (hitsCircle(box, t.root.at, t.root.r)) clashes.push(`${key} × root`);
      for (const r of t.ribbons) if (r.line.some((p, i) => hitsCircle(box, p, (r.widths[i] ?? 0) / 2))) clashes.push(`${key} × ${r.id}`);
    }
    expect(clashes).toEqual([]);
  });

  it('keeps text other than numbers off twigs, leaves, buds, ✕ and hand-backs', () => {
    const clashes: string[] = [];
    for (const { key, box } of textBoxes(t).filter((b) => !b.key.startsWith('num:'))) {
      for (const w of t.twigs) {
        const a = (w.angle * Math.PI) / 180;
        const mark = w.mark === 'leaf' ? { x: w.tip.x + 5.5 * w.scale * Math.cos(a), y: w.tip.y + 5.5 * w.scale * Math.sin(a), r: 6 * w.scale } : { ...w.tip, r: w.mark === 'none' ? 0 : 2.8 * w.scale };
        if (sample([w.base, w.tip], 1).some((p) => hitsCircle(box, p, 0.5)) || hitsCircle(box, mark, mark.r)) clashes.push(`${key} × twig ${w.stepId}`);
      }
      for (const b of t.handBacks) if (sample([b.from, b.c, b.to], 2).some((p) => hitsCircle(box, p, 0.5)) || hitsCircle(box, b.to, 2.5)) clashes.push(`${key} × hand-back ${b.laneId}`);
    }
    expect(clashes).toEqual((KNOWN[name] ?? []).filter((x) => x.includes(' × ')));
  });

  it('keeps every glyph off other glyphs, tips, ✕ and every ribbon but its own branch', () => {
    const clashes: string[] = [];
    for (const e of t.episodes) {
      const halo = e.r + 2.5;
      for (const o of t.episodes) if (o !== e && dist(o.at, e.at) < 2 * halo - 0.5) clashes.push(`${e.n} × glyph ${o.n}`);
      for (const m of t.tips) if (dist(m.at, e.at) < halo + m.r + 3 - 0.5) clashes.push(`${e.n} × tip ${m.laneId}`);
      for (const r of t.ribbons) {
        if (r.id === `branch:${e.episodeId}`) continue;
        if (r.line.some((p, i) => i > 0 && segDist(e.at, r.line[i - 1] as Pt, p) < halo + Math.max(r.widths[i - 1] ?? 0, r.widths[i] ?? 0) / 2 - 0.5)) clashes.push(`${e.n} × ${r.id}`);
      }
      for (const w of t.twigs) if (w.mark === 'x' && dist(w.tip, e.at) < e.r + 6) clashes.push(`${e.n} × ✕ ${w.stepId}`);
    }
    expect(clashes).toEqual([]);
  });

  it('spaces same-side twigs on a branch at least 5.5 × their mark scale apart', () => {
    const close: string[] = [];
    for (const r of t.ribbons.filter((x) => x.kind === 'branch')) {
      const on = t.twigs.filter((w) => w.part === r.id);
      for (let i = 2; i < on.length; i++) {
        const [a, b] = [on[i - 2] as TreeLayout['twigs'][number], on[i] as TreeLayout['twigs'][number]];
        // Same side: the two twigs point within 60° of each other (opposite sides are about 104° apart).
        const sameSide = Math.abs(((b.angle - a.angle + 540) % 360) - 180) < 60;
        if (sameSide && b.scale > 0.5 * (t.root.r / 5.5) && dist(a.base, b.base) < 5.5 * b.scale - 0.15) close.push(`${b.stepId} ${dist(a.base, b.base).toFixed(1)} < ${(5.5 * b.scale).toFixed(1)}`);
      }
    }
    expect(close).toEqual([]);
  });

  it('puts every lane block within 24px of its tip', () => {
    const far: string[] = [];
    for (const b of t.blocks) {
      const tip = t.tips.find((m) => m.laneId === b.laneId) as TreeLayout['tips'][number];
      const d = boxDist(b.box, tip.at);
      if (d > 24) far.push(`block:${b.laneId} ${Math.round(d)}px from its tip`);
    }
    expect(far).toEqual((KNOWN[name] ?? []).filter((x) => x.endsWith('from its tip')));
  });

  it('keeps wait texts at least 32px apart left to right (16px above or below)', () => {
    const waits = t.labels.filter((l) => l.key.startsWith('wait:')).map(labelBox);
    waits.forEach((a, i) => waits.slice(i + 1).forEach((b) => expect(Math.max(b.x0 - a.x1, a.x0 - b.x1) >= 32 || Math.max(b.y0 - a.y1, a.y0 - b.y1) >= 16).toBe(true)));
  });

  it('grows exactly one twig per tool call and thinking step (a spawn call is its limb)', () => {
    const spawns = new Set(g.lanes.map((l) => l.spawnedBy));
    const want = g.steps.filter((s) => (s.kind === 'tool-call' && !spawns.has(s.id)) || s.kind === 'thinking').map((s) => s.id).sort();
    expect(t.twigs.map((w) => w.stepId).sort()).toEqual(want);
    expect(t.twigs.every((w) => (w.kind === 'thinking') === (w.mark === 'none') && (w.kind === 'failed') === (w.mark === 'x'))).toBe(true);
  });

  it('keeps every part as thick or thinner toward its tip', () => {
    for (const r of t.ribbons) for (let i = 1; i < r.widths.length; i++) expect(r.widths[i], `${r.id} at ${i}`).toBeLessThanOrEqual(r.widths[i - 1] as number);
  });

  it('puts the root\'s left edge on the content edge, with "Task" left-aligned under it', () => {
    expect(t.root.at.x).toBe(t.root.r);
    expect(t.labels.find((l) => l.key === 'root:task')).toMatchObject({ x: 0, anchor: 'start' });
  });

  it.each([['desktop', DESKTOP], ['phone silhouette', PHONE]] as const)('stays inside the box (%s)', (_size, opts) => {
    const u = layoutTree(g, opts);
    const pts = [...u.ribbons.flatMap((r) => outline(r.d)), ...u.twigs.map((w) => ({ ...w.tip, r: 0 })), ...u.episodes.map((e) => ({ ...e.at, r: e.r })), ...u.tips.map((m) => ({ ...m.at, r: m.r }))];
    const outside = pts.filter((p) => p.x - p.r < -0.5 || p.y - p.r < -0.5 || p.x + p.r > opts.width + 0.5 || p.y + p.r > opts.height + 0.5);
    expect(outside).toEqual([]);
    // Text boxes carry 1px of padding around the ink.
    expect(textBoxes(u).filter(({ box }) => box.x0 < -1 || box.y0 < -1 || box.x1 > opts.width + 1 || box.y1 > opts.height + 1)).toEqual([]);
    expect(textBoxes(u).length > 0).toBe(opts.labels !== false);
  });

  it('is deterministic', () => {
    expect(layoutTree(g, DESKTOP)).toEqual(t);
  });

  it('numbers episodes and times lanes like the list', () => {
    const rows = listRows(g);
    const n = new Map(rows.filter((r): r is EpisodeRow => r.kind === 'episode').map((r) => [r.episodeId, r.n]));
    expect(t.episodes.length).toBeGreaterThan(0);
    for (const e of t.episodes) expect(e.n).toBe(n.get(e.episodeId));
    for (const v of rows.filter((r): r is VerdictRow => r.kind === 'verdict')) {
      const block = t.blocks.find((b) => b.laneId === v.laneId);
      expect(block?.lines.find((l) => l.icon)?.text).toBe(v.text);
      expect(block?.lines.at(-1)?.text.endsWith(v.dur ?? '')).toBe(true);
    }
  });

  it('links every episode and step to its path from the root and to a hit target', () => {
    for (const id of [...t.episodes.map((e) => e.episodeId), ...t.twigs.map((w) => w.stepId)]) {
      expect(t.paths[id]?.[0]?.part).toBe('trunk');
      expect(highlight(t, id).length).toBe(t.paths[id]?.length);
    }
    for (const w of t.twigs.slice(0, 20)) expect(nearest(t, { x: w.tip.x + 0.5, y: w.tip.y })?.id).toBeDefined();
    // A tip that is an episode (an answer) ends the whole path of its part.
    for (const m of t.tips.filter((x) => x.episodeId)) {
      const last = t.paths[m.episodeId as string]?.at(-1);
      expect(last?.to).toBe((t.ribbons.find((r) => r.id === last?.part)?.line.length ?? 0) - 1);
    }
  });

  it('hits every tip, an episode number and a leaf\'s far end', () => {
    for (const m of t.tips.filter((x) => x.episodeId)) expect(t.hits.some((h) => h.id === m.episodeId && h.points.length === 1 && h.points[0] === m.at)).toBe(true);
    // A tip without an episode of its own (an errored lane, the trunk's end dot) is its lane's last episode.
    for (const m of t.tips) expect(t.hits.some((h) => h.kind === 'episode' && h.points.length === 1 && h.points[0] === m.at), `tip ${m.laneId}`).toBe(true);
    for (const l of t.labels.filter((x) => x.key.startsWith('num:'))) expect(t.hits.some((h) => h.kind === 'episode' && h.id === l.key.slice(4) && h.points.length === 2 && (h.pad ?? 0) > 0)).toBe(true);
    const leaf = t.twigs.find((w) => w.mark === 'leaf') as TreeLayout['twigs'][number];
    const a = (leaf.angle * Math.PI) / 180;
    expect(t.hits.find((h) => h.id === leaf.stepId)?.points).toHaveLength(3);
    expect(nearest(t, { x: leaf.tip.x + 10.5 * leaf.scale * Math.cos(a), y: leaf.tip.y + 10.5 * leaf.scale * Math.sin(a) }, 0.6)?.id).toBe(leaf.stepId);
  });
});

describe('layoutTree: verify-fail-fix against the canvas (__fixtures__/tree.mjs at 1200 × 520)', () => {
  const t = layoutTree(VFF, DESKTOP);
  const svg = refTree({ width: 1200, icon: { fail: '', ok: '' }, glyph: () => '<svg class="g ">' }) as string;
  const ref = REF_LANES as { key: string; tip: Pt }[];

  it('draws the reference shape: three limbs, the last one continuing the trunk', () => {
    expect(svg).toContain('<svg class="tree');
    expect(t.ribbons.filter((r) => r.kind === 'limb').map((r) => r.laneId)).toEqual([VFF.lanes[3]?.id, VFF.lanes[2]?.id]);
    expect(t.tips.map((m) => m.tone)).toEqual(['ok', 'fail', 'commit']);
  });

  // The canvas's marks, read from tree.mjs's SVG: episode numbers (`t-num`) and glyph halos in drawing order.
  const refNums = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="middle" class="t-num">(\d+)<\/text>/g)].map((x) => ({ n: Number(x[3]), x: Number(x[1]), y: Number(x[2]) }));
  const refGlyphs = [...svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="8" class="halo"\/>/g)].map((x) => ({ x: Number(x[1]), y: Number(x[2]) }));
  const lanes = [VFF.lanes[3]?.id, VFF.lanes[2]?.id, VFF.lanes[1]?.id];

  it('puts the lane tips within 1.5px and the lane names within 2px of the canvas', () => {
    const tipOf = (laneId: string | undefined) => t.tips.find((m) => m.laneId === laneId)?.at as Pt;
    lanes.forEach((id, i) => expect(dist(tipOf(id), ref[i]!.tip), `tip ${i}`).toBeLessThan(1.5));
    // tree.mjs: the name's baseline at tip + (20, -22 + 14); Re-verify was moved up by hand to -42 (tip + (20, -28)) to
    // clear 16 and 18, which the placement pass finds as its fourth candidate.
    const name = (id: string | undefined) => t.blocks.find((b) => b.laneId === id)?.lines[0] as Pt;
    const want = [-8, -8, -28];
    lanes.forEach((id, i) => expect(dist(name(id), { x: ref[i]!.tip.x + 20, y: ref[i]!.tip.y + want[i]! }), `name ${i}`).toBeLessThan(2));
  });

  it('puts glyphs and numbers within 2px of the canvas, except 1, 3, 14 and 16, which move off a ribbon', () => {
    const moved = new Set([1, 3, 14, 16]);
    expect(refNums).toHaveLength(16);
    refNums.forEach((r, i) => {
      if (moved.has(r.n)) return;
      const e = t.episodes.find((x) => x.n === r.n) as TreeLayout['episodes'][number];
      const num = t.labels.find((l) => l.key === `num:${e.episodeId}`) as Pt;
      expect(dist(e.at, refGlyphs[i] as Pt), `glyph ${r.n}`).toBeLessThan(2);
      expect(dist(num, r), `number ${r.n}`).toBeLessThan(2);
    });
  });

  it('puts the phone silhouette\'s tips within 1px of Phone.html (its 980 × 520 tree at 358 × 190)', () => {
    const phone = layoutTree(VFF, PHONE);
    const z = 358 / 980;
    // Phone.html's tip halos, in its viewBox units: Re-verify, Verify, Fix.
    const want = [{ x: 919.5, y: 296.9 }, { x: 467.5, y: 140.4 }, { x: 688.8, y: 444 }];
    phone.tips.forEach((m, i) => expect(dist(m.at, { x: want[i]!.x * z, y: want[i]!.y * z }), `tip ${m.tone}`).toBeLessThan(1));
  });

  it('sets the waits on the trunk like the canvas: below its flat line, and above the trunk\'s edge', () => {
    const refWaits = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="middle" class="t-sub">/g)].map((x) => ({ x: Number(x[1]), y: Number(x[2]) }));
    const waits = t.labels.filter((l) => l.key.startsWith('wait:'));
    expect(waits).toHaveLength(2);
    waits.forEach((w, i) => expect(dist(w, refWaits[i] as Pt), `wait ${w.text}`).toBeLessThan(2.5));
  });

  it('keeps a stable snapshot of key numbers', () => {
    const tip = (laneId: string) => t.tips.find((m) => m.laneId === laneId)?.at;
    expect({
      ribbons: t.ribbons.length, twigs: t.twigs.length, episodes: t.episodes.map((e) => e.n).join(' '),
      root: t.root, trunkWidth: t.ribbons[0]?.widths[0], tips: t.tips.map((m) => tip(m.laneId)), waits: t.labels.filter((l) => l.key.startsWith('wait:')).map((l) => l.text),
    }).toMatchInlineSnapshot(`
      {
        "episodes": "14 15 16 17 18 1 2 3 4 5 6 7 8 10 11 12",
        "ribbons": 19,
        "root": {
          "at": {
            "x": 5.5,
            "y": 299.8,
          },
          "r": 5.5,
        },
        "tips": [
          {
            "x": 984.3,
            "y": 296.7,
          },
          {
            "x": 499.9,
            "y": 140.2,
          },
          {
            "x": 738.7,
            "y": 443.4,
          },
        ],
        "trunkWidth": 21.1,
        "twigs": 91,
        "waits": [
          "Main agent waits, 33 min",
          "12 min",
        ],
      }
    `);
  });
});

describe('layoutTree: generalised', () => {
  const trunkY = (t: TreeLayout) => t.root.at.y;
  /** The vertical span of the drawn marks (ribbons, twig tips, glyphs and tips). */
  const marks = (t: TreeLayout) => {
    const ys = [...t.ribbons.flatMap((r) => outline(r.d).map((p) => p.y)), ...t.twigs.map((w) => w.tip.y), ...t.episodes.flatMap((e) => [e.at.y - e.r, e.at.y + e.r]), ...t.tips.flatMap((m) => [m.at.y - m.r, m.at.y + m.r])];
    return { top: Math.min(...ys), bottom: Math.max(...ys) };
  };

  it.each([[GRAPHS[1]![1]], [GRAPHS[4]![1]]])('one lane: the branches grow to use the height, centred (%#)', (g) => {
    const t = layoutTree(g, DESKTOP);
    const { top, bottom } = marks(t);
    expect(bottom - top).toBeGreaterThanOrEqual(300);
    expect(Math.abs(top - (DESKTOP.height - bottom))).toBeLessThanOrEqual(40);
  });

  it('keeps the trunk and every limb inside the along-axis for a one-call session', () => {
    const t = layoutTree(GRAPHS[5]![1], DESKTOP);
    for (const r of t.ribbons.filter((x) => x.kind !== 'branch')) expect((r.line.at(-1) as Pt).x).toBeLessThanOrEqual(DESKTOP.width - 210 + 12);
  });

  it('keeps a reserved zone (the legend) free', () => {
    const zone = { x0: 600, y0: 0, x1: 1200, y1: 20 };
    const t = layoutTree(eightLanes(), { ...DESKTOP, reserve: [zone] });
    const inside = (p: Pt, r = 0) => hitsCircle(zone, p, r) || (p.x > zone.x0 && p.x < zone.x1 && p.y < zone.y1);
    expect(t.ribbons.flatMap((r) => outline(r.d)).filter((p) => inside(p))).toEqual([]);
    expect([...t.twigs.map((w) => w.tip), ...t.episodes.map((e) => e.at), ...t.tips.map((m) => m.at)].filter((p) => inside(p, 6))).toEqual([]);
    expect(textBoxes(t).filter(({ box }) => boxesHit(box, zone))).toEqual([]);
  });

  it('returns an empty tree for an empty, infinite or too small box (below MIN_BOX)', () => {
    const { width: w, height: h } = MIN_BOX;
    for (const [width, height] of [[0, 520], [1200, 0], [-5, 100], [Number.NaN, 520], [Infinity, 520], [1200, Infinity], [Infinity, Infinity], [w - 1, 520], [1200, h - 1]]) {
      const t = layoutTree(VFF, { width: width as number, height: height as number });
      expect([t.ribbons, t.twigs, t.episodes, t.tips, t.labels, t.blocks, t.hits]).toEqual([[], [], [], [], [], [], []]);
    }
    expect(layoutTree(VFF, { width: w, height: h }).ribbons.length).toBeGreaterThan(0);
  });

  it('models a session with an episode of 200,000 records (no argument-spread overflow)', () => {
    const g = synthGraph([{ main: { kind: 'explore', calls: 3 } }]);
    const e = g.episodes[1]!;
    const extra = Array.from({ length: 200_000 }, (_, i) => ({ ...g.steps[1]!, id: `x${i}`, kind: 'assistant' as const, seq: g.steps.length + i, text: 'More' }));
    const big = { ...g, steps: [...g.steps, ...extra], episodes: g.episodes.map((x) => (x === e ? { ...x, stepIds: [...x.stepIds, ...extra.map((s) => s.id)] } : x)) };
    expect(() => treeModel(big)).not.toThrow();
  });

  it('one lane: a trunk with branches alternating below and above, the answer as its tip, "Session ends" beside it', () => {
    const t = layoutTree(GRAPHS[1]![1], DESKTOP);
    expect(t.ribbons.filter((r) => r.kind === 'limb')).toEqual([]);
    const sides = t.episodes.map((e) => Math.sign(e.at.y - trunkY(t)));
    expect(sides.slice(1, 9)).toEqual([-1, 1, -1, 1, -1, 1, -1, 1]);
    expect(t.tips).toMatchObject([{ kind: 'answer', tone: 'done' }]);
    expect(t.blocks[0]?.lines.map((l) => l.text)).toEqual(['Session ends', '49 min']);
  });

  it('two lanes: the errored planner run gets the orange verdict; the main agent keeps the trunk', () => {
    const t = layoutTree(GRAPHS[2]![1], DESKTOP);
    expect(t.tips.map((m) => [m.kind, m.tone])).toEqual([['end', 'done'], ['answer', 'fail'], ['answer', 'done']]);
    expect(t.tips[1]!.at.y).toBeLessThan(trunkY(t));
    expect(t.tips[2]!.at.y).toBeGreaterThan(trunkY(t));
  });

  it('a trunk ending in a dot runs at least 20px past its last glyph (planner-pivot)', () => {
    const t = layoutTree(GRAPHS[2]![1], DESKTOP);
    const dot = t.tips.find((m) => m.kind === 'end') as TreeLayout['tips'][number];
    const last = Math.max(...t.episodes.filter((e) => t.paths[e.episodeId]?.length === 2 && t.paths[e.episodeId]?.[0]?.part === 'trunk').map((e) => e.at.x));
    expect(dot.at.x - last).toBeGreaterThanOrEqual(20);
  });

  it('more than four lanes: limbs alternate sides and stack with decreasing amplitude', () => {
    const t = layoutTree(eightLanes(), DESKTOP);
    const limbs = t.ribbons.filter((r) => r.kind === 'limb').map((r) => Math.max(...r.line.map((p) => Math.abs(p.y - trunkY(t)))) * Math.sign((r.line.at(-1) as Pt).y - trunkY(t)));
    expect(limbs).toHaveLength(8);
    const up = limbs.filter((v) => v < 0).map(Math.abs);
    const down = limbs.filter((v) => v > 0);
    expect([up.length, down.length]).toEqual([4, 4]);
    for (const side of [up, down]) for (let i = 1; i < side.length; i++) expect(side[i]).toBeLessThan(side[i - 1] as number);
  });

  it.each([[GRAPHS[7]![1], 2], [GRAPHS[8]![1], 3]])('concurrent lanes on one side stack with decreasing amplitude (%#)', (g, n) => {
    const t = layoutTree(g, DESKTOP);
    const up = t.ribbons.filter((r) => r.kind === 'limb' && (r.line.at(-1) as Pt).y < trunkY(t)).map((r) => Math.max(...r.line.map((p) => trunkY(t) - p.y)));
    expect(up).toHaveLength(n);
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeLessThan((up[i - 1] as number) - 20);
  });

  it('hit testing: the nearest twig within 12px, else its episode; nothing farther', () => {
    const t = layoutTree(VFF, DESKTOP);
    const w = t.twigs.find((x) => x.mark === 'x') as TreeLayout['twigs'][number];
    expect(nearest(t, { x: w.tip.x + 6, y: w.tip.y })).toMatchObject({ kind: 'step', id: w.stepId });
    expect(nearest(t, { x: 600, y: 20 })).toBeUndefined();
    const e = t.episodes[0]!;
    expect(nearest(t, { x: e.at.x + 9, y: e.at.y + 0.1 })?.episodeId).toBe(e.episodeId);
  });
});

describe('hit testing: marks by their edges, text by its box', () => {
  const PLAN = GRAPHS[2]![1];
  const cases = GRAPHS.slice(0, 3).map(([name, g]) => [name, g, layoutTree(g, DESKTOP)] as const);
  const model = (g: SessionGraph) => treeModel(g);
  it.each(cases)('%s: a number\'s text picks its own episode, anywhere on it', (_, __, t) => {
    for (const l of t.labels.filter((x) => x.key.startsWith('num:'))) {
      const b = labelBox(l);
      const ym = (b.y0 + b.y1) / 2;
      for (const p of [{ x: (b.x0 + b.x1) / 2, y: ym }, { x: b.x0 + 1, y: b.y0 + 1 }, { x: b.x1 - 1, y: b.y1 - 1 }]) expect(nearest(t, p)?.episodeId, `${l.key}`).toBe(l.key.slice(4));
    }
  });
  it.each(cases)('%s: the edge of a glyph\'s ring or of a tip picks that glyph or tip', (_, g, t) => {
    for (const e of t.episodes) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(nearest(t, { x: e.at.x + dx! * e.r, y: e.at.y + dy! * e.r })?.episodeId, `glyph ${e.n}`).toBe(e.episodeId);
    const last = model(g).lastEpisode;
    for (const m of t.tips) for (const [dx, dy] of [[1, 0], [0, 1], [0, -1]]) expect(nearest(t, { x: m.at.x + dx! * m.r, y: m.at.y + dy! * m.r })?.episodeId, `tip ${m.laneId}`).toBe(m.episodeId ?? last[m.laneId]);
  });
  it.each(cases)('%s: a number\'s hit is inset like a lane block\'s, so it does not reach far past the text', (_, __, t) => {
    for (const l of t.labels.filter((x) => x.key.startsWith('num:'))) {
      const b = labelBox(l);
      const pad = (b.y1 - b.y0) / 2;
      const d = Math.min(pad, (b.x1 - b.x0) / 2);
      const h = t.hits.find((x) => x.kind === 'episode' && x.id === l.key.slice(4) && x.points.length === 2 && x.pad === pad)!;
      expect(h.points.map((p) => p.x), `${l.key}`).toEqual([b.x0 + d, b.x1 - d]);
    }
  });
  it.each(cases)('%s: a lane block picks its lane, as its tip does', (_, g, t) => {
    const last = model(g).lastEpisode;
    expect(t.blocks.length).toBeGreaterThan(0);
    for (const b of t.blocks) {
      const tip = t.tips.find((m) => m.laneId === b.laneId)!;
      const hit = nearest(t, { x: (b.box.x0 + b.box.x1) / 2, y: (b.box.y0 + b.box.y1) / 2 });
      expect(hit?.episodeId, `block ${b.laneId}`).toBe(tip.episodeId ?? last[b.laneId]);
      expect(hit?.tipLane).toBe(tip.episodeId ? undefined : b.laneId);
    }
  });
  it('a twig of an episode with no path (planner-pivot\'s delegate e2) is no hit target', () => {
    const t = layoutTree(PLAN, DESKTOP);
    const s11 = t.twigs.find((w) => w.stepId === 's11')!;
    expect(s11.episodeId).toBe('e2');
    expect(t.paths.e2).toBeUndefined();
    expect(t.hits.filter((h) => h.episodeId === 'e2')).toEqual([]);
    for (const h of t.hits) expect(t.paths[h.episodeId], `hit ${h.id}`).toBeDefined();
    expect(nearest(t, s11.tip)?.episodeId).not.toBe('e2');
  });
});

describe('textWidth', () => {
  it('measures Geist widths within a few percent of the browser', () => {
    // Chrome's measureText of the self-hosted Geist (500 12px, 600 14px), plus the 4% margin.
    // Never narrower than the text, at most 8% wider.
    for (const [w, measured] of [[textWidth('Main agent waits, 34 min', 12, 500), 141.8], [textWidth('Fix phase 12 audit gap', 14, 600), 150.8], [textWidth('Main agent waits, 34 min', 12, 400), 139.1]]) {
      expect((w as number) / (measured as number)).toBeGreaterThanOrEqual(1);
      expect((w as number) / (measured as number)).toBeLessThan(1.08);
    }
  });
});
