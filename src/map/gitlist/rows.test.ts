import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../../shared/session/types';
import implementer from '../../sessions/samples/implementer-checks.graph.json';
import planner from '../../sessions/samples/planner-pivot.graph.json';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
import { GEO, STEP_ROWS_MAX, episodeSteps, layoutList, listRows, shortTitle, type EpisodeRow, type ListRow, type VerdictRow } from './rows';

const VFF = vff as unknown as SessionGraph;
const IMPL = implementer as unknown as SessionGraph;
const PLAN = planner as unknown as SessionGraph;
const shape = (rows: ListRow[]) => rows.map((r) => (r.kind === 'episode' ? `${r.main ? 'M' : 'S'}${r.n}` : r.kind === 'verdict' ? `V:${r.text}` : r.kind === 'lane' ? `L:${r.name}` : 'end'));

describe('listRows (v7 §6)', () => {
  it('verify-fail-fix: three subagent lanes in order, each forking with its episodes and merging after its verdict', () => {
    const rows = listRows(VFF);
    expect(shape(rows)).toEqual([
      'L:Main agent',
      'L:Verify phase 12', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'V:Failed: 1 gap',
      'L:Fix phase 12 audit gap', 'S10', 'S11', 'S12', 'V:Committed cceb2d5',
      'L:Re-verify phase 12', 'S14', 'S15', 'S16', 'S17', 'S18', 'V:Passed',
      'end',
    ]);
    const lane = rows[1];
    expect(lane).toMatchObject({ kind: 'lane', agent: 'Verifier', steps: 96, at: '0 min' });
    const ep = (n: number) => rows.find((r): r is EpisodeRow => r.kind === 'episode' && r.n === n)!;
    expect(ep(6)).toMatchObject({ glyph: 'explore', title: 'Read redact.test.ts +8 more', failed: 1, steps: 28, at: '16 min' });
    expect(ep(6).wait).toBeUndefined();
    expect([ep(4).wait, ep(7).wait, ep(12).wait]).toEqual(['14 min wait', '15 min wait', '11 min wait']);
    expect(rows.filter((r) => r.kind === 'episode' && r.failed > 0).map((r) => (r as EpisodeRow).n)).toEqual([6]);
    expect(ep(10).title).toBe('Fix exactly this verifier problem for Phase 12');
    const verdicts = rows.filter((r): r is VerdictRow => r.kind === 'verdict');
    expect(verdicts.map((v) => [v.tone, v.dur, v.steps, v.at])).toEqual([['fail', '33 min', 1, '33 min'], ['commit', '12 min', 1, '46 min'], ['ok', '1 min', 1, '47 min']]);
    expect(rows.at(-1)).toMatchObject({ kind: 'end', at: '47 min' });
  });

  it('implementer-checks: one lane, every episode on the main rail, the answer as the last episode', () => {
    const rows = listRows(IMPL);
    expect(shape(rows)).toEqual(['L:Main agent', ...Array.from({ length: 12 }, (_, i) => `M${i + 1}`), 'end']);
    expect(rows.at(-2)).toMatchObject({ glyph: 'answer', title: 'Answer', at: '49 min' });
    expect(rows[1]).toMatchObject({ title: 'Build Phase 5: Keyboard navigation and screen-reader alternative', glyph: 'discuss' });
    expect(rows.at(-1)).toMatchObject({ at: '49 min' });
  });

  it('planner-pivot: main episodes between two planner runs; the errored run gets the orange verdict', () => {
    const rows = listRows(PLAN);
    expect(shape(rows)).toEqual(['L:Main agent', 'M1', 'M2', 'L:Rewrite plan for pivot', 'S3', 'S4', 'V:Failed', 'M5', 'L:Rewrite plan for pivot', 'S6', 'S7', 'S8', 'V:Done', 'M10', 'end']);
    const [errored, ok] = rows.filter((r): r is VerdictRow => r.kind === 'verdict');
    expect(errored).toMatchObject({ tone: 'fail', text: 'Failed' });
    expect(errored?.episodeId).toBeUndefined();
    expect(errored?.dur).toBeUndefined(); // failed at once: no "after 0 min"
    expect(ok).toMatchObject({ tone: 'done', episodeId: 'e11' });
    expect(rows[1]).toMatchObject({ title: 'Change request from the maintainer' });
  });

  it('shortens recorded requests to a title', () => {
    expect(shortTitle('Re-verify Phase 12 of Reasontrail (/workspace/gx-projects/token-garden, branch …')).toBe('Re-verify Phase 12');
    expect(shortTitle('Build Phase 5: Keyboard navigation and screen-reader alternative of token-garde…')).toBe('Build Phase 5: Keyboard navigation and screen-reader alternative');
    expect(shortTitle('Read PLAN.md')).toBe('Read PLAN.md');
  });
});

describe('episodeSteps', () => {
  it('lists the failed episode: tool calls and thinking, results folded in, "Bash " dropped', () => {
    const steps = episodeSteps(VFF, 'e18');
    expect(steps).toHaveLength(18);
    expect(steps[0]).toMatchObject({ stepId: 's41', mark: 'failed', label: 'Inspect vitest config for log suppression', exit: 'Exit 2', at: '16 min' });
    expect(steps[1]).toMatchObject({ mark: 'call', exit: 'Exit 0' });
    expect(steps[2]).toMatchObject({ mark: 'thinking', label: 'Thinking' });
    expect(steps.filter((s) => s.mark === 'failed')).toHaveLength(1);
  });

  it('times steps from the first timestamped step when the source has no start, like the episode rows', () => {
    const g = structuredClone(IMPL);
    delete g.source.startedAt;
    const ep = listRows(g).find((r): r is EpisodeRow => r.kind === 'episode' && r.episodeId === 'e10')!;
    expect(ep.at).toBe(listRows(IMPL).find((r): r is EpisodeRow => r.kind === 'episode' && r.episodeId === 'e10')!.at);
    const steps = episodeSteps(g, 'e10');
    expect(steps.map((s) => s.at)).toEqual(episodeSteps(IMPL, 'e10').map((s) => s.at));
    expect(steps[0]?.at).toMatch(/^\d+ min$/);
  });

  it('marks an episode with nothing to list as a leaf', () => {
    expect(listRows(IMPL).filter((r): r is EpisodeRow => r.kind === 'episode' && r.leaf === true).map((r) => r.episodeId)).toEqual(['e11']);
  });
});

describe('layoutList (gitlist.mjs geometry)', () => {
  it('matches the canvas heights: 1136 collapsed, 1682 with episode 6 open', () => {
    const rows = listRows(VFF);
    expect(layoutList(rows).height).toBe(1136);
    const open = layoutList(rows, { episodeId: 'e18', steps: episodeSteps(VFF, 'e18') }, 'step:s41');
    expect(open.height).toBe(1136 + 18 * GEO.step + GEO.stepsGap);
    expect(open.height).toBe(1682);
  });

  it('forks at each lane row, merges after each verdict, and dots the main rail while a subagent runs', () => {
    const L = layoutList(listRows(VFF));
    expect(L.root).toEqual({ x: 4.5, y: 52 });
    expect(L.forks.map((f) => f.y)).toEqual([92, 560, 804]);
    expect(L.rails.filter((r) => r.cls === 'r-wait')).toHaveLength(3);
    expect(L.rails.filter((r) => r.cls === 'r-sub' && r.d.includes('C4.5'))).toHaveLength(3); // the merges
    expect(L.end.y).toBe(1116);
    expect(L.highlight).toEqual([]);
  });

  it('draws the blue path from the root through the fork to the selected step', () => {
    const rows = listRows(VFF);
    const steps = episodeSteps(VFF, 'e18');
    const L = layoutList(rows, { episodeId: 'e18', steps }, 'step:s41');
    const s41 = L.placed.find((p) => p.row.kind === 'step' && p.row.stepId === 's41')!;
    expect(s41.x).toBe(28.5);
    expect(L.highlight).toEqual(['M4.5 52.0V92.0', 'M4.5 92.0C4.5 106.0 28.5 100.0 28.5 114.0', `M28.5 114.0V${s41.cy.toFixed(1)}`]);
  });

  it('a main-lane episode keeps its steps on the main rail', () => {
    const rows = listRows(IMPL);
    const L = layoutList(rows, { episodeId: 'e0', steps: episodeSteps(IMPL, 'e0') }, 'ep:e0');
    expect(L.placed.filter((p) => p.row.kind === 'step').every((p) => p.x === 4.5)).toBe(true);
    expect(L.highlight).toEqual(['M4.5 52.0V92.0']);
    expect(STEP_ROWS_MAX).toBe(20);
  });
});
