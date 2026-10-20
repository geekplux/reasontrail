import { describe, expect, it } from 'vitest';
import { defaultSample, samples } from '.';
import type { SampleGarden } from './types';
import { isSampleGarden, sampleProblems } from './validate';

/** Every JSON file as bytes on disk (raw), so the size budget is checked on the committed text. */
const read = (files: Record<string, string>) =>
  Object.entries(files).map(([path, raw]) => ({
    f: path.split('/').pop()!,
    size: new TextEncoder().encode(raw).length,
    data: JSON.parse(raw) as SampleGarden,
  }));
const recorded = read(import.meta.glob<string>('./*.json', { eager: true, query: '?raw', import: 'default' }));
const fixtures = read(import.meta.glob<string>('../test/fixtures/*.json', { eager: true, query: '?raw', import: 'default' }));

/** Depth (tokens after the prompt) of every recorded key reachable from the root. */
function depths(s: SampleGarden): Map<string, number> {
  const depth = new Map([['', 0]]);
  for (const [key, d] of depth) {
    for (const c of s.nodes[key] ?? []) if (Object.hasOwn(s.nodes, key + c.token)) depth.set(key + c.token, d + 1);
  }
  return depth;
}

describe.each([...recorded, ...fixtures].map((x) => [x.f, x.data] as const))('%s', (_f, data) => {
  it('is a valid schemaVersion 1 garden', () => {
    expect(sampleProblems(data)).toEqual([]);
    expect(isSampleGarden(data)).toBe(true);
  });
});

describe.each(recorded.map((x) => [x.f, x] as const))('recorded %s (recording policy)', (f, { size, data }) => {
  it('is bundled, named after its id, <= 15 KB, depth 2 fully grown and 2 spines to depth 6', () => {
    expect(f).toBe(`${data.id}.json`);
    expect(samples.map((s) => s.id)).toContain(data.id);
    expect(size).toBeLessThanOrEqual(15 * 1024);
    const depth = depths(data);
    expect(depth.size).toBe(Object.keys(data.nodes).length); // no orphan keys
    expect(depth.size).toBeGreaterThanOrEqual(31);
    const atDepth = (d: number) => [...depth.values()].filter((x) => x === d).length;
    expect([atDepth(0), atDepth(1), atDepth(2)]).toEqual([1, data.k, data.k * data.k]);
    expect(atDepth(6)).toBe(2);
  });
});

it('bundles six recorded gardens, lighthouse first and default', () => {
  expect(samples).toHaveLength(6);
  expect(recorded).toHaveLength(6);
  expect(defaultSample.id).toBe('lighthouse');
  expect(new Set(samples.map((s) => s.id)).size).toBe(6);
});

describe('sampleProblems', () => {
  const ok = fixtures[0]!.data;
  it.each([
    ['not an object', null, 'not an object'],
    ['version', { ...ok, schemaVersion: 2 }, 'schemaVersion is not 1'],
    ['long prompt', { ...ok, prompt: 'x'.repeat(281) }, 'prompt is not 1-280 chars'],
    ['no root', { ...ok, nodes: { ' a': [{ token: 'b', logprob: -1 }] } }, 'root "" is missing'],
    ['too wide', { ...ok, k: 1 }, 'nodes[""] is not a list of 1-1 choices'],
    ['empty list', { ...ok, nodes: { '': [] } }, `nodes[""] is not a list of 1-${ok.k} choices`],
    ['positive', { ...ok, nodes: { '': [{ token: 'a', logprob: 0.1 }] } }, 'nodes[""] has a choice without a token or with logprob > 0'],
    ['unsorted', { ...ok, nodes: { '': [{ token: 'a', logprob: -2 }, { token: 'b', logprob: -1 }] } }, 'nodes[""] is not sorted by logprob, descending'],
    ['mass > 1', { ...ok, nodes: { '': [{ token: 'a', logprob: -0.1 }, { token: 'b', logprob: -0.2 }] } }, 'nodes[""] has probabilities summing above 1'],
  ])('rejects %s', (_name, data, problem) => {
    expect(sampleProblems(data)).toContain(problem);
    expect(isSampleGarden(data)).toBe(false);
  });
});
