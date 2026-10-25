import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../../shared/session/types';
import implementer from '../../sessions/samples/implementer-checks.graph.json';
import planner from '../../sessions/samples/planner-pivot.graph.json';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
import { boxesHit } from './labels';
import { textWidth } from './text';
import { highlight, ribbonPath } from '.';
import type { Box, Pt } from './types';
import { synthGraph } from './synthetic';
import { legendKeys, treeCallout, treeCrop, treeFor, treeSummary, treeTip } from './view';
import { labelBox } from './labels';

const VFF = vff as unknown as SessionGraph;
const IMPL = implementer as unknown as SessionGraph;
const PLAN = planner as unknown as SessionGraph;

describe('treeFor', () => {
  it('memoises the layout per graph and box', () => {
    const a = treeFor(VFF, 1200, 520);
    expect(treeFor(VFF, 1200, 520)).toBe(a);
    expect(treeFor(VFF, 1200, 520, true, [])).toBe(a);
    const reserved = treeFor(VFF, 1200, 520, true, [{ x0: 470, y0: 0, x1: 1200, y1: 24 }]);
    expect(reserved).not.toBe(a);
    expect(treeFor(IMPL, 1200, 520)).not.toBe(a);
    expect(treeFor(VFF, 900, 480).width).toBe(900);
  });

  it('keeps only the last few sizes of a graph', () => {
    const first = treeFor(PLAN, 1000, 500);
    for (const w of [1001, 1002, 1003, 1004]) treeFor(PLAN, w, 500);
    expect(treeFor(PLAN, 1000, 500)).not.toBe(first);
    expect(treeFor(PLAN, 1000, 500)).toEqual(first);
  });
});

describe('treeSummary', () => {
  it('states the counts, the time and each subagent with its verdict, with no middle dot', () => {
    expect(treeSummary(VFF)).toBe('Tree: 19 episodes, 60 tool calls, 47 min. The main agent spawns 3 subagents: Verify phase 12 (failed: 1 gap), Fix phase 12 audit gap (committed cceb2d5), Re-verify phase 12 (passed).');
    expect(treeSummary(IMPL)).toBe('Tree: 12 episodes, 51 tool calls (3 failed), 49 min, all by the main agent.');
    expect(treeSummary(PLAN)).toMatch(/^Tree: 10 episodes, 37 tool calls, 17 min\. The main agent spawns 2 subagents: Rewrite plan for pivot \(failed\), Rewrite plan for pivot \(done\)\.$/);
    for (const g of [VFF, IMPL, PLAN]) expect(treeSummary(g)).not.toContain('·');
  });
});

describe('treeTip', () => {
  const t = treeFor(VFF, 1200, 520);
  it('shows the canvas tooltip for episode 7, right of and below its glyph', () => {
    const tip = treeTip(VFF, t, 'e19')!;
    expect([tip.n, tip.title, tip.facts]).toEqual([7, 'Edit zz-verify-scratch.test.ts +8 more', '20 steps, 6 tool calls, 15 min wait, 17 min']);
    const glyph = t.episodes.find((e) => e.episodeId === 'e19')!.at;
    expect(tip.box.x0).toBeCloseTo(glyph.x + 16, 5);
    expect(tip.box.y0).toBeCloseTo(glyph.y + 10, 5);
    expect(tip.box.x1 - tip.box.x0).toBeGreaterThanOrEqual(296);
    expect(tip.box.x1 - tip.box.x0).toBeLessThanOrEqual(304);
    expect(tip.box.y1 - tip.box.y0).toBe(56);
  });

  it('names failed calls, and a lane answer by its verdict, without zero counts', () => {
    expect(treeTip(VFF, t, 'e18')?.facts).toBe('28 steps, 10 tool calls, 1 failed, 16 min');
    expect(treeTip(VFF, t, 'e21')).toMatchObject({ n: 9, title: 'Failed: 1 gap', facts: '1 step, 33 min' });
  });

  it('stays inside the box: flips left at the right edge, cuts a long title', () => {
    for (const g of [VFF, IMPL, PLAN]) {
      const tg = treeFor(g, 1200, 520);
      for (const id of [...tg.episodes.map((e) => e.episodeId), ...tg.tips.flatMap((m) => (m.episodeId ? [m.episodeId] : []))]) {
        const tip = treeTip(g, tg, id)!;
        expect(tip.box.y0).toBeGreaterThanOrEqual(0);
        expect(tip.box.x0).toBeGreaterThanOrEqual(0);
        expect(tip.box.x1).toBeLessThanOrEqual(1200);
        expect(tip.box.y1).toBeLessThanOrEqual(520);
        expect(textWidth(tip.title, 14, 500)).toBeLessThanOrEqual(360);
      }
    }
    expect(treeTip(PLAN, treeFor(PLAN, 1200, 520), 'e6')?.title).toMatch(/…$/);
  });

  const inBox = (b: { x0: number; y0: number; x1: number; y1: number }, p: { x: number; y: number }, r = 0) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1)) < r || (p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1);
  it('keeps clear of its own branch, glyph and twigs: episode 17 sits left and above', () => {
    const e = t.episodes.find((m) => m.n === 17)!;
    const tip = treeTip(VFF, t, e.episodeId)!;
    const branch = t.ribbons.find((r) => r.id === `branch:${e.episodeId}`)!;
    expect(branch.line.some((p, i) => inBox(tip.box, p, (branch.widths[i] ?? 0) / 2))).toBe(false);
    expect(inBox(tip.box, e.at, e.r + 2.5)).toBe(false);
    for (const w of t.twigs.filter((x) => x.episodeId === e.episodeId)) expect(inBox(tip.box, w.tip)).toBe(false);
    expect(tip.box.x1).toBeLessThanOrEqual(e.at.x);
    expect(tip.box.y1).toBeLessThanOrEqual(e.at.y);
    // No sample's tooltip covers its own branch.
    for (const g of [VFF, IMPL, PLAN]) {
      const tg = treeFor(g, 1200, 520);
      for (const m of tg.episodes) {
        const b = treeTip(g, tg, m.episodeId)!.box;
        expect(tg.ribbons.find((r) => r.id === `branch:${m.episodeId}`)!.line.some((p) => inBox(b, p)), `episode ${m.n}`).toBe(false);
      }
    }
  });

  it('stays off the legend', () => {
    const legend = { x0: 470, y0: 0, x1: 1200, y1: 32 };
    const tg = treeFor(VFF, 1200, 520, true, [legend]);
    for (const m of tg.episodes) {
      const b = treeTip(VFF, tg, m.episodeId, { reserve: [legend] })!.box;
      expect(b.x0 < legend.x1 && legend.x0 < b.x1 && b.y0 < legend.y1 && legend.y0 < b.y1, `episode ${m.n}`).toBe(false);
    }
  });

  it('titles a failed lane tip without its own episode by the lane\'s verdict, at the tip', () => {
    const tp = treeFor(PLAN, 1200, 520);
    const m = tp.tips.find((x) => x.tone === 'fail' && !x.episodeId)!;
    const tip = treeTip(PLAN, tp, 'e7', { tipLane: m.laneId })!;
    expect(tip).toMatchObject({ episodeId: 'e7', title: 'Failed', facts: '15 steps, 5 tool calls, 1 min' });
    expect(tip.n).toBeUndefined();
    // Each spot beside the tip covers the episode's own marks, so it sits right of the tip, under the lane's block.
    const block = tp.blocks.find((b) => b.laneId === m.laneId)!.box;
    expect(tip.box.x0).toBeCloseTo(m.at.x + 16, 5);
    expect(tip.box.y0).toBeCloseTo(block.y1 + 6, 5);
    expect(inBox(tip.box, m.at, m.r + 3)).toBe(false);
    expect(boxesHit(tip.box, tp.blocks.find((b) => b.laneId === m.laneId)!.box)).toBe(false);
  });

  /** The points of the path highlighted for `id` that `box` covers (with half the ribbon's width), by part. */
  const pathCovered = (tg: ReturnType<typeof treeFor>, id: string, box: { x0: number; y0: number; x1: number; y1: number }) =>
    tg.paths[id]!.flatMap(({ part, to }) => {
      const r = tg.ribbons.find((x) => x.id === part)!;
      return r.line.slice(0, to + 1).flatMap((p, i) => (inBox(box, p, (r.widths[i] ?? 0) / 2) ? [`${part}[${i}]`] : []));
    });
  it('covers none of the path it highlights: the failed planner tip and answer tip 13', () => {
    const tp = treeFor(PLAN, 1200, 520);
    const m = tp.tips.find((x) => x.tone === 'fail' && !x.episodeId)!;
    const failed = treeTip(PLAN, tp, 'e7', { tipLane: m.laneId })!;
    expect(pathCovered(tp, 'e7', failed.box)).toEqual([]);
    const tip13 = treeTip(VFF, t, 'e12')!;
    expect([tip13.n, tip13.title]).toEqual([13, 'Committed cceb2d5']);
    expect(pathCovered(t, 'e12', tip13.box)).toEqual([]);
    expect(inBox(tip13.box, t.tips.find((x) => x.episodeId === 'e12')!.at, 8.5)).toBe(false);
  });

  it('is undefined for an id the tree does not draw', () => {
    expect(treeTip(VFF, t, 'nope')).toBeUndefined();
  });
});

describe('treeCallout (phase 32b, Step.html)', () => {
  const reserve = [{ x0: 470, y0: 0, x1: 1200, y1: 24 }];
  const t = treeFor(VFF, 1200, 520, true, reserve);
  const lines: [string, string] = ['Inspect vitest config for log suppression', 'Exit code 2, 16 min'];

  it('puts the selected step\'s callout above and left of it at the top edge, as the canvas does', () => {
    const c = treeCallout(t, 's41', lines, reserve)!;
    // Canvas: ring (235.9, 133.7), text end (211.9, 9.7), leader (230.9, 124.7) → (217.9, 29.7).
    expect(Math.abs(c.ring.x - 235.9)).toBeLessThan(2);
    expect(Math.abs(c.ring.y - 133.7)).toBeLessThan(2);
    expect([c.anchor, c.y, Math.round(c.x - c.ring.x)]).toEqual(['end', 9.7, -24]);
    expect(c.leader[1]).toEqual({ x: Math.round((c.ring.x - 18) * 10) / 10, y: 29.7 });
    expect(Math.hypot(c.leader[0].x - c.ring.x, c.leader[0].y - c.ring.y)).toBeCloseTo(10.3, 0);
    expect(c.lines).toEqual(lines);
  });

  it('keeps clear of the legend and the tree\'s text, and its leader crosses no text, for every drawn step of every sample', () => {
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    // The leader against a box, sampled every 1/200 of its length.
    const crosses = ([a, b]: [Pt, Pt], r: Box) => Array.from({ length: 201 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / 200, y: a.y + ((b.y - a.y) * i) / 200 })).some((p) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1);
    const bad: string[] = [];
    for (const g of [VFF, IMPL, PLAN]) {
      const tt = treeFor(g, 1200, 520, true, reserve);
      const texts = [...tt.labels.map(labelBox), ...tt.blocks.map((b) => b.box)];
      for (const w of tt.twigs) {
        const c = treeCallout(tt, w.stepId, lines, reserve)!;
        const ring = Math.hypot(Math.max(c.box.x0 - c.ring.x, 0, c.ring.x - c.box.x1), Math.max(c.box.y0 - c.ring.y, 0, c.ring.y - c.box.y1));
        const why = [
          c.box.y0 < 9.7 - 12 - 0.01 && 'above the figure',
          ring < 10 && 'on the ring',
          reserve.some((r) => hit(r, c.box) || crosses(c.leader, r)) && 'on the legend',
          texts.some((b) => crosses(c.leader, b)) && 'leader through text',
          texts.some((b) => boxesHit(b, c.box)) && 'on text',
        ].filter(Boolean);
        if (why.length > 0) bad.push(`${g.title} ${w.stepId}: ${why.join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps 4px of air between the callout\'s text and the tree\'s numbers and glyphs: planner-pivot s104', () => {
    const tp = treeFor(PLAN, 1200, 520, true, reserve);
    const c = treeCallout(tp, 's104', lines, reserve)!;
    const air = { x0: c.box.x0 - 4, y0: c.box.y0 - 4, x1: c.box.x1 + 4, y1: c.box.y1 + 4 };
    expect(c.box.y1 - c.box.y0).toBe(32);
    expect(tp.labels.map(labelBox).filter((b) => boxesHit(b, air))).toEqual([]);
    expect([...tp.episodes, ...tp.tips].filter((m) => Math.hypot(Math.max(air.x0 - m.at.x, 0, m.at.x - air.x1), Math.max(air.y0 - m.at.y, 0, m.at.y - air.y1)) < m.r + 3).map((m) => m.at)).toEqual([]);
  });

  it('keeps the hover tooltip off the selected step\'s ring and callout and inside the figure: s150 with 17, s156 with 18, every pair', () => {
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const keep = (tt: ReturnType<typeof treeFor>, stepId: string) => {
      const c = treeCallout(tt, stepId, lines, reserve)!;
      return { call: c.box, ring: { x0: c.ring.x - 10, y0: c.ring.y - 10, x1: c.ring.x + 10, y1: c.ring.y + 10 } };
    };
    const inside = (b: Box) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= t.width && b.y1 <= t.height;
    for (const [stepId, n] of [['s150', 17], ['s156', 18]] as const) {
      const k = keep(t, stepId);
      const tip = treeTip(VFF, t, t.episodes.find((m) => m.n === n)!.episodeId, { reserve: [...reserve, k.call], ring: k.ring })!;
      expect([hit(tip.box, k.ring), hit(tip.box, k.call), reserve.some((r) => hit(tip.box, r)), inside(tip.box)], `${stepId} ${n}`).toEqual([false, false, false, true]);
    }
    const onRing: string[] = [];
    for (const g of [VFF, IMPL, PLAN]) {
      const tt = treeFor(g, 1200, 520, true, reserve);
      for (const w of tt.twigs) {
        const k = keep(tt, w.stepId);
        for (const m of tt.episodes) if (hit(treeTip(g, tt, m.episodeId, { reserve: [...reserve, k.call], ring: k.ring })!.box, k.ring)) onRing.push(`${w.stepId} ${m.n}`);
      }
    }
    expect(onRing).toEqual([]);
  });

  it('puts the callout beside the step, at its own height, where that is clear', () => {
    const beside = [VFF, IMPL, PLAN].flatMap((g) => {
      const tt = treeFor(g, 1200, 520, true, reserve);
      return tt.twigs.map((w) => treeCallout(tt, w.stepId, lines, reserve)!).filter((c) => c.leader[0].y === c.leader[1].y);
    });
    expect(beside.length).toBeGreaterThan(0);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const off = beside.filter((c) => Math.abs(c.y - (c.ring.y - 4)) > 0.11 || Math.abs(Math.abs(c.x - c.ring.x) - 24) > 0.11 || r1(Math.abs(c.leader[0].x - c.ring.x)) !== 10.3 || r1(Math.abs(c.leader[1].x - c.ring.x)) !== 18);
    expect(off.map((c) => c.stepId)).toEqual([]);
  });

  it('cuts a long summary with an ellipsis, and is undefined for a step the tree does not draw', () => {
    const c = treeCallout(t, 's41', ['x'.repeat(200), lines[1]], reserve)!;
    expect(c.lines[0].endsWith('…')).toBe(true);
    expect(textWidth(c.lines[0], 12, 500)).toBeLessThanOrEqual(360);
    expect(treeCallout(t, 'nope', lines)).toBeUndefined();
  });

  it('runs the highlighted path from the root through the limb to the step\'s branch', () => {
    expect(t.paths.s41?.map((p) => p.part)).toEqual(['trunk', 'limb:agent-ad0e51f3501a3ddc3', 'branch:e18']);
  });

  it('draws the highlighted trunk without the root flare: an 11px stub, as the canvas (305.6 to 294.4)', () => {
    const ys = (highlight(t, 's41')[0] ?? '').match(/-?[\d.]+/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(11.2, 0);
  });

  it('draws the highlighted limb and branch as wide as the ribbons they cover (no grey fringe), as the canvas (~9px)', () => {
    const [, limb, branch] = t.paths.s41!;
    for (const [i, p] of [[1, limb!], [2, branch!]] as const) {
      const r = t.ribbons.find((x) => x.id === p.part)!;
      expect(highlight(t, 's41')[i]).toBe(ribbonPath(r.line.slice(0, p.to + 1), r.widths.slice(0, p.to + 1)));
    }
    const r = t.ribbons.find((x) => x.id === limb!.part)!;
    expect(Math.max(...r.widths.slice(0, limb!.to + 1))).toBeGreaterThan(8);
  });
});

describe('treeCrop (phase 35: a session page trims the box to the drawing)', () => {
  const LEGEND: Box[] = [{ x0: 470, y0: 0, x1: 1200, y1: 24 }];
  const small = synthGraph([{ main: { kind: 'change', calls: 2 } }, { main: { kind: 'verify', calls: 1, failed: 1 } }]);
  const cases: [string, SessionGraph][] = [['verify-fail-fix', VFF], ['implementer-checks', IMPL], ['planner-pivot', PLAN], ['a small session', small]];

  it.each(cases)('keeps every mark and label of %s inside the window, under the legend, at least 240px tall', (_name, g) => {
    const t = treeFor(g, 1200, 520, true, LEGEND);
    const { y0, y1 } = treeCrop(t, LEGEND);
    expect(y1 - y0).toBeGreaterThanOrEqual(240);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(y1).toBeLessThanOrEqual(520);
    const boxes = [...t.labels, ...t.blocks.flatMap((b) => b.lines)].map(labelBox);
    expect(boxes.filter((b) => b.y0 < y0 || b.y1 > y1)).toEqual([]);
    for (const m of [...t.episodes, ...t.tips, t.root]) expect(m.at.y - m.r >= y0 + 24 && m.at.y + m.r <= y1).toBe(true);
    // Nothing drawn under the legend: the window's first 24px plus air stay clear.
    for (const r of t.ribbons) for (const p of r.line) expect(p.y).toBeGreaterThan(y0 + 24);
  });

  it('trims a small session well under the 520px box, deterministically', () => {
    const t = treeFor(small, 1200, 520, true, LEGEND);
    const win = treeCrop(t, LEGEND);
    expect(win.y1 - win.y0).toBeLessThan(520);
    expect(treeCrop(t, LEGEND)).toEqual(win);
  });
});

describe('legendKeys (phase 35: an opened session lists only what its tree draws)', () => {
  it('has every entry for verify-fail-fix', () => {
    expect([...legendKeys(VFF)].sort()).toEqual(['answer', 'change', 'command', 'discuss', 'explore', 'failed', 'thinking', 'verify', 'width'].sort());
  });

  it('leaves out kinds a session does not have', () => {
    const keys = legendKeys(synthGraph([{ main: { kind: 'change', calls: 2 } }], false));
    expect(keys.has('change')).toBe(true);
    expect(keys.has('command')).toBe(true);
    expect((['verify', 'explore', 'failed', 'thinking', 'answer'] as const).filter((k) => keys.has(k))).toEqual([]);
  });
});
