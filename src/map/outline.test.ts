import { describe, expect, it } from 'vitest';
import type { SessionGraph, Step } from '../../shared/session/types';
import { duration, glance, parseNotes, skippedWhere, stepLines, taskCard, times } from './outline';

const step = (id: string, kind: Step['kind'], extra: Partial<Step> = {}): Step => ({ id, seq: Number(id.slice(1)), laneId: 'main', kind, raw: { file: 'f.jsonl', line: 1 }, ...extra });

function graph(steps: Step[], extra: Partial<SessionGraph> = {}): SessionGraph {
  return {
    schemaVersion: 1, source: { kind: 'claude-code', sessionId: 'x', model: 'model-a' }, title: 'T',
    lanes: [{ id: 'main', name: 'Main', file: 'f.jsonl' }], steps, edges: [],
    episodes: [{ id: 'e0', title: 'Work', kind: 'explore', stepIds: steps.map((s) => s.id), laneId: 'main' }],
    trouble: [], outcome: { files: [] }, stats: { steps: steps.length, skippedLines: 0, partialLines: 0, skippedLineNumbers: [], unknownRecords: 0, ignoredRecords: 0 },
    ...extra,
  };
}

describe('outline model', () => {
  it('formats durations and splits wall from active time at 10 min gaps', () => {
    expect([duration(42_000), duration(12 * 60_000), duration(125 * 60_000)]).toEqual(['42 s', '12 min', '2 h 05 min']);
    const t = (m: number) => `2026-10-01T10:${String(m).padStart(2, '0')}:00.000Z`;
    expect(times([step('s0', 'user', { t: t(0) }), step('s1', 'assistant', { t: t(5) }), step('s2', 'user', { t: t(40) })])).toEqual({ wall: 40 * 60_000, active: 5 * 60_000 });
  });

  it('builds the task card from the first request, omitting zero counts', () => {
    const g = graph([step('s0', 'user', { text: 'Fix the slug', t: '2026-10-01T10:00:00Z' }), step('s1', 'thinking', { textStored: false, t: '2026-10-01T10:00:30Z' }), step('s2', 'tool-call', { tool: { name: 'Read', category: 'read', summary: 'Read a.ts', files: [] } })]);
    expect(taskCard(g)).toEqual({ source: 'Claude Code', model: 'model-a', request: 'Fix the slug', meta: ['30 s active', '1 tool call', '1 thinking (text not stored)'] });
  });

  it('says plainly when nothing was verified, changed or went wrong', () => {
    expect(glance(graph([])).map((r) => `${r.lead}${r.rest}`)).toEqual(['No verification run found', 'No trouble detected', '0 files changed, answer only']);
    const g = graph([], { outcome: { files: [{ path: 'a.ts', edits: 2, created: false }], lastVerification: { stepId: 's1', command: 'pnpm test', ok: false } } });
    expect(glance(g).map((r) => [r.status, `${r.lead}${r.rest}`])).toEqual([['error', 'Not verified: pnpm test failed'], ['ok', 'No trouble detected'], ['unknown', '1 file changed']]);
  });

  it('gives a chat two neutral rows: its prompts and its trouble, no files row', () => {
    const chat = (steps: Step[]) => graph(steps, { source: { kind: 'chat', sessionId: 'x' } });
    const answered = glance(chat([step('s0', 'user'), step('s1', 'assistant'), step('s2', 'user'), step('s3', 'assistant')]));
    expect(answered.map((r) => [r.key, r.status, `${r.lead}${r.rest}`])).toEqual([['turns', 'unknown', '2 prompts, all answered'], ['trouble', 'ok', 'No trouble detected']]);
    expect(glance(chat([step('s0', 'user'), step('s1', 'assistant'), step('s2', 'user')]))[0]).toMatchObject({ status: 'unknown', lead: '2 prompts', rest: ', the last one has no reply' });
    expect(glance(chat([step('s0', 'user'), step('s1', 'assistant')]))[0]?.lead).toBe('1 prompt');
  });

  it('folds results into calls and collapses unstored thinking into ×n', () => {
    const call = { name: 'Bash', category: 'run' as const, summary: 'Run pnpm test', files: [], callId: 'c1' };
    const g = graph([step('s0', 'thinking', { textStored: false }), step('s1', 'thinking', { text: '' }), step('s2', 'tool-call', { tool: call }), step('s3', 'tool-result', { tool: call, status: 'error' })]);
    expect(stepLines(g, g.episodes[0]!)).toEqual([
      { id: 's0', kind: 'thinking', text: 'thinking (text not stored)', times: 2 },
      { id: 's2', kind: 'tool-call', text: 'Run pnpm test', status: 'error', times: 1 },
    ]);
  });

  it('notes skipped and partial lines', () => {
    const at = [{ file: 'f.jsonl', line: 12 }, { file: 'f.jsonl', line: 40 }];
    const g = graph([], { stats: { steps: 0, skippedLines: 3, partialLines: 1, skippedLineNumbers: at, unknownRecords: 0, ignoredRecords: 0 } });
    expect(parseNotes(g)).toEqual([
      '2 lines could not be read and were skipped.',
      'This session is still being written; the last line was incomplete and was skipped. Run the command again to update.',
    ]);
    expect(skippedWhere(g)).toEqual(['line 12', 'line 40', 'and 1 more']);
    const multi = { ...g, lanes: [...g.lanes, { id: 'a1', name: 'Sub', file: 'a1.jsonl' }] };
    expect(skippedWhere({ ...multi, stats: { ...g.stats, skippedLines: 2 } })).toEqual(['f.jsonl:12', 'f.jsonl:40']);
  });
});
