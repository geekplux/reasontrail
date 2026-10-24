import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../../shared/session/types';
import implementer from '../../sessions/samples/implementer-checks.graph.json';
import planner from '../../sessions/samples/planner-pivot.graph.json';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
import { boxesHit } from './labels';
import { textWidth } from './text';
import { treeFor, treeSummary, treeTip } from './view';

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
    const d = Math.hypot(Math.max(tip.box.x0 - m.at.x, 0, m.at.x - tip.box.x1), Math.max(tip.box.y0 - m.at.y, 0, m.at.y - tip.box.y1));
    expect(d).toBeLessThanOrEqual(Math.hypot(16, 10) + 0.1);
    expect(inBox(tip.box, m.at, m.r + 3)).toBe(false);
    expect(boxesHit(tip.box, tp.blocks.find((b) => b.laneId === m.laneId)!.box)).toBe(false);
  });

  it('is undefined for an id the tree does not draw', () => {
    expect(treeTip(VFF, t, 'nope')).toBeUndefined();
  });
});
