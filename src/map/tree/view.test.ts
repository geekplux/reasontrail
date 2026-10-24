import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../../shared/session/types';
import implementer from '../../sessions/samples/implementer-checks.graph.json';
import planner from '../../sessions/samples/planner-pivot.graph.json';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
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
    expect(treeSummary(IMPL)).toBe('Tree: 12 episodes, 51 tool calls, 49 min, all by the main agent.');
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
        expect(tip.box.x0).toBeGreaterThanOrEqual(0);
        expect(tip.box.x1).toBeLessThanOrEqual(1200);
        expect(tip.box.y1).toBeLessThanOrEqual(520);
        expect(textWidth(tip.title, 14, 500)).toBeLessThanOrEqual(360);
      }
    }
    expect(treeTip(PLAN, treeFor(PLAN, 1200, 520), 'e6')?.title).toMatch(/…$/);
  });

  it('is undefined for an id the tree does not draw', () => {
    expect(treeTip(VFF, t, 'nope')).toBeUndefined();
  });
});
