import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../shared/session/types';
import lensPrompts from '../../tools/record-samples/lens-prompts.json';
import { RecordedProvider } from '../llm/recordedProvider';
import type { SampleGarden } from '../samples/types';
import { sampleProblems } from '../samples/validate';
import { sessionSamples } from '../sessions/samples';
import { findLensSample, lensSamples, lensSamplesFor, loadLensGarden } from './lensSamples';

const raw = import.meta.glob<string>('./samples/*.json', { eager: true, query: '?raw', import: 'default' });
const files = Object.entries(raw).map(([path, text]) => ({ id: path.split('/').pop()!.replace(/\.json$/, ''), text }));

describe('lens samples', () => {
  it('has two sentences for each website sample, one garden file each, and nothing extra', () => {
    for (const s of sessionSamples) expect(lensSamples.filter((l) => l.sampleId === s.id)).toHaveLength(2);
    expect(lensSamples.map((l) => l.gardenId).sort()).toEqual(files.map((f) => f.id).sort());
    expect(lensPrompts.map((p) => p.id).sort()).toEqual(files.map((f) => f.id).sort());
  });

  it.each(files)('$id is a valid garden of at most 15 KB', ({ id, text }) => {
    const g = JSON.parse(text) as SampleGarden;
    expect(sampleProblems(g)).toEqual([]);
    expect(g.id).toBe(id);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(15 * 1024);
    expect(g.prompt).toBe(lensPrompts.find((p) => p.id === id)?.prompt);
  });

  it.each(lensSamples)('$gardenId: the sentence is verbatim in its assistant step and starts with the prompt', async (l) => {
    const graph: SessionGraph = await sessionSamples.find((s) => s.id === l.sampleId)!.load();
    const step = graph.steps.find((s) => s.id === l.stepId);
    expect(step?.kind).toBe('assistant');
    expect(step?.text).toContain(l.sentence);
    const garden = await loadLensGarden(l.gardenId);
    expect(l.sentence.startsWith(garden.prompt)).toBe(true);
    expect(garden.prompt.length).toBeLessThanOrEqual(200);
    expect(await new RecordedProvider(garden).nextTokens(garden.prompt, 5)).toHaveLength(5);
  });

  it('finds sentences by step and rejects unknown gardens', async () => {
    expect(lensSamplesFor('planner-pivot', 's108').map((l) => l.gardenId)).toEqual(['lens-planner-pivot-2']);
    expect(lensSamplesFor('planner-pivot', 's0')).toEqual([]);
    const l = lensSamples[0]!;
    expect(findLensSample(l.sampleId, l.stepId, l.sentence)).toBe(l);
    expect(findLensSample(l.sampleId, l.stepId, `${l.sentence} `)).toBeUndefined();
    await expect(loadLensGarden('nope')).rejects.toThrow('No recorded lens garden');
  });
});
