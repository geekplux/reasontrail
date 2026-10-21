import { describe, expect, it } from 'vitest';
import { normalizeSession } from './adapter';
import { buildGraph } from './build/graph';
import { attachRaw, clipRaw } from './raw';
import { redactText } from './redact';

const line = (o: object) => JSON.stringify(o);
const file = {
  path: 'x.jsonl',
  text: [
    line({ type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'fix it, key sk-ant-abcdefghijklmnopqrstuvwx' } }),
    line({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-01-01T00:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'a.ts', old_string: 'a\nb', new_string: 'a\nc' } }] } }),
  ].join('\n') + '\n',
};

describe('attachRaw', () => {
  const g = buildGraph(normalizeSession({ files: [file] })!);
  it('puts the verbatim line on the first step of each record only', () => {
    const r = attachRaw(g, [file]);
    expect(r.steps[0]?.rawText).toContain('"type":"user"');
    expect(r.steps[1]?.rawText).toContain('"tool_use"');
    expect(r.steps[2]?.rawText).toBeUndefined();
    expect(g.steps[0]?.rawText).toBeUndefined();
  });
  it('redacts before clipping', () => {
    const r = attachRaw(g, [file], { redact: (t) => redactText(t), max: 160 });
    expect(r.steps[0]?.rawText).toContain('[secret:anthropic-key]');
    expect(r.steps[1]?.rawText).toMatch(/…\n\[cut \d+ characters; full record at x\.jsonl:2\]$/);
  });
  it('keeps edit text on the call, not the result', () => {
    expect(g.steps[2]?.tool?.edit).toEqual({ before: 'a\nb', after: 'a\nc' });
  });
  it('clips', () => {
    expect(clipRaw('abcdef', { file: 'a/b.jsonl', line: 7 }, 3)).toBe('abc…\n[cut 3 characters; full record at a/b.jsonl:7]');
    expect(clipRaw('abc', { file: 'b.jsonl', line: 1 }, 3)).toBe('abc');
  });
});
