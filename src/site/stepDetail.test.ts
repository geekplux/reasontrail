import readme from '../../examples/README.md?raw';
import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../shared/session/types';
import { defaultSessionGraph as g, sessionSamples } from '../sessions/samples';
import { findStep, selectableSteps, stepDetail, stepFacts } from './stepDetail';

describe('selectable steps (phase 32b)', () => {
  it('lists the tool calls and thinking steps of every episode row, in list order', () => {
    const all = selectableSteps(g);
    expect(all.every((s) => s.step.kind === 'step')).toBe(true);
    expect(new Set(all.map((s) => s.step.stepId)).size).toBe(all.length);
    const s41 = findStep(g, 's41')!;
    expect([s41.lane, s41.episode.n, s41.episode.episodeId, s41.step.label]).toEqual(['Verify phase 12', 6, 'e18', 'Inspect vitest config for log suppression']);
    // Ids the list does not show are ignored: unknown, empty, an assistant answer, a spawning Agent call.
    for (const id of ['nope', '', null, 's96', 's0']) expect(findStep(g, id)).toBeUndefined();
  });
});

describe('step detail (phase 32b, Step.html)', () => {
  it('reads a failed command as the canvas does', () => {
    const d = stepDetail(g, 's41')!;
    expect(d).toMatchObject({
      where: 'Verify phase 12, episode 6, step 1 of 28',
      title: 'Command failed',
      tone: 'fail',
      at: '16 min',
      summary: 'Inspect vitest config for log suppression',
      code: '$ cat vitest.config.* 2>/dev/null | head -40; grep -n "onConsoleLog\\|silent\\|reporters" vite.config.* vitest.config.* 2>/dev/null',
      output: { note: 'Exit code 2, no output' },
      next: { stepId: 's43', summary: 'List repo files and check config', at: '16 min', tone: 'ok' },
      source: { file: 'agent-ad0e51f3501a3ddc3.jsonl', line: 132 },
      nextId: 's43',
    });
    expect(d.output?.text).toBeUndefined();
    expect(d.next?.output?.split('\n')).toEqual(['CHANGELOG.md', 'CLAUDE.md', 'LICENSE', 'README.md', '…']);
    expect(stepFacts(g, findStep(g, 's41')!)).toBe('Exit code 2, 16 min');
  });

  it('reads a passing command with its output, and a thinking step', () => {
    const d = stepDetail(g, 's43')!;
    expect([d.title, d.tone, d.where, d.output?.note]).toEqual(['Command', 'ok', 'Verify phase 12, episode 6, step 3 of 28', 'Exit code 0']);
    expect(d.output?.text?.startsWith('CHANGELOG.md\nCLAUDE.md')).toBe(true);
    expect(d.prevId).toBe('s41');
    const th = stepDetail(g, d.nextId!)!;
    expect([th.title, th.tone, th.output, th.code]).toEqual(['Thinking', undefined, undefined, undefined]);
    expect(th.text).toBeTruthy();
  });

  it('steps across episode boundaries, and stops at the ends', () => {
    const all = selectableSteps(g);
    const first = all.findIndex((s) => s.step.stepId === 's41');
    expect(stepDetail(g, 's41')?.prevId).toBe(all[first - 1]?.step.stepId);
    expect(all[first - 1]?.episode.n).toBe(5);
    const last = all.map((s) => s.episode.n).lastIndexOf(6);
    expect(findStep(g, stepDetail(g, all[last]!.step.stepId)!.nextId)?.episode.n).toBe(7);
    expect(stepDetail(g, all[0]!.step.stepId)?.prevId).toBeUndefined();
    expect(stepDetail(g, all.at(-1)!.step.stepId)?.nextId).toBeUndefined();
    expect(stepDetail(g, 's96')).toBeUndefined();
  });

  it('opens every deep link in examples/README.md on a step the list shows', async () => {
    const links = [...readme.matchAll(/\]\(https:\/\/reasontrail\.geekplux\.com\/\?session=([\w-]+)&step=(\w+)\)/g)];
    expect(links).toHaveLength(3);
    for (const [, session, step] of links) {
      const graph: SessionGraph = await sessionSamples.find((s) => s.id === session)!.load();
      expect(stepDetail(graph, step!), `${session} ${step}`).toBeDefined();
    }
  });
});
