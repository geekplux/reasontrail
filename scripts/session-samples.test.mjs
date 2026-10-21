import { describe, expect, it } from 'vitest';
import { checkSample, expectFor, hideSteps, readDenylist, rewrite, scrub, sessionFile } from './session-samples.mjs';

const graph = () => ({
  title: 'Fix the slug helper so titles with spaces work in every view of the app',
  steps: [{ id: 's0', text: 'see repo-x/notes' }, { id: 's1', text: 'ps output', tool: { command: 'ps -eo pid,cmd' } }],
  trouble: [{ kind: 'retry' }],
  outcome: { files: [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'c.ts' }, { path: 'd.ts' }], lastVerification: { ok: false } },
});

describe('session-samples', () => {
  it('builds the M2 expect block', () => {
    expect(expectFor(graph())).toEqual({ task: 'Fix the slug helper so titles with spaces', files: ['a.ts', 'b.ts', 'c.ts'], trouble: 1, final: 'error' });
    expect(expectFor({ ...graph(), outcome: { files: [] } }).final).toBe('unknown');
  });

  it('scrubs denylist terms case-insensitively in values only, and hides listed steps', () => {
    const terms = readDenylist('# comment\nrepo-x\n\nREPO-X/notes\n');
    expect(terms).toEqual(['REPO-X/notes', 'repo-x']);
    const g = scrub(hideSteps(graph(), { s1: 'a process list' }), terms);
    expect(g.steps[0].text).toBe('see [private]');
    expect(g.steps[1]).toEqual({ id: 's1', text: '[Left out of this sample: a process list.]', tool: { command: '[Left out of this sample: a process list.]' } });
    expect(() => hideSteps(graph(), { s9: 'x' })).toThrow('hide: no step s9');
    expect(scrub({ a: 'x' }, [])).toEqual({ a: 'x' });
  });

  it('rewrites names and omits house-rule sentences in every string value', () => {
    const rules = { names: { Sean: 'the maintainer' }, omitSentencesWith: ['employer', 'study site'], omission: '[house rule omitted]' };
    const g = rewrite({ title: 'Change request from Sean', Sean: ["Sean's plan. Ask Sean.", 'Keep it short. Never mention the Employer here! Done.', '- no copying of study sites\nnext line', 'Seance and seaSean stay'] }, rules);
    expect(g).toEqual({ title: 'Change request from the maintainer', Sean: ["The maintainer's plan. Ask the maintainer.", 'Keep it short. [house rule omitted] Done.', '[house rule omitted]\nnext line', 'Seance and seaSean stay'] });
    expect(rewrite({ a: 'x' })).toEqual({ a: 'x' });
  });

  it('finds main and subagent transcripts and checks the limits', () => {
    expect(sessionFile({ project: 'p', session: 'id' }, '/h')).toBe('/h/.claude/projects/p/id.jsonl');
    expect(sessionFile({ project: 'p', session: 'id', agent: 'a1' }, '/h')).toBe('/h/.claude/projects/p/id/subagents/agent-a1.jsonl');
    expect(checkSample(JSON.stringify({ steps: [], trouble: [{}] }))).toEqual([]);
    expect(checkSample(JSON.stringify({ steps: Array(401).fill(0), trouble: [] }))).toEqual(['401 steps > 400', 'no trouble marker or failed verdict']);
    const failed = { lanes: [{ id: 'main' }, { id: 'v' }], steps: [{ laneId: 'v', kind: 'assistant', text: 'Verdict: FAIL' }], trouble: [] };
    expect(checkSample(JSON.stringify(failed))).toEqual([]);
    expect(checkSample(JSON.stringify({ ...failed, steps: [{ laneId: 'v', kind: 'assistant', text: 'PASS' }] }))).toEqual(['no trouble marker or failed verdict']);
  });
});
