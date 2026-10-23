import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../shared/session/types';
import implementerChecks from '../sessions/samples/implementer-checks.graph.json';
import plannerPivot from '../sessions/samples/planner-pivot.graph.json';
import verifyFailFix from '../sessions/samples/verify-fail-fix.graph.json';
import { blazeName, countText, episodeName, jumpPattern, laneLines, laneName, move, navItems } from './keyboard';
import { glanceLayout, laneLayout, type LaneItem, type RouteEpisode } from './layout';

const g = verifyFailFix as unknown as SessionGraph;
const L = glanceLayout(g, 1216);
const items = navItems(L);

describe('map keyboard model (DESIGN §10.3)', () => {
  it('moves along the route, into a side trail and back, with dead ends doing nothing', () => {
    const [e0, e1] = L.episodes.map((r) => `ep:${r.episode.id}`);
    expect(move(items, e0 as string, 'ArrowRight', false)).toBe(e1);
    expect(move(items, e0 as string, 'ArrowLeft', false)).toBeUndefined();
    const lane = move(items, e0 as string, 'ArrowDown', false);
    expect(lane).toMatch(/^lane:/);
    expect(move(items, lane as string, 'ArrowUp', false)).toBe(e0);
    expect(move(items, lane as string, 'ArrowRight', false)).toMatch(/^(lane|blaze):/);
    // Vertical: ↓ along the route, → into the trail, ← back.
    expect(move(items, e0 as string, 'ArrowDown', true)).toBe(e1);
    expect(move(items, e0 as string, 'ArrowRight', true)).toBe(lane);
    expect(move(items, lane as string, 'ArrowLeft', true)).toBe(e0);
    expect(move(items, e0 as string, 'Home', false)).toBeUndefined();
    expect(move(items, e0 as string, 'End', false)).toBe(`ep:${L.episodes.at(-1)?.episode.id}`);
  });

  it('walks an expanded lane: ↓ into its episodes, ← → along them, Home/End, ↑ back to the lane', () => {
    const lane = L.lanes[0] as LaneItem;
    const sub = laneLayout(g, lane.lanes[0]?.id ?? '', 1216);
    if (!sub) throw new Error('no lane layout');
    const open = navItems(L, { lane: lane.id, L: sub });
    const eps = [...sub.episodes, ...(sub.answer ? [sub.answer] : [])].map((r) => `lep:${r.episode.id}`);
    expect(eps.length).toBeGreaterThan(1);
    expect(move(open, lane.id, 'ArrowDown', false)).toBe(eps[0]);
    expect(move(open, eps[0] as string, 'ArrowRight', false)).toBe(eps[1]);
    expect(move(open, eps[1] as string, 'End', false)).toBe(eps.at(-1));
    expect(move(open, eps[1] as string, 'ArrowUp', false)).toBe(lane.id);
    // Vertical: the lane's episodes follow the lane in the list.
    expect(move(open, lane.id, 'ArrowDown', true)).toBe(eps[0]);
    expect(move(open, lane.id, 'ArrowRight', true)).toBe(eps[0]);
    expect(move(open, eps[0] as string, 'ArrowLeft', true)).toBe(lane.id);
  });

  it('jumps through patterns in badge order and says when it wraps', () => {
    const two = { ...(implementerChecks as unknown as SessionGraph) };
    const P = glanceLayout({ ...two, trouble: [...two.trouble, ...(plannerPivot as unknown as SessionGraph).trouble.map((t) => ({ ...t, id: 'tx', stepIds: [two.steps.at(-1)?.id ?? ''] }))] }, 1216);
    expect(jumpPattern(L, undefined, 1)).toBeUndefined();
    const first = jumpPattern(P, undefined, 1);
    expect(first?.say).toBe('Pattern 1 of 2');
    const last = jumpPattern(P, first?.id, -1);
    expect(last?.say).toBe('Pattern 2 of 2, wrapped');
    expect(jumpPattern(P, last?.id, 1)?.say).toBe('Pattern 1 of 2, wrapped');
  });

  it('names items with kind, title, counts, status and patterns, the drawn label included', () => {
    const r = L.episodes[0];
    if (!r) throw new Error('no episode');
    expect(episodeName(L, r, 3)).toBe(`Episode 1 of 3, Delegate: Verify phase 12 ${countText(r)}, 33 min. subagent verifier, FAIL. No detected patterns.`);
    expect(laneName(L.lanes[0] as never)).toMatch(/^Subagent lane: verifier 35 calls · \d+ min · FAIL\. Verify phase 12\.$/);
    expect(laneName({ ...(L.lanes[0] as LaneItem), noHandBack: true })).toContain('FAIL, hand-back not recorded in the main session.');
    const I = glanceLayout(implementerChecks as unknown as SessionGraph, 1216);
    expect(blazeName(I, I.blazes[0] as never)).toMatch(/^Detected pattern 1 of 1: error streak, unresolved\. Error streak: .* In the main route, .+\.$/);
  });
});

describe('labels never cut a count or a status word (DM9)', () => {
  it('drops the idle note, then the unit, to fit the count line', () => {
    const r = { ...(L.episodes[0] as RouteEpisode), steps: 23, idle: ' · 12 min idle' };
    expect(countText(r)).toBe('23 steps · 12 min idle');
    expect(countText(r, 100)).toBe('23 steps');
    expect(countText(r, 30)).toBe('23');
  });

  it('drops the lane duration first, then "calls", and keeps the word whole', () => {
    const l = { ...(L.lanes[0] as LaneItem), calls: 35, ms: 20 * 60_000, word: 'changes requested' };
    expect(laneLines(l)).toMatchObject({ count: '35 calls · 20 min ·', word: 'changes requested' });
    expect(laneLines(l, { availPx: 260 }).count).toBe('35 calls ·');
    expect(laneLines(l, { availPx: 180 }).count).toBe('35 ·');
    expect(laneLines(l, { availPx: 40 })).toMatchObject({ count: '35 ·', word: 'changes requested' });
    expect(laneLines(l, { duration: false }).count).toBe('35 calls ·');
  });

  it('names a lane with the label as drawn, then the full facts (WCAG 2.5.3)', () => {
    const l = { ...(L.lanes[0] as LaneItem), lanes: [(L.lanes[0] as LaneItem).lanes[0]!], calls: 416, failed: 0, ms: 20 * 60_000, word: '5 failed', noHandBack: false };
    for (const opts of [{ availPx: 78 }, { availPx: 140 }, { duration: false }, {}]) {
      const { name, count, word } = laneLines(l, opts);
      const accessible = laneName(l, opts);
      expect(accessible).toContain(`${name} ${count} ${word}`);
      expect(accessible).toContain('416 calls · 20 min');
    }
    expect(laneName(l, { availPx: 78 })).toMatch(/^Subagent lane: \S+ 416 · 5 failed\. 416 calls · 20 min\. /);
    expect(laneName(l)).not.toMatch(/min\. 416 calls/);
  });
});
