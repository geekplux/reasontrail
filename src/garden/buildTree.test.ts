import { describe, expect, it } from 'vitest';
import lighthouse from '../samples/lighthouse.json';
import type { SampleGarden } from '../samples/types';
import { buildTree, defaultExpanded, flattenBranches, mostLikelyPath, pathTo } from './buildTree';

const sample = lighthouse as SampleGarden;

describe('lighthouse fixture', () => {
  it('is a valid hand-checked schemaVersion 1 garden', () => {
    expect(sample.schemaVersion).toBe(1);
    expect(sample.nodes['']?.map((c) => c.token)).toEqual([' looked', ' entered', ' turned', ' the', ' stood']);
    for (const list of Object.values(sample.nodes)) {
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(sample.k);
      const lps = list.map((c) => c.logprob);
      expect(lps.every((lp) => lp <= 0)).toBe(true);
      expect([...lps].sort((a, b) => b - a)).toEqual(lps);
      expect(lps.reduce((s, lp) => s + Math.exp(lp), 0)).toBeLessThanOrEqual(1 + 1e-3);
    }
  });
});

describe('buildTree', () => {
  it('always opens the root and derives keys, probabilities and states', () => {
    const t = buildTree(sample, new Set());
    expect(t.prompt).toBe(sample.prompt);
    expect(t.children.map((b) => b.key)).toEqual([' looked', ' entered', ' turned', ' the', ' stood']);
    expect(t.children[0]?.p).toBeCloseTo(Math.exp(-2.417), 10);
    expect(t.children.map((b) => b.state)).toEqual(['expandable', 'expandable', 'not-recorded', 'not-recorded', 'not-recorded']);
    expect(t.children.every((b) => b.children.length === 0 && b.depth === 1)).toBe(true);
  });

  it('opens expanded recorded keys with parentKey + token children', () => {
    const t = buildTree(sample, new Set([' looked']));
    const looked = t.children[0]!;
    expect(looked.state).toBe('expanded');
    expect(looked.children.map((b) => b.key)).toEqual([
      ' looked out',
      ' looked around',
      ' looked at',
      ' looked up',
      ' looked down',
    ]);
    expect(looked.children.every((b) => b.depth === 2 && b.state === 'not-recorded')).toBe(true);
    expect(flattenBranches(t)).toHaveLength(10);
    expect(looked.children[0]?.pathP).toBeCloseTo(Math.exp(-2.417 - 1.2), 12);
  });

  it('finds the visible path to a key and the most likely continuation', () => {
    const t = buildTree(sample, new Set([' looked']));
    expect(pathTo(t, ' looked up').map((b) => b.token)).toEqual([' looked', ' up']);
    expect(pathTo(t, ' entered the')).toEqual([]); // not visible: ' entered' is closed
    expect(pathTo(t, ' nowhere')).toEqual([]);
    expect(mostLikelyPath(t).map((b) => b.key)).toEqual([' looked', ' looked out']);
  });

  it('ignores expanded keys that are not recorded', () => {
    const t = buildTree(sample, new Set([' stood']));
    expect(t.children[4]?.state).toBe('not-recorded');
    expect(flattenBranches(t)).toHaveLength(5);
  });
});

describe('defaultExpanded', () => {
  it('opens the most probable recorded child (D11)', () => {
    expect([...defaultExpanded(sample)]).toEqual([' looked']);
  });
});
