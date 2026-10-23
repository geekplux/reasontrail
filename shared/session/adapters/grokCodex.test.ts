import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSession, sniff } from '../adapter';
import { checkAdapterContract } from '../adapterContract';
import type { SessionGraph, SessionInput } from '../types';
import { codexAdapter } from './codex';
import { grokBuildAdapter } from './grokBuild';

const GROK = 'fixtures/sessions/grok-build/notes';
const MAIN = '019a2c10-5e00-7a00-8000-000000000001';
const CHILD = '019a2c10-6a00-7b00-8000-000000000002';
const CODEX = 'fixtures/sessions/codex';

/** Every file under the fixture group, main session first (as the CLI locator orders them). */
function grokInput(): SessionInput {
  const walk = (d: string): string[] => readdirSync(d).sort().flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const paths = walk(GROK).map((p) => p.slice(GROK.length + 1));
  paths.sort((a, b) => Number(!a.startsWith(`${MAIN}/updates`)) - Number(!b.startsWith(`${MAIN}/updates`)));
  return { files: paths.map((p) => ({ path: p, text: readFileSync(join(GROK, p), 'utf8') })) };
}
const codexInput = (): SessionInput => {
  const name = readdirSync(CODEX).find((n) => n.endsWith('.jsonl')) as string;
  return { files: [{ path: name, text: readFileSync(join(CODEX, name), 'utf8') }] };
};
const parsed = (input: SessionInput): SessionGraph => {
  const g = parseSession(input);
  if (!g) throw new Error('not recognised');
  return g;
};

describe('Grok Build adapter', () => {
  it('passes the contract and is sniffed', () => {
    expect(checkAdapterContract(grokBuildAdapter, grokInput())).toEqual([]);
    expect(sniff(readFileSync(join(GROK, MAIN, 'updates.jsonl'), 'utf8').split('\n').slice(0, 5))?.id).toBe('grok-build');
  });

  it('merges chunks, pairs calls with results, and reads summary.json and the subagent lane', () => {
    const g = parsed(grokInput());
    expect(g.source).toMatchObject({ kind: 'grok-build', sessionId: MAIN, model: 'grok-build-fixture', cwd: '/work/notes-app' });
    expect(g.title).toBe('Word count in the note footer');
    expect(g.steps.find((s) => s.kind === 'user')?.text).toBe('Add a word count to the note footer, and keep the tests green.');
    expect(g.steps.filter((s) => s.kind === 'thinking' && s.laneId === 'main')).toHaveLength(2);
    const tests = g.steps.filter((s) => s.kind === 'tool-result' && s.tool?.name === 'run_terminal_command');
    expect(tests.map((s) => s.status)).toEqual(['error', 'ok']);
    expect(g.steps.find((s) => s.kind === 'tool-call' && s.tool?.name === 'read_file')?.tool).toMatchObject({ category: 'read', files: ['src/footer.ts'] });
    expect(g.steps.find((s) => s.kind === 'tool-result' && s.tool?.name === 'read_file' && s.status === 'error')?.text).toBe('File not found: src/footer.css');
    expect(g.lanes.map((l) => l.id)).toEqual(['main', CHILD]);
    expect(g.lanes[1]).toMatchObject({ name: 'Find where notes are rendered', agentType: 'explore' });
    expect(g.edges.some((e) => e.kind === 'spawned')).toBe(true);
    expect(g.outcome.files.map((f) => f.path)).toEqual(['src/footer.ts']);
    expect(g.outcome.lastVerification?.ok).toBe(true);
    expect(g.stats).toMatchObject({ skippedLines: 0, unknownRecords: 0 });
    expect(g.stats.ignoredRecords).toBeGreaterThan(0); // hook, turn_completed, plan after todo_write
  });

  it('turns a plan without todo_write into a step and a cancelled turn into an interruption', () => {
    const rec = (u: object) => JSON.stringify({ timestamp: 1, method: 'session/update', params: { sessionId: 'x', update: u } });
    const text = [
      rec({ sessionUpdate: 'plan', entries: [{ content: 'Read', status: 'completed' }, { content: 'Write', status: 'pending' }] }),
      rec({ sessionUpdate: 'turn_completed', stop_reason: 'cancelled' }),
      rec({ sessionUpdate: 'brand_new_update' }),
    ].join('\n');
    const g = parsed({ files: [{ path: 'x/updates.jsonl', text: `${text}\n` }] });
    expect(g.steps.map((s) => [s.kind, s.text, s.status])).toEqual([['system', 'Plan: 1/2 done\n[x] Read\n[ ] Write', undefined], ['system', 'Turn cancelled', 'interrupted']]);
    expect(g.stats.unknownRecords).toBe(1);
  });
});

describe('Codex adapter (from the public rollout format; not verified against a real session)', () => {
  it('passes the contract and is sniffed', () => {
    expect(checkAdapterContract(codexAdapter, codexInput())).toEqual([]);
    expect(sniff(codexInput().files[0]?.text.split('\n').slice(0, 5) ?? [])?.id).toBe('codex');
  });

  it('reads meta, messages, reasoning, shell and apply_patch calls with their exit status', () => {
    const g = parsed(codexInput());
    expect(g.source).toMatchObject({ kind: 'codex', sessionId: '019a2c20-7c00-7c00-8000-000000000003', model: 'codex-fixture-model', cwd: '/work/notes-app', gitBranch: 'main' });
    expect(g.title).toBe('Sort the note list by last edit, newest first.');
    expect(g.steps.filter((s) => s.kind === 'user')).toHaveLength(1);
    expect(g.steps.filter((s) => s.kind === 'system')).toHaveLength(0); // permissions + environment context are ignored
    expect(g.steps[0]?.kind).toBe('user');
    expect(g.steps.filter((s) => s.kind === 'thinking')).toHaveLength(2);
    const shell = g.steps.filter((s) => s.kind === 'tool-call' && s.tool?.name === 'shell');
    expect(shell.map((s) => s.tool?.command)).toEqual(['rg -n "sort" src', 'pnpm test', 'pnpm test']);
    expect(g.steps.filter((s) => s.kind === 'tool-result' && s.tool?.name === 'shell').map((s) => s.status)).toEqual(['ok', 'error', 'ok']);
    const patch = g.steps.find((s) => s.kind === 'tool-call' && s.tool?.name === 'apply_patch')?.tool;
    expect(patch).toMatchObject({ category: 'edit', files: ['src/list.ts'], edit: { before: '  return notes.sort(byTitle);' } });
    expect(g.outcome.files.map((f) => f.path)).toEqual(['src/list.ts']);
    expect(g.outcome.lastVerification?.ok).toBe(true);
    expect(g.stats).toMatchObject({ skippedLines: 0, unknownRecords: 0 });
  });

  it('accepts argv commands, plain and object outputs, aborted turns and unknown items', () => {
    const rec = (type: string, payload: object) => JSON.stringify({ timestamp: '2026-10-16T09:00:00.000Z', type, payload });
    const text = [
      rec('response_item', { type: 'local_shell_call', call_id: 'c1', status: 'completed', action: { type: 'exec', command: ['git', 'commit', '-m', 'a b'] } }),
      rec('response_item', { type: 'function_call_output', call_id: 'c1', output: { content: 'Exit code: 1\nnothing to commit', success: false } }),
      rec('event_msg', { type: 'turn_aborted', reason: 'interrupted' }),
      rec('response_item', { type: 'brand_new_item' }),
    ].join('\n');
    const g = parsed({ files: [{ path: 'rollout-x.jsonl', text: `${text}\n` }] });
    expect(g.steps.map((s) => [s.kind, s.tool?.command ?? s.text, s.status])).toEqual([
      ['tool-call', "git commit -m 'a b'", undefined],
      ['tool-result', 'Exit code: 1\nnothing to commit', 'error'],
      ['system', 'Turn aborted: interrupted', 'interrupted'],
    ]);
    expect(g.stats.unknownRecords).toBe(1);
  });
});
