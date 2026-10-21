// --trim (phase 15): a step range of the full graph, kept whole per record, lanes and title follow.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSession } from './adapter';
import { buildGraph } from './build/graph';
import { parseStepRange, trimSession } from './trim';
import type { NormalizedSession } from './types';

const DIR = 'fixtures/sessions/claude-code';

function load(name: string): NormalizedSession {
  const files = [{ path: `${DIR}/${name}.jsonl`, text: readFileSync(`${DIR}/${name}.jsonl`, 'utf8') }];
  if (name === 'subagent') {
    const sub = `${DIR}/subagent/subagents`;
    for (const f of readdirSync(sub).sort()) files.push({ path: `${sub}/${f}`, text: readFileSync(`${sub}/${f}`, 'utf8') });
  }
  const s = normalizeSession({ files });
  if (!s) throw new Error(name);
  return s;
}

const strip = (g: ReturnType<typeof buildGraph>) => g.steps.map((s) => [s.kind, s.laneId, s.raw.file, s.raw.line, s.text]);

describe('trimSession', () => {
  it('keeps the whole graph for the full range, custom title included', () => {
    const s = load('basic');
    const full = buildGraph(s);
    const same = buildGraph(trimSession(s, { from: 0, to: full.steps.length - 1 }));
    expect(same).toEqual(full);
  });

  it('keeps exactly the steps in range, renumbered from s0, and takes the title from the first kept request', () => {
    const s = load('subagent');
    const full = buildGraph(s);
    const sub = full.steps.find((st) => st.laneId !== 'main');
    if (!sub) throw new Error('fixture has no subagent step');
    const cut = buildGraph(trimSession(s, { from: sub.seq, to: full.steps.length - 1 }));
    expect(strip(cut)).toEqual(strip(full).slice(sub.seq));
    expect(cut.steps[0]?.id).toBe('s0');
    expect(cut.lanes.map((l) => l.id)).toEqual(full.lanes.map((l) => l.id));
    const firstUser = cut.steps.find((st) => st.kind === 'user' && st.laneId === 'main') ?? cut.steps.find((st) => st.kind === 'user');
    expect(cut.title).toBe(firstUser?.text?.trim().split('\n')[0]?.slice(0, 120));
  });

  it('drops lanes that have no step left, but always keeps the main lane', () => {
    const s = load('subagent');
    const full = buildGraph(s);
    const before = full.steps.findIndex((st) => st.laneId !== 'main');
    const cut = buildGraph(trimSession(s, { from: 0, to: before - 1 }));
    expect(cut.lanes.map((l) => l.id)).toEqual(['main']);
    expect(cut.steps).toHaveLength(before);
    expect(buildGraph(trimSession(s, { from: 9_000, to: 9_001 })).lanes.map((l) => l.id)).toEqual(['main']);
  });

  it('is deterministic', () => {
    const s = load('trouble');
    expect(JSON.stringify(buildGraph(trimSession(s, { from: 2, to: 9 })))).toBe(JSON.stringify(buildGraph(trimSession(load('trouble'), { from: 2, to: 9 }))));
  });
});

describe('parseStepRange', () => {
  it.each([
    ['0:399', { from: 0, to: 399 }],
    [' 7:7 ', { from: 7, to: 7 }],
    ['9:3', undefined],
    ['a:3', undefined],
    ['-1:3', undefined],
    ['3', undefined],
  ])('%j', (text, want) => expect(parseStepRange(text)).toEqual(want));
});
