import { describe, expect, it } from 'vitest';
import type { SessionGraph, Step } from '../../shared/session/types';
import implementerChecks from '../sessions/samples/implementer-checks.graph.json';
import verifyFailFix from '../sessions/samples/verify-fail-fix.graph.json';
import { excerpt, exitCode, itemForStep, lineDiff, rawRecords, readStepLink, redactionParts, rowLabel, rowStatusWord, shortId, stepRows, targetOf, writeStepLink } from './details';
import { glanceLayout } from './layout';

const raw = { file: 'f.jsonl', line: 1 };
const steps: Step[] = [
  { id: 's0', seq: 0, laneId: 'main', kind: 'thinking', textStored: false, raw },
  { id: 's1', seq: 1, laneId: 'main', kind: 'thinking', textStored: false, raw: { ...raw, line: 2 } },
  { id: 's2', seq: 2, laneId: 'main', kind: 'tool-call', tool: { name: 'Bash', category: 'run', summary: 'Bash pnpm test', files: [], callId: 't1', command: 'pnpm test\n--silent' }, raw: { ...raw, line: 3 }, rawText: '{"a":1}' },
  { id: 's3', seq: 3, laneId: 'main', kind: 'tool-result', tool: { name: 'Bash', category: 'run', summary: 'Bash pnpm test', files: [], callId: 't1' }, status: 'error', text: 'Exit code 2\nFAIL', raw: { ...raw, line: 4 } },
];
const g = { steps, lanes: [{ id: 'main', name: 'main', file: 'f.jsonl' }] } as unknown as SessionGraph;

describe('details (M3)', () => {
  it('folds results into calls and collapses unstored thinking', () => {
    const rows = stepRows(g, ['s0', 's1', 's2', 's3']);
    expect(rows.map((r) => r.ids)).toEqual([['s0', 's1'], ['s2', 's3']]);
    expect(rowLabel(rows[0]!)).toBe('thinking (text not stored) ×2');
    expect(rowLabel(rows[1]!)).toBe('pnpm test');
    expect(rowStatusWord(rows[1]!)).toBe('failed');
    expect(exitCode(rows[1]!)).toBe(2);
    expect(rawRecords(g, rows[1]!)).toEqual([{ file: 'f.jsonl', line: 3, text: '{"a":1}' }, { file: 'f.jsonl', line: 4 }]);
  });

  it('diffs lines as text, never markup', () => {
    const before = 'keep\n<img src=x onerror=alert(1)>\n</script>';
    const after = 'keep\n<b>new</b>';
    expect(lineDiff(before, after)).toEqual([
      { op: ' ', text: 'keep' },
      { op: '-', text: '<img src=x onerror=alert(1)>' },
      { op: '-', text: '</script>' },
      { op: '+', text: '<b>new</b>' },
    ]);
    expect(lineDiff('', 'a')).toEqual([{ op: '+', text: 'a' }]);
    expect(lineDiff('a\nb', 'c', 1)).toEqual([{ op: '-', text: 'a' }, { op: '-', text: 'b' }, { op: '+', text: 'c' }]);
  });

  it('excerpts, short ids and redaction marks', () => {
    expect(excerpt('a\nb\nc\n', 2)).toEqual({ head: 'a\nb', more: 1 });
    expect(shortId('3f2a1234-5678-c91')).toBe('3f2a…c91');
    expect(redactionParts('key [secret:github-token] at ~/x [email]')).toEqual([
      { text: 'key ', redacted: false }, { text: '[secret:github-token]', redacted: true }, { text: ' at ', redacted: false },
      { text: '~', redacted: true }, { text: '/x ', redacted: false }, { text: '[email]', redacted: true },
    ]);
  });

  it('reads and writes ?step= and #step= links, keeping other params', () => {
    expect(readStepLink('search', { search: '?session=a&step=s4', hash: '' })).toBe('s4');
    expect(readStepLink('hash', { search: '', hash: '#view=outline&step=s9' })).toBe('s9');
    expect(writeStepLink('search', { search: '?session=a', hash: '#x' }, 's2')).toBe('?session=a&step=s2#x');
    expect(writeStepLink('search', { search: '?step=s2', hash: '' }, undefined)).toBe('');
    expect(writeStepLink('hash', { search: '?q', hash: '' }, 's2')).toBe('?q#step=s2');
  });

  it('finds what a map item and a deep-linked step hold', () => {
    const v = verifyFailFix as unknown as SessionGraph;
    const L = glanceLayout(v, 1216);
    const ep = L.episodes[0]!;
    expect(targetOf(v, L, `ep:${ep.episode.id}`)?.steps).toEqual(ep.episode.stepIds);
    expect(itemForStep(v, L, ep.episode.stepIds[0]!)).toEqual({ item: `ep:${ep.episode.id}` });
    const sub = v.steps.find((s) => s.laneId !== v.lanes[0]?.id)!;
    expect(itemForStep(v, L, sub.id)?.lane).toBe(`lane:${sub.laneId}`);
    expect(itemForStep(v, L, 'nope')).toBeUndefined();
    const i = implementerChecks as unknown as SessionGraph;
    const P = glanceLayout(i, 1216);
    const t = targetOf(i, P, P.blazes[0]!.id);
    expect(t?.kind).toBe('pattern');
    expect([...(t?.evidence ?? [])].sort()).toEqual([...i.trouble[0]!.stepIds].sort());
  });
});
