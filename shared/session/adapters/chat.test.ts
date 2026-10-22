import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChat, sniff } from '../adapter';
import { checkAdapterContract } from '../adapterContract';
import { firstLines } from '../jsonl';
import type { SessionGraph, SessionInput } from '../types';
import { ALTERNATING_NOTE, chatTextAdapter, speakerOf } from './chat';
import { chatExportAdapter, chatFile, listChats, looksLikeChatExport, readChatExport, type ChatExport } from './chatExports';

const DIR = 'fixtures/chats';
const text = (name: string): SessionInput => ({ files: [{ path: name, text: readFileSync(`${DIR}/${name}`, 'utf8') }] });
const map = (input: SessionInput): SessionGraph => {
  const g = parseChat(input);
  if (!g) throw new Error('not recognised');
  return g;
};
const exportOf = (kind: 'chatgpt' | 'claude'): ChatExport => {
  const raw = readFileSync(`${DIR}/${kind}/conversations.json`, 'utf8');
  expect(looksLikeChatExport(raw)).toBe(true);
  const exp = readChatExport(raw);
  if (!exp) throw new Error('not an export');
  return exp;
};
const picked = (exp: ChatExport, n: number): SessionInput => {
  const id = listChats(exp)[n]?.id ?? '';
  const file = chatFile(exp, id, 'conversations.json');
  if (!file) throw new Error('no file');
  return { files: [file] };
};
const kinds = (g: SessionGraph) => g.steps.map((s) => s.kind[0]).join('');

describe('pasted chat text', () => {
  it('passes the contract (an empty turn is counted and located)', () => {
    const probe = { append: 'You:\n', skippedLines: 1, partialLines: 0, unknownRecords: 0 };
    for (const name of ['pasted-chatgpt.txt', 'pasted-labels.md']) expect(checkAdapterContract(chatTextAdapter, text(name), probe)).toEqual([]);
  });

  it('reads speaker lines in the common layouts', () => {
    expect(speakerOf('You said:')).toMatchObject({ role: 'user', rest: '' });
    expect(speakerOf('ChatGPT said:')).toMatchObject({ role: 'assistant' });
    expect(speakerOf('**User:** hi there')).toMatchObject({ role: 'user', rest: 'hi there' });
    expect(speakerOf('### Assistant')).toMatchObject({ role: 'assistant' });
    expect(speakerOf('Me: one more')).toMatchObject({ role: 'user', rest: 'one more' });
    expect(speakerOf('AI')).toBeUndefined();
    expect(speakerOf('Note: not a speaker')).toBeUndefined();
    expect(speakerOf('No, that is wrong')).toBeUndefined();
  });

  it('maps a ChatGPT copy-paste: one discuss episode per user turn, the correction, the last answer', () => {
    const g = map(text('pasted-chatgpt.txt'));
    expect(sniff(firstLines(readFileSync(`${DIR}/pasted-chatgpt.txt`, 'utf8')))?.label).toBe('Chat transcript');
    expect(g.source).toMatchObject({ kind: 'chat', agent: 'ChatGPT' });
    expect(kinds(g)).toBe('uauaua');
    expect(g.title).toBe('My sourdough starter smells like nail polish remover. Is it ruined?');
    expect(g.lanes).toHaveLength(1);
    expect(g.episodes.map((e) => e.kind)).toEqual(['discuss', 'discuss', 'discuss']); // no separate answer episode: the last turn ends at the terminus
    expect(g.episodes[2]?.stepIds).toContain('s5');
    expect(g.stats.ignoredRecords).toBe(1); // the page chrome above the first turn
    expect(g.trouble).toMatchObject([{ kind: 'interrupt', label: 'detected pattern', stepIds: ['s1', 's2'], resolved: true, summary: 'User correction: “No, that\'s wrong, I already feed it twice a day.”' }]);
    expect(g.outcome.answerStepId).toBe('s5');
    expect(g.steps[2]?.raw).toEqual({ file: 'pasted-chatgpt.txt', line: 11 });
  });

  it('maps Markdown headings and bold labels, and "Actually" counts as a correction', () => {
    const g = map(text('pasted-labels.md'));
    expect(kinds(g)).toBe('uaua');
    expect(g.trouble.map((t) => t.summary)).toEqual(['User correction: “Actually, the section also has a header row at …”']);
  });

  it('falls back to alternating turns with an honest note', () => {
    const g = map(text('pasted-plain.txt'));
    expect(kinds(g)).toBe('uaua');
    expect(g.notes).toEqual([ALTERNATING_NOTE]);
    expect(g.steps[1]?.text).toContain('Bring water');
    expect(parseChat({ files: [{ path: 'x.json', text: '{"a":1}' }] })).toBeUndefined();
  });
});

describe('chat exports', () => {
  it('lists ChatGPT conversations and maps the current branch with thinking and a regeneration', () => {
    const exp = exportOf('chatgpt');
    expect(listChats(exp)).toEqual([
      { id: 'c0ffee00-0000-4000-8000-000000000001', title: 'Regex for ISO dates', updated: '2026-10-15T10:02:40.000Z', turns: 3 },
      { id: 'c0ffee00-0000-4000-8000-000000000002', title: 'Garden club name', updated: '2026-10-16T10:01:02.000Z', turns: 2 },
      { id: 'c0ffee00-0000-4000-8000-000000000003', title: 'Packing list for a weekend hike', updated: '2026-10-16T11:01:40.000Z', turns: 1 },
    ]);
    for (const n of [0, 1, 2]) expect(checkAdapterContract(chatExportAdapter, picked(exp, n))).toEqual([]);
    const g = map(picked(exp, 0));
    expect(g.source).toMatchObject({ kind: 'chat', agent: 'ChatGPT', model: 'gpt-fixture', sessionId: 'c0ffee00-0000-4000-8000-000000000001' });
    expect(g.title).toBe('Regex for ISO dates');
    expect(kinds(g)).toBe('utaauaua');
    expect(g.steps[1]?.text).toContain('Anchor it');
    expect(g.steps[3]?.text).toContain('0[1-9]');
    expect(g.steps[6]?.text).toContain('[image]');
    expect(g.trouble.map((t) => [t.summary, t.stepIds])).toEqual([
      ['Answer regenerated (2 versions)', ['s2', 's3']],
      ['User correction: “That is not right for 2026-02-30, it still matc…”', ['s3', 's4']],
    ]);
    expect(g.outcome.answerStepId).toBe('s7');
    expect(map(picked(exp, 1)).trouble.map((t) => t.summary)).toEqual(['Prompt edited and sent again (2 versions)']);
  });

  it('lists Claude conversations and maps thinking blocks and an earlier answer', () => {
    const exp = exportOf('claude');
    expect(listChats(exp).map((c) => [c.title, c.turns])).toEqual([['Dense bread bottom', 3], ['Untitled chat', 1]]);
    for (const n of [0, 1]) expect(checkAdapterContract(chatExportAdapter, picked(exp, n))).toEqual([]);
    const g = map(picked(exp, 0));
    expect(g.source).toMatchObject({ kind: 'chat', agent: 'Claude' });
    expect(kinds(g)).toBe('utauataua');
    expect(g.trouble.map((t) => t.summary)).toEqual(['Answer regenerated (2 versions)']);
    expect(map(picked(exp, 1)).title).toBe('List three easy houseplants.');
  });

  it('rejects JSON that is not an export', () => {
    expect(looksLikeChatExport('{"a":1}')).toBe(false);
    expect(readChatExport('[{"mapping":')).toBeUndefined();
    expect(readChatExport('[{"a":1}]')).toBeUndefined();
  });
});
