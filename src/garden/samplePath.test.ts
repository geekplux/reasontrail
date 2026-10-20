import { describe, expect, it } from 'vitest';
import type { SampleGarden } from '../samples/types';
import tiny from '../test/fixtures/tiny-garden.json';
import { DEPTH_CAP, forksOf, mulberry32, samplePath } from './samplePath';

const { nodes } = tiny as SampleGarden;

describe('samplePath', () => {
  it('mulberry32 is seeded and uniform-ish in [0, 1)', () => {
    const [a, b] = [mulberry32(7), mulberry32(7)];
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length - 0.5)).toBeLessThan(0.05);
  });

  it('gives the same path for the same (nodes, T, seed)', () => {
    for (const seed of [1, 7, 42, 9999]) expect(samplePath(nodes, 1.5, seed)).toEqual(samplePath(nodes, 1.5, seed));
  });

  it('follows the rank-0 chain at T = 0 and stops where the recording ends', () => {
    const s = samplePath(nodes, 0, 3);
    expect(s.keys[0]).toBe(' mat');
    expect(s.keys[1]).toBe(' mat and');
    expect(s.stop).toBe('not-recorded');
    expect(Object.hasOwn(nodes, s.keys.at(-1)!)).toBe(false);
    expect(forksOf(s)).toEqual(s.keys.slice(0, -1));
  });

  it('stops on a draw outside the top-k and reports the remainder', () => {
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find((n) => samplePath(nodes, 2, n).stop === 'other')!;
    const s = samplePath(nodes, 2, seed);
    expect(s.otherP).toBeGreaterThan(0);
    expect(forksOf(s)).toEqual(s.keys);
  });

  it('stops at the depth cap', () => {
    const deep = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['a'.repeat(i), [{ token: 'a', logprob: 0 }]]));
    const s = samplePath(deep, 1, 1);
    expect(s).toMatchObject({ stop: 'depth-cap', p: 1 });
    expect(s.keys).toHaveLength(DEPTH_CAP);
  });
});
