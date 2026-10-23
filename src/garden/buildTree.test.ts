import { describe, expect, it } from 'vitest';
import type { SampleGarden } from '../samples/types';
import tiny from '../test/fixtures/tiny-garden.json';
import { buildTree, defaultExpanded, flattenBranches, mostLikelyPath, pathTo } from './buildTree';

const sample = tiny as SampleGarden;

describe('buildTree', () => {
  it('always opens the root and derives keys, probabilities and states', () => {
    const t = buildTree(sample, new Set());
    expect(t.prompt).toBe(sample.prompt);
    expect(t.children.map((b) => b.key)).toEqual([' mat', ' sofa', ' roof']);
    expect(t.children[0]?.p).toBeCloseTo(Math.exp(-1.05), 10);
    expect(t.children.map((b) => b.state)).toEqual(['expandable', 'expandable', 'not-recorded']);
    expect(t.children.every((b) => b.children.length === 0 && b.depth === 1)).toBe(true);
  });

  it('opens expanded recorded keys with parentKey + token children', () => {
    const t = buildTree(sample, new Set([' mat']));
    const mat = t.children[0]!;
    expect(mat.state).toBe('expanded');
    expect(mat.children.map((b) => b.key)).toEqual([' mat and', ' mat.', ' mat by']);
    expect(mat.children.map((b) => b.state)).toEqual(['expandable', 'not-recorded', 'not-recorded']);
    expect(mat.children.every((b) => b.depth === 2)).toBe(true);
    expect(flattenBranches(t)).toHaveLength(6);
    expect(mat.children[0]?.pathP).toBeCloseTo(Math.exp(-1.05 - 0.69), 12);
  });

  it('finds the visible path to a key and the most likely continuation', () => {
    const t = buildTree(sample, new Set([' mat']));
    expect(pathTo(t, ' mat by').map((b) => b.token)).toEqual([' mat', ' by']);
    expect(pathTo(t, ' sofa and')).toEqual([]); // not visible: ' sofa' is closed
    expect(pathTo(t, ' nowhere')).toEqual([]);
    expect(mostLikelyPath(t).map((b) => b.key)).toEqual([' mat', ' mat and']);
  });

  it('ignores expanded keys that are not recorded', () => {
    const t = buildTree(sample, new Set([' roof']));
    expect(t.children[2]?.state).toBe('not-recorded');
    expect(flattenBranches(t)).toHaveLength(3);
  });
});

describe('defaultExpanded', () => {
  it('opens the most probable recorded child (D11)', () => {
    expect([...defaultExpanded(sample)]).toEqual([' mat']);
  });
});
