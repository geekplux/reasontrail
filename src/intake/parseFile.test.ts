import { describe, expect, it } from 'vitest';
import chatgpt from '../../fixtures/chats/chatgpt/conversations.json?raw';
import plain from '../../fixtures/chats/pasted-plain.txt?raw';
import basic from '../../fixtures/sessions/claude-code/basic.jsonl?raw';
import { countLines, parseFile } from './parseFile';

const blob = (text: string) => new Blob([text]);

describe('parseFile', () => {
  it('counts lines with and without a final newline', async () => {
    expect(await countLines(blob(''))).toBe(0);
    expect(await countLines(blob('a\nb\n'))).toBe(2);
    expect(await countLines(blob('a\nb'))).toBe(2);
  });

  it('maps a Claude Code session, reports progress up to the total and keeps raw records', async () => {
    const seen: [number, number][] = [];
    const r = await parseFile(blob(basic), 'basic.jsonl', { onProgress: (n, total) => seen.push([n, total]) });
    expect(r?.ok).toBe(true);
    if (r?.ok !== true) return;
    expect(r.graph.title).toBe('Fix slugify for titles with spaces');
    expect(r.graph.steps.length).toBeGreaterThan(0);
    expect(r.graph.steps.some((s) => typeof s.rawText === 'string')).toBe(true);
    const n = basic.split('\n').length - (basic.endsWith('\n') ? 1 : 0);
    expect(seen.at(-1)).toEqual([n, n]);
  });

  it('decodes multi-byte text split across chunks', async () => {
    const line = JSON.stringify({ type: 'custom-title', sessionId: 's', customTitle: 'Café ☕ naïve' });
    const parts = new TextEncoder().encode(`${line}\n${basic.split('\n').slice(1).join('\n')}`);
    const r = await parseFile(new Blob([parts.slice(0, 60), parts.slice(60)]), 'x.jsonl');
    expect(r?.ok === true && r.graph.title).toBe('Café ☕ naïve');
  });

  it.each([
    ['', 'empty'],
    ['\n  \n', 'empty'],
    ['hello world\nnot json\n', 'unsupported'],
    ['{"a":1}\n{"b":2}\n', 'unsupported'],
  ])('reports %j as %s', async (text, error) => {
    expect(await parseFile(blob(text), 'f.jsonl')).toEqual({ ok: false, error });
  });

  it('keeps a partial last line as a note on the map', async () => {
    const r = await parseFile(blob(`${basic.trimEnd()}\n{"type":"user","mess`), 'p.jsonl');
    expect(r?.ok === true && r.graph.stats.partialLines).toBe(1);
  });

  it('asks to pick a conversation from a chat export, then maps the picked one', async () => {
    const file = blob(chatgpt);
    const r = await parseFile(file, 'conversations.json');
    expect(r?.ok === 'pick' && r.chats.map((c) => c.title)).toEqual(['Regex for ISO dates', 'Garden club name', 'Packing list for a weekend hike']);
    const one = await parseFile(file, 'conversations.json', { pick: 'c0ffee00-0000-4000-8000-000000000002' });
    expect(one?.ok === true && [one.graph.title, one.graph.source.kind, one.graph.steps[0]?.raw.file]).toEqual(['Garden club name', 'chat', 'conversations.json/c0ffee00-0000-4000-8000-000000000002.jsonl']);
    expect(one?.ok === true && one.graph.steps[0]?.rawText).toContain('"b1"');
  });

  it('maps pasted text without speaker names as alternating turns', async () => {
    const r = await parseFile(blob(plain), 'Pasted chat');
    expect(r?.ok === true && r.graph.notes?.length).toBe(1);
  });

  it('returns null when cancelled', async () => {
    expect(await parseFile(blob(basic), 'b.jsonl', { cancelled: () => true })).toBeNull();
  });
});
