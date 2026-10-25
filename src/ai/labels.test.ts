import { describe, expect, it } from 'vitest';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import { episodeOfStep, episodeTags, listTags, tagName } from './labels';

// main: e0 (s0, s1), e1 (s2 spawns lane "sub" with s5, s6; e1b is a folded child), e2 (s3, s4: the answer).
const g = {
  lanes: [{ id: 'main' }, { id: 'sub', spawnedBy: 's2' }],
  episodes: [
    { id: 'e0', laneId: 'main', stepIds: ['s0', 's1'] },
    { id: 'e1', laneId: 'main', stepIds: ['s2'] },
    { id: 'e1b', laneId: 'main', parentId: 'e1', stepIds: ['s2'] },
    { id: 'e2', laneId: 'main', stepIds: ['s3', 's4'] },
    { id: 'l0', laneId: 'sub', stepIds: ['s5', 's6'] },
  ],
  steps: ['main', 'main', 'main', 'main', 'main', 'sub', 'sub'].map((laneId, seq) => ({ id: `s${seq}`, seq, laneId, kind: 'assistant' })),
} as unknown as SessionGraph;

const overlay: LabelOverlay = {
  model: 'fake-model',
  createdAt: '',
  labels: [
    { stepId: 's0', label: 'sub-question', confidence: 0.9 },
    { stepId: 's1', label: 'hypothesis', confidence: 0.6 },
    { stepId: 's5', label: 'evidence', confidence: 0.8 },
    { stepId: 's6', label: 'evidence', confidence: 0.8 },
    { stepId: 's2', label: 'decision', confidence: 0.7 },
    { stepId: 's4', label: 'answer', confidence: 0.9 },
    { stepId: 'nope', label: 'answer', confidence: 0.9 },
  ],
  links: [{ claimStepId: 's4', supportStepIds: ['s6', 's1', 's3', 'nope', 's4'] }],
};

describe('AI labels overlay', () => {
  it('maps steps to their top-level main episode; a subagent step to the episode that spawned it', () => {
    const of = episodeOfStep(g);
    expect(['s0', 's2', 's4', 's5', 'nope'].map(of)).toEqual(['e0', 'e1', 'e2', 'e1', undefined]);
  });

  it('tags each episode with its most conclusive label; the text keeps all of them with counts', () => {
    const tags = episodeTags(g, overlay);
    expect(tags.get('e0')).toEqual({ label: 'hypothesis', others: 1, text: 'hypothesis (1 step), sub-question (1 step)' });
    expect(tags.get('e1')).toEqual({ label: 'decision', others: 1, text: 'decision (1 step), evidence (2 steps)' });
    expect(tags.get('e2')?.label).toBe('answer');
    expect(tags.size).toBe(3);
  });

  it('names the model on every tag (X3)', () => {
    const tag = episodeTags(g, overlay).get('e2');
    expect(tag && tagName(tag, overlay.model)).toBe('AI title, suggested by fake-model: answer (1 step)');
  });

  it("tags the list's and the tree's episodes of every lane, a subagent's steps in their own episode", () => {
    const tags = listTags(g, overlay);
    expect([...tags.keys()].sort()).toEqual(['e0', 'e1', 'e2', 'l0']);
    expect(tags.get('e1')).toEqual({ label: 'decision', others: 0, text: 'decision (1 step)' });
    expect(tags.get('l0')?.label).toBe('evidence');
  });
});
