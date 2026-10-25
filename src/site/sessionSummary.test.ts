import { describe, expect, it } from 'vitest';
import type { SessionGraph } from '../../shared/session/types';
import plannerPivot from '../sessions/samples/planner-pivot.graph.json';
import implementerChecks from '../sessions/samples/implementer-checks.graph.json';
import { defaultSessionGraph as vff } from '../sessions/samples';
import pastedChat from '../../fixtures/chats/pasted-chatgpt.txt?raw';
import { parseChat } from '../../shared/session/adapter';
import { finalAnswer, outcomeRows, runs, sessionMeta } from './sessionSummary';

const checks = implementerChecks as SessionGraph;
const pivot = plannerPivot as SessionGraph;
const line = (items: ReturnType<typeof sessionMeta>) => items.map((m) => ('strong' in m ? `${m.strong} ${m.rest}` : m.text)).join('  ');

describe('sessionMeta (v7 §12)', () => {
  it('reads agent, wall time, subagents, tool calls and branch, in that order', () => {
    expect(line(sessionMeta(vff, 'phase-12-structure-redact'))).toBe('Claude Code  47 min total  3 subagents  60 tool calls  phase-12-structure-redact');
    expect(sessionMeta(vff).at(-1)).toEqual({ key: 'branch', text: 'main', code: true });
  });

  it('leaves out zero counts and has no middle dot', () => {
    const meta = line(sessionMeta(checks));
    expect(meta).not.toMatch(/subagent|·/);
    expect(meta).toMatch(/^Claude Code {2}\d+ min total {2}\d+ tool calls {2}phase-5-keyboard-a11y$/);
  });
});

describe('outcomeRows', () => {
  it('gives the canvas rows for verify-fail-fix: the final check, the failed review, the file', () => {
    const rows = outcomeRows(vff);
    expect(rows.map((r) => [r.key, r.icon, r.lead])).toEqual([
      ['check', 'ok', 'Passed on re-verify'],
      ['trouble', 'alert', '1 failed review'],
      ['files', 'files', '1 file changed'],
    ]);
    expect(rows[0]?.detail).toEqual([{ text: 'pnpm exec vitest', code: true }, { text: ' passed at 47 min' }]);
    expect(rows[1]?.detail).toEqual([{ text: 'Verify phase 12 failed, fixed in ' }, { text: 'cceb2d5', code: true }]);
    expect(rows[2]?.detail).toEqual([{ text: 'scripts/audit-samples.mjs', code: true }, { text: ', 2 edits' }]);
  });

  it('names no fix when no commit hash was recorded between the failure and the pass, and never says FAIL', () => {
    const steps = vff.steps.map((s) => (s.kind === 'tool-result' && s.text?.includes('cceb2d5') ? { ...s, text: 'done' } : s));
    const rows = outcomeRows({ ...vff, steps });
    expect(rows[1]?.detail).toEqual([{ text: 'Verify phase 12 failed' }]);
    expect(JSON.stringify(outcomeRows(vff))).not.toMatch(/FAIL/);
  });

  it('counts detected patterns before failed reviews, and pairs every trouble row with the ⚠ shape', () => {
    const t = outcomeRows(checks).find((r) => r.key === 'trouble');
    expect(t?.lead).toMatch(/^\d+ trouble spots?$/);
    expect(t?.icon).toBe('alert');
    expect(outcomeRows(pivot).map((r) => r.key)).toEqual(['check', 'trouble', 'files']);
  });

  it('says so when nothing was checked or changed', () => {
    const g: SessionGraph = { ...checks, trouble: [], lanes: checks.lanes.slice(0, 1), outcome: { files: [] } };
    expect(outcomeRows(g).map((r) => [r.icon, r.lead, r.detail.length])).toEqual([['unknown', 'No check run found', 1], ['ok', 'No trouble detected', 0], ['files', '0 files changed', 0]]);
  });
});

describe('finalAnswer', () => {
  it('falls back to the last report and keeps its opening paragraphs as sentences', () => {
    expect(finalAnswer(vff)?.excerpt).toBe('VERDICT: PASS. Round 2 of Phase 12 on `phase-12-structure-redact` at HEAD `cceb2d5`. The round-1 problem is fixed, and lint, typecheck, tests and the sample audit all pass.');
    expect(finalAnswer(vff)?.full).toMatch(/^VERDICT: PASS\n/);
  });

  it('turns backticks into code runs and drops bold markers', () => {
    expect(runs('**Done** on `main`.')).toEqual([{ text: 'Done on ' }, { text: 'main', code: true }, { text: '.' }]);
  });
});

describe('a chat (phase 35, rule 2)', () => {
  const chat = parseChat({ files: [{ path: 'pasted.txt', text: pastedChat }] }) as SessionGraph;

  it('keeps only the trouble row in the outcome box, and none without trouble', () => {
    expect(chat.source.kind).toBe('chat');
    expect(outcomeRows(chat).map((r) => r.key)).toEqual(chat.trouble.length > 0 ? ['trouble'] : []);
    expect(outcomeRows({ ...chat, trouble: [] })).toEqual([]);
  });

  it('leaves "Chat" out of the meta line when a tag names the source', () => {
    expect(sessionMeta(chat).map((m) => m.key)).toContain('agent');
    expect(sessionMeta(chat, undefined, true).map((m) => m.key)).not.toContain('agent');
    expect(sessionMeta(vff, undefined, true)[0]).toEqual({ key: 'agent', text: 'Claude Code' });
  });
});
