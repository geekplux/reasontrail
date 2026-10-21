import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../shared/session/types';
import verifyFailFix from '../sessions/samples/verify-fail-fix.graph.json';
import { blazeName, countText, episodeName, jumpPattern, laneName, move, navItems } from './keyboard';
import { glanceLayout } from './layout';

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

  it('jumps through patterns in badge order and says when it wraps', () => {
    const first = jumpPattern(L, undefined, 1);
    expect(first?.say).toBe('Pattern 1 of 3');
    const last = jumpPattern(L, first?.id, -1);
    expect(last?.say).toBe('Pattern 3 of 3, wrapped');
    expect(jumpPattern(L, last?.id, 1)?.say).toBe('Pattern 1 of 3, wrapped');
  });

  it('names items with kind, title, counts, status and patterns, the drawn label included', () => {
    const r = L.episodes[0];
    if (!r) throw new Error('no episode');
    expect(episodeName(L, r, 3)).toBe(`Episode 1 of 3, delegate: Delegate: Verify phase 12 ${countText(r)}, 33 min. subagent verifier, FAIL. 3 detected patterns.`);
    expect(laneName(L.lanes[0] as never)).toMatch(/^Subagent lane: verifier 35 calls · \d+ min · FAIL\. Verify phase 12\.$/);
    expect(blazeName(L, L.blazes[0] as never)).toMatch(/^Detected pattern 1 of 3: churn, resolved\. Churn: .* In verifier, Delegate: Verify phase 12\.$/);
  });
});
