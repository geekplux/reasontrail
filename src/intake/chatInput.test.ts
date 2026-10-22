import { describe, expect, it } from 'vitest';
import { chatMeta, filterChats, isShareLink } from './chatInput';

const chats = [
  { id: 'a', title: 'Regex for ISO dates', updated: '2026-10-15T10:02:40.000Z', turns: 3 },
  { id: 'b', title: 'Garden club name', turns: 1 },
];

describe('chat import helpers', () => {
  it('spots share links and nothing else', () => {
    expect(isShareLink(' https://chatgpt.com/share/6710-abcd ')).toBe(true);
    expect(isShareLink('https://claude.ai/share/1234-5678')).toBe(true);
    expect(isShareLink('https://chatgpt.com/c/123')).toBe(false);
    expect(isShareLink('You: see https://claude.ai/share/1')).toBe(false);
  });

  it('filters by every word and describes each conversation', () => {
    expect(filterChats(chats, 'iso REGEX').map((c) => c.id)).toEqual(['a']);
    expect(filterChats(chats, '  ')).toHaveLength(2);
    expect(chatMeta(chats[0] as (typeof chats)[0])).toBe('15 Oct 2026 · 3 messages from you');
    expect(chatMeta(chats[1] as (typeof chats)[0])).toBe('1 message from you');
  });
});
