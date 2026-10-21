import { describe, expect, it } from 'vitest';
import { parseArgs, type Options } from '../src/args';
import { encodeCwd, sessionFiles, titleFromHead } from '../src/locate/claudeCode';
import { listSessions, locate, readSession } from '../src/locate/index';
import { sandbox } from './sandbox';

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
    expect(locate(opts(['old-one']), sb.ctx())).toMatchObject({ ref: { id: 'old-one' }, how: 'given' });
    expect(locate(opts([newest]), sb.ctx())).toMatchObject({ ref: { file: newest } });
    expect(locate(opts(['nope']), sb.ctx())).toEqual({ error: 'No session file or id "nope" was found.' });
    expect(locate(opts(['--source', 'codex']), sb.ctx())).toEqual({ error: 'codex sessions are not supported yet (Claude Code only for now).' });
  });

  it('reports no session for an empty folder', () => {
    const sb = sandbox();
    expect(locate(opts([]), sb.ctx())).toEqual({ error: `No Claude Code session was found for ${sb.cwd}.` });
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
  });

  it('titles from the custom title, else the first plain user line', () => {
    expect(titleFromHead('{"type":"user","message":{"content":"<command-name>x</command-name>"}}\n{"type":"user","message":{"content":"Fix it\\nplease"}}')).toBe('Fix it');
    expect(titleFromHead('{"type":"custom-title","customTitle":"Named"}')).toBe('Named');
    expect(titleFromHead('not json')).toBe('(untitled)');
  });
});
