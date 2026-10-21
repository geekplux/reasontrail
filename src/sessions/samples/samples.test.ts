// Phase 15 AC1: every committed session sample is valid, small, shows trouble (a detected pattern or a failed subagent verdict), carries an `expect` block (M2), and
// at least one has a subagent lane. Also checks the index against tools/session-samples.json.
import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../../shared/session/types';
import { laneStatus } from '../../map/layout';
import { loadGraph } from '../../map/loadGraph';
import { defaultSessionGraph, sessionSamples } from './index';
import config from '../../../tools/session-samples.json';
import { validateSessionGraph } from './validate';

const raw = import.meta.glob<string>('./*.graph.json', { eager: true, query: '?raw', import: 'default' });
const files = Object.keys(raw).map((k) => k.slice(2)).sort();
const text = (name: string) => raw[`./${name}`] ?? '';

describe('session samples', () => {
  it('lists 3–5 samples, one file each, in the order and with the titles of tools/session-samples.json', () => {
    expect(config.samples.length).toBeGreaterThanOrEqual(3);
    expect(config.samples.length).toBeLessThanOrEqual(5);
    expect(sessionSamples.map((s) => [s.id, s.title, s.displayTitle])).toEqual(config.samples.map((s) => [s.id, s.title, s.displayTitle]));
    expect(files).toEqual(config.samples.map((s) => `${s.id}.graph.json`).sort());
  });

  it.each(files)('%s is a valid graph within the limits, with a matching expect block', (name) => {
    const g = JSON.parse(text(name)) as SessionGraph;
    expect(validateSessionGraph(g)).toEqual([]);
    expect(new TextEncoder().encode(text(name)).length).toBeLessThanOrEqual(250 * 1024);
    expect(g.steps.length).toBeLessThanOrEqual(400);
    expect(g.trouble.length > 0 || g.lanes.some((l) => laneStatus(g, l).status === 'error')).toBe(true);
    expect(g.expect).toBeDefined();
    expect(g.displayTitle).toBe(config.samples.find((s) => `${s.id}.graph.json` === name)?.displayTitle);
    expect(loadGraph(JSON.stringify({ graph: g, meta: { version: '0.0.0' } })).ok).toBe(true);
  });

  it('has at least one sample with a subagent lane', () => {
    const lanes = files.map((f) => (JSON.parse(text(f)) as SessionGraph).lanes.length);
    expect(Math.max(...lanes)).toBeGreaterThan(1);
  });

  it('bundles the first sample and lazy-loads the rest', async () => {
    expect(defaultSessionGraph.expect).toBeDefined();
    const loaded = await Promise.all(sessionSamples.map((s) => s.load()));
    expect(loaded[0]).toBe(defaultSessionGraph);
    for (const g of loaded) expect(validateSessionGraph(g)).toEqual([]);
  });

  it('flags a broken graph', () => {
    const g = structuredClone(defaultSessionGraph);
    g.steps[1]!.laneId = 'nowhere';
    g.edges.push({ from: 's5', to: 's2', kind: 'next' });
    if (g.expect) g.expect.trouble += 1;
    g.displayTitle = 'x'.repeat(65);
    expect(validateSessionGraph(g)).toEqual(expect.arrayContaining(['s1: unknown lane nowhere', 'edge s5->s2 next', 'expect.trouble differs from trouble.length', 'displayTitle empty or too long']));
  });
});
