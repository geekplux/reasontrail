import { describe, expect, it } from 'vitest';
import { checkSample, expectFor, hideSteps, readDenylist, scrub, sessionFile } from './session-samples.mjs';

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

  it('finds main and subagent transcripts and checks the limits', () => {
    expect(sessionFile({ project: 'p', session: 'id' }, '/h')).toBe('/h/.claude/projects/p/id.jsonl');
    expect(sessionFile({ project: 'p', session: 'id', agent: 'a1' }, '/h')).toBe('/h/.claude/projects/p/id/subagents/agent-a1.jsonl');
    expect(checkSample(JSON.stringify({ steps: [], trouble: [{}] }))).toEqual([]);
    expect(checkSample(JSON.stringify({ steps: Array(401).fill(0), trouble: [] }))).toEqual(['401 steps > 400', 'no trouble marker']);
  });
});
