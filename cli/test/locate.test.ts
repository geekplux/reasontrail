import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseArgs, type Options } from '../src/args';
import { encodeCwd, sessionFiles, titleFromHead } from '../src/locate/claudeCode';
import { listSessions, locate, readSession } from '../src/locate/index';
import { CODEX_ID, GROK_ID, sandbox } from './sandbox';
import { encodeCwd as grokCwd } from '../src/locate/grokBuild';

const opts = (argv: string[]) => parseArgs(argv) as Options;

describe('locating Claude Code sessions in a sandbox HOME', () => {
  it('encodes the cwd like Claude Code does', () => {
    expect(encodeCwd('/work/my_app.v2')).toBe('-work-my-app-v2');
  });

  it('picks the newest session for the folder, the current one from the env, or one by id or path', () => {
    const sb = sandbox();
    sb.add('basic', 'old-one', 1_000);
    const newest = sb.add('trouble', 'new-one', 2_000);
    expect(locate(opts(['--latest']), sb.ctx())).toEqual({ ref: expect.objectContaining({ id: 'new-one', file: newest }), how: 'newest for this folder' });
    expect(locate(opts(['--current']), sb.ctx({ CLAUDE_CODE_SESSION_ID: 'old-one' }))).toMatchObject({ ref: { id: 'old-one' }, how: 'current (CLAUDE_CODE_SESSION_ID)' });
    expect(locate(opts(['--current']), sb.ctx())).toMatchObject({ ref: { id: 'new-one' }, how: 'newest for this folder (no current session id)' });
    expect(locate(opts(['--current']), sb.ctx({ CLAUDE_CODE_SESSION_ID: 'gone' }))).toMatchObject({ ref: { id: 'new-one' }, how: 'session gone was not found; using the newest for this folder' });
    expect(locate(opts(['old-one']), sb.ctx())).toMatchObject({ ref: { id: 'old-one' }, how: 'given' });
    expect(locate(opts([newest]), sb.ctx())).toMatchObject({ ref: { file: newest } });
    expect(locate(opts(['nope']), sb.ctx())).toEqual({ error: 'No session file or id "nope" was found.' });
    expect(locate(opts(['--source', 'codex']), sb.ctx())).toEqual({ error: `No Codex session was found for ${sb.cwd}. Run it from the folder the session started in, or pass a session file.` });
  });

  it('reports no session for an empty folder', () => {
    const sb = sandbox();
    expect(locate(opts([]), sb.ctx())).toEqual({ error: `No Claude Code, Grok Build or Codex session was found for ${sb.cwd}. Run it from the folder the session started in, or pass a session file.` });
  });

  it('lists sessions newest first with title, start time and size', () => {
    const sb = sandbox();
    sb.add('basic', 'a', 1_000);
    sb.add('subagent', 'b', 2_000);
    const list = listSessions(opts(['--list']), sb.ctx());
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    expect(list[1]).toMatchObject({ title: 'Fix slugify for titles with spaces', startedAt: '2026-10-01T10:00:00.000Z' });
    expect(list[1]?.size).toBeGreaterThan(0);
  });

  it('reads subagent transcripts and meta files with paths relative to the store', () => {
    const sb = sandbox();
    const file = sb.add('subagent', 'with-sub', 1_000);
    expect(sessionFiles(file).map((f) => f.rel)).toEqual(['with-sub.jsonl', 'with-sub/subagents/agent-a1.jsonl', 'with-sub/subagents/agent-a1.meta.json']);
    const input = readSession({ source: 'claude-code', id: 'with-sub', file, mtimeMs: 0, size: 0 });
    expect(input.files.every((f) => !f.path.includes(sb.root))).toBe(true);
    expect(input.files[0]?.text).toBe(readFileSync(file, 'utf8')); // read on use, not kept
  });

  it('titles from the custom title, else the first plain user line', () => {
    expect(titleFromHead('{"type":"user","message":{"content":"<command-name>x</command-name>"}}\n{"type":"user","message":{"content":"Fix it\\nplease"}}')).toBe('Fix it');
    expect(titleFromHead('{"type":"custom-title","customTitle":"Named"}')).toBe('Named');
    expect(titleFromHead('not json')).toBe('(untitled)');
  });
});

describe('locating Grok Build and Codex sessions next to Claude Code ones', () => {
  it('encodes the cwd like Grok does', () => {
    expect(grokCwd('/work/my app (v2)')).toBe('%2Fwork%2Fmy%20app%20%28v2%29');
  });

  it('finds the current session from each agent\'s variable and the newest across stores', () => {
    const sb = sandbox();
    sb.add('basic', 'claude-one', 1_000);
    const grok = sb.addGrok(3_000);
    const codex = sb.addCodex(2_000);
    expect(locate(opts(['--latest']), sb.ctx())).toMatchObject({ ref: { source: 'grok-build', id: GROK_ID, file: grok }, how: 'newest for this folder' });
    expect(locate(opts(['--current']), sb.ctx({ GROK_SESSION_ID: GROK_ID }))).toMatchObject({ ref: { file: grok }, how: 'current (GROK_SESSION_ID)' });
    expect(locate(opts(['--current']), sb.ctx({ CODEX_THREAD_ID: CODEX_ID }))).toMatchObject({ ref: { source: 'codex', id: CODEX_ID, file: codex }, how: 'current (CODEX_THREAD_ID)' });
    // Grok started from a Claude Code shell inherits CLAUDE_CODE_SESSION_ID; an id no store knows is skipped.
    expect(locate(opts(['--current']), sb.ctx({ CLAUDE_CODE_SESSION_ID: 'not-here', GROK_SESSION_ID: GROK_ID }))).toMatchObject({ ref: { file: grok }, how: 'current (GROK_SESSION_ID)' });
    expect(locate(opts(['--latest', '--source', 'codex']), sb.ctx())).toMatchObject({ ref: { file: codex } });
    expect(locate(opts(['--latest', '--source', 'grok']), sb.ctx())).toMatchObject({ ref: { file: grok } });
    expect(locate(opts([grok]), sb.ctx())).toMatchObject({ ref: { source: 'grok-build', file: grok }, how: 'given' });
    expect(locate(opts([codex]), sb.ctx())).toMatchObject({ ref: { source: 'codex' }, how: 'given' });
    expect(locate(opts([CODEX_ID]), sb.ctx())).toMatchObject({ ref: { source: 'codex' }, how: 'given' });
  });

  it('lists all three stores side by side, without Grok subagent sessions or other folders\' rollouts', () => {
    const sb = sandbox();
    sb.add('basic', 'claude-one', 1_000);
    sb.addGrok(3_000);
    sb.addCodex(2_000);
    const list = listSessions(opts(['--list']), sb.ctx());
    expect(list.map((s) => s.source)).toEqual(['grok-build', 'codex', 'claude-code']);
    expect(list[0]).toMatchObject({ title: 'Word count in the note footer', startedAt: '2026-10-15T10:00:01Z' });
    expect(list[1]).toMatchObject({ title: 'Sort the note list by last edit, newest first.', startedAt: '2026-10-16T09:00:00.000Z' });
    const other = sandbox();
    other.addCodex(2_000, '/somewhere/else');
    expect(listSessions(opts(['--list']), other.ctx())).toEqual([]);
  });

  it('reads a Grok session with its summary, subagent meta and child log, relative to the store', () => {
    const sb = sandbox();
    const grok = sb.addGrok(3_000);
    const found = locate(opts([grok]), sb.ctx());
    if ('error' in found) throw new Error(found.error);
    const input = readSession(found.ref);
    expect(input.files.map((f) => f.path)).toEqual([
      `${GROK_ID}/updates.jsonl`, `${GROK_ID}/summary.json`,
      `${GROK_ID}/subagents/019a2c10-6a00-7b00-8000-000000000002/meta.json`, '019a2c10-6a00-7b00-8000-000000000002/updates.jsonl',
    ]);
  });
});
