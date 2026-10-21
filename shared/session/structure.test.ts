import { describe, expect, it } from 'vitest';
import { BATCH_MAX_STEPS, buildBatches, mergeOverlay, SESSION_MAX_BATCHES, type StructureResponse } from './structure';
import type { SessionGraph, Step } from './types';

const step = (i: number, over: Partial<Step> = {}): Step => ({ id: `s${i}`, seq: i, laneId: 'main', kind: 'assistant', text: `thought ${i}`, raw: { file: 'a.jsonl', line: i + 1 }, ...over });
/** A step without text. */
const bare = (s: Step): Step => {
  delete s.text;
  return s;
};
const graph = (steps: Step[]) => ({ schemaVersion: 1, title: 't', lanes: [], steps, edges: [], episodes: [], trouble: [] }) as unknown as SessionGraph;

describe('buildBatches (X1, X2)', () => {
  it('splits into batches of at most 200 and caps a session at 5, keeping its first and last halves', () => {
    const batches = buildBatches(graph(Array.from({ length: 1500 }, (_, i) => step(i))));
    expect(batches).toHaveLength(SESSION_MAX_BATCHES);
    expect(batches.every((b) => b.steps.length === BATCH_MAX_STEPS)).toBe(true);
    const ids = batches.flatMap((b) => b.steps.map((s) => s.id));
    expect([ids[0], ids[499], ids[500], ids.at(-1)]).toEqual(['s0', 's499', 's1000', 's1499']);
  });

  it('summarises each kind on one line and skips steps with nothing to say', () => {
    const [batch] = buildBatches(
      graph([
        step(0, { kind: 'user', text: 'Fix the\n\n  build' }),
        bare(step(1, { kind: 'tool-call', tool: { name: 'Bash', category: 'run', summary: 'Run pnpm test', files: [] } })),
        step(2, { kind: 'tool-result', text: 'Exit code 1', status: 'error' }),
        bare(step(3, { kind: 'thinking', textStored: false })),
        step(4, { kind: 'system', text: 'meta record' }),
        step(5, { kind: 'assistant', text: '   ' }),
      ]),
    );
    expect(batch?.steps).toEqual([
      { id: 's0', kind: 'user', text: 'Fix the build' },
      { id: 's1', kind: 'tool-call', text: 'Run pnpm test' },
      { id: 's2', kind: 'tool-result', text: 'error: Exit code 1' },
    ]);
    expect(buildBatches(graph([]))).toEqual([]);
  });
});

describe('mergeOverlay (D22: a separate overlay)', () => {
  const answer = (over: Partial<StructureResponse>): StructureResponse => ({ model: 'm1', cached: false, labels: [], links: [], ...over });

  it('newer labels win per step, supports merge per claim, and the overlay names its model', () => {
    const one = mergeOverlay(undefined, answer({ labels: [{ stepId: 's1', label: 'hypothesis', confidence: 0.5 }], links: [{ claimStepId: 's3', supportStepIds: ['s1'] }] }), 'T1');
    const two = mergeOverlay(one, answer({ labels: [{ stepId: 's1', label: 'dead end', confidence: 0.7 }, { stepId: 's2', label: 'evidence', confidence: 0.9 }], links: [{ claimStepId: 's3', supportStepIds: ['s2', 's1'] }] }), 'T2');
    expect(two).toEqual({
      model: 'm1',
      createdAt: 'T2',
      labels: [{ stepId: 's1', label: 'dead end', confidence: 0.7 }, { stepId: 's2', label: 'evidence', confidence: 0.9 }],
      links: [{ claimStepId: 's3', supportStepIds: ['s1', 's2'] }],
    });
    expect(one.labels).toHaveLength(1); // the input overlay is not changed
  });

  it('an answer from another model replaces the overlay', () => {
    const one = mergeOverlay(undefined, answer({ labels: [{ stepId: 's1', label: 'answer', confidence: 1 }] }), 'T1');
    expect(mergeOverlay(one, answer({ model: 'm2' }), 'T2')).toEqual({ model: 'm2', createdAt: 'T2', labels: [], links: [] });
  });
});
