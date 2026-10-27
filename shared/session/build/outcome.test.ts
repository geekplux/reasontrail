// Outcome: scratch and build output never count as files changed.
import { describe, expect, it } from 'vitest';
import type { Step } from '../types';
import { buildOutcome, countedPaths, type FileEvent, fileHistory, isScratchOutput } from './outcome';
import { findTrouble } from './trouble';

const step = { id: 's0', seq: 0, laneId: 'main', kind: 'tool-call', tool: { category: 'edit', files: [] } } as unknown as Step;
const write = (path: string): FileEvent => ({ path, step, type: 'write' });

describe('isScratchOutput', () => {
  it('matches scratch and build directories, relative or absolute', () => {
    const scratch = ['.tmp/plant', '.tmp/plant/a.jsonl', 'tmp/x.txt', '/tmp/x', 'node_modules/a/b.js', 'cli/dist/cli.mjs', 'dist', '.wrangler/dry-run/index.js', '/w/p/.tmp/a'];
    const kept = ['src/tmpl.ts', 'docs/distance.md', 'scripts/audit-samples.mjs', 'src/.tmpfile', 'wrangler.toml'];
    expect(scratch.filter((p) => !isScratchOutput(p))).toEqual([]);
    expect(kept.filter(isScratchOutput)).toEqual([]);
  });
});

describe('buildOutcome', () => {
  it('leaves scratch and build output out of files changed', () => {
    const history = ['/w/p/.tmp/plant/a.jsonl', '/w/p/scripts/audit-samples.mjs', '/tmp/x', '/w/p/cli/dist/cli.mjs', '/w/p/.wrangler/out.js', '/w/p/node_modules/a.js'].map(write);
    expect(buildOutcome([step], history, [], 'main', '/w/p').files).toEqual([{ path: 'scripts/audit-samples.mjs', edits: 1, created: false }]);
  });
});

describe('countedPaths and churn', () => {
  const at = (seq: number, extra: Partial<Step> = {}) => ({ id: `s${seq}`, seq, laneId: 'main', kind: 'tool-call', tool: { name: 'Write', category: 'write', files: [], summary: '' }, ...extra }) as unknown as Step;
  const ev = (path: string, seq: number, type: FileEvent['type'] = 'write', created = false): FileEvent => ({ path, step: at(seq), type, ...(created ? { created } : {}) });
  const history = [
    ...[0, 1, 2, 3].map((i) => ev('/w/p/.tmp/x', i)),
    ev('/w/p/scratch.txt', 4, 'write', true), ...[5, 6, 7].map((i) => ev('/w/p/scratch.txt', i)), ev('/w/p/scratch.txt', 8, 'delete'),
    ...[9, 10, 11, 12].map((i) => ev('/w/p/src/a.ts', i)),
  ];

  it('drops scratch output and files created then deleted', () => {
    expect([...countedPaths(history, '/w/p')]).toEqual(['/w/p/src/a.ts']);
  });

  it('reports churn only on counted files', () => {
    const steps = history.map((h) => h.step);
    const episodes = [{ id: 'e0', title: 'Change', kind: 'change' as const, stepIds: steps.map((s) => s.id), laneId: 'main' }];
    const { trouble } = findTrouble(steps, [], episodes, history, [], '/w/p');
    expect(trouble.filter((t) => t.kind === 'churn').map((t) => t.summary)).toEqual(['Churn: src/a.ts edited 4× in one episode']);
  });
});

describe('answer step', () => {
  const s = (seq: number, kind: Step['kind'], text?: string) => ({ id: `s${seq}`, seq, laneId: 'main', kind, ...(text ? { text } : {}) }) as unknown as Step;
  it('is the last main assistant text when no main tool call follows it', () => {
    expect(buildOutcome([s(0, 'user', 'go'), s(1, 'tool-call'), s(2, 'assistant', 'Done.')], [], [], 'main').answerStepId).toBe('s2');
    expect(buildOutcome([s(0, 'assistant', 'Let me check.'), s(1, 'tool-call'), s(2, 'tool-result')], [], [], 'main').answerStepId).toBeUndefined();
  });
});

describe('folders', () => {
  it('never counts a folder removed with rm -r as a file changed', () => {
    const call = (id: string, command: string) => ({ id, seq: Number(id.slice(1)), laneId: 'main', kind: 'tool-call', tool: { name: 'Bash', category: 'run', command, files: [], summary: '', callId: id } }) as unknown as Step;
    const steps = [call('s1', 'rm -rf docs/screenshots/phase-9 old.txt'), call('s2', 'rm -f Makefile')];
    const history = fileHistory(steps, '/w/p');
    expect([...countedPaths(history, '/w/p')]).toEqual(['/w/p/old.txt', '/w/p/Makefile']);
  });
});
