import { describe, expect, it } from 'vitest';
import tiny from '../test/fixtures/tiny-garden.json';
import { samples } from '.';
import type { SampleGarden } from './types';

// Structural checks until Phase 6 adds src/samples/validate.ts (docs/llm-provider.md §4).
describe.each([...samples, tiny as SampleGarden].map((s) => [s.id, s] as const))('%s garden', (_id, sample) => {
  it('is a valid schemaVersion 1 garden', () => {
    expect(sample.schemaVersion).toBe(1);
    expect(sample.nodes['']).toBeDefined();
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
