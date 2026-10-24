import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../../shared/session/types';
// @ts-expect-error: the canvas's reference geometry is plain JS (docs/design/v7/tree.mjs)
import { LANES as REF_LANES, tree as refTree } from '../../../docs/design/v7/tree.mjs';
import implementer from '../../sessions/samples/implementer-checks.graph.json';
import planner from '../../sessions/samples/planner-pivot.graph.json';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
import { listRows, type EpisodeRow, type VerdictRow } from '../gitlist/rows';
import { highlight, layoutTree, nearest, type Box, type Pt, type TreeLayout, type TreeOptions } from '.';
import { boxesHit, labelBox } from './labels';
import { eightLanes, longSession } from './synthetic';
import { textWidth } from './text';

const VFF = vff as unknown as SessionGraph;
const GRAPHS: [string, SessionGraph][] = [
  ['verify-fail-fix', VFF],
  ['implementer-checks', implementer as unknown as SessionGraph],
  ['planner-pivot', planner as unknown as SessionGraph],
  ['eight lanes', eightLanes()],
  ['one lane, 12 episodes, ~1000 records', longSession()],
];
const DESKTOP: TreeOptions = { width: 1200, height: 520 };
const PHONE: TreeOptions = { width: 358, height: 190, k: 0.95, labels: false };

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

describe.each(GRAPHS)('layoutTree: %s', (_, g) => {
  const t = layoutTree(g, DESKTOP);

  it('places no label over another label, a block, a glyph, a tip, the root or a ribbon', () => {
    const boxes = textBoxes(t);
    const clashes: string[] = [];
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => boxesHit(a.box, b.box) && clashes.push(`${a.key} × ${b.key}`)));
    for (const { key, box } of boxes) {
      for (const e of t.episodes) if (hitsCircle(box, e.at, e.r + 2.5)) clashes.push(`${key} × glyph ${e.n}`);
      for (const m of t.tips) if (hitsCircle(box, m.at, m.r + 3)) clashes.push(`${key} × tip ${m.laneId}`);
      if (hitsCircle(box, t.root.at, t.root.r)) clashes.push(`${key} × root`);
      for (const r of t.ribbons) if (r.line.some((p, i) => hitsCircle(box, p, (r.widths[i] ?? 0) / 2))) clashes.push(`${key} × ${r.id}`);
    }
    expect(clashes).toEqual([]);
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
    // Text boxes carry 2px of padding around the ink.
    expect(textBoxes(u).filter(({ box }) => box.x0 < -2 || box.y0 < -2 || box.x1 > opts.width + 2 || box.y1 > opts.height + 2)).toEqual([]);
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
  });
});

describe('layoutTree: verify-fail-fix against the canvas (docs/design/v7/tree.mjs at 1200 × 520)', () => {
  const t = layoutTree(VFF, DESKTOP);
  const svg = refTree({ width: 1200, icon: { fail: '', ok: '' }, glyph: () => '<svg class="g ">' }) as string;
  const ref = REF_LANES as { key: string; tip: Pt }[];

  it('draws the reference shape: three limbs, the last one continuing the trunk', () => {
    expect(svg).toContain('<svg class="tree');
    expect(t.ribbons.filter((r) => r.kind === 'limb').map((r) => r.laneId)).toEqual([VFF.lanes[3]?.id, VFF.lanes[2]?.id]);
    expect(t.tips.map((m) => m.tone)).toEqual(['ok', 'fail', 'commit']);
  });

  it('puts the limb tips within 6px and the lane label blocks within 12px of the canvas', () => {
    // The engine places every record of the graph where tree.mjs used a trimmed copy and hand-set constants, and it
    // centres the tree by its measured extent instead of a fixed trunk line (y 300): the tips land within 4.5px.
    const tipOf = (laneId: string | undefined) => t.tips.find((m) => m.laneId === laneId)?.at as Pt;
    const lanes = [VFF.lanes[3]?.id, VFF.lanes[2]?.id, VFF.lanes[1]?.id];
    lanes.forEach((id, i) => expect(Math.hypot(tipOf(id).x - ref[i]!.tip.x, tipOf(id).y - ref[i]!.tip.y)).toBeLessThan(6));
    // tree.mjs: the name's baseline at tip + (20, -22 + 14); Re-verify was moved up by hand to -42 to clear 16 and 18.
    // The placement pass moves it 30px up instead of 20 (10px steps): its number 18 sits 6px further right, so -42 would touch it.
    const name = (id: string | undefined) => t.blocks.find((b) => b.laneId === id)?.lines[0] as Pt;
    const want = [-8, -8, -28];
    lanes.forEach((id, i) => expect(Math.hypot(name(id).x - (ref[i]!.tip.x + 20), name(id).y - (ref[i]!.tip.y + want[i]!))).toBeLessThan(12));
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
            "y": 299.5,
          },
          "r": 5.5,
        },
        "tips": [
          {
            "x": 984.3,
            "y": 296.4,
          },
          {
            "x": 499.9,
            "y": 139.9,
          },
          {
            "x": 738.7,
            "y": 439.2,
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

describe('layoutTree: generalised (§5.3)', () => {
  const trunkY = (t: TreeLayout) => t.root.at.y;

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

  it('more than four lanes: limbs alternate sides and stack with decreasing amplitude', () => {
    const t = layoutTree(eightLanes(), DESKTOP);
    const limbs = t.ribbons.filter((r) => r.kind === 'limb').map((r) => Math.max(...r.line.map((p) => Math.abs(p.y - trunkY(t)))) * Math.sign((r.line.at(-1) as Pt).y - trunkY(t)));
    expect(limbs).toHaveLength(8);
    const up = limbs.filter((v) => v < 0).map(Math.abs);
    const down = limbs.filter((v) => v > 0);
    expect([up.length, down.length]).toEqual([4, 4]);
    for (const side of [up, down]) for (let i = 1; i < side.length; i++) expect(side[i]).toBeLessThan(side[i - 1] as number);
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
