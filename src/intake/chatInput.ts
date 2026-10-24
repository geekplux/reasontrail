// The chat import's pure helpers (PLAN phase 23, T3): share-link detection, the picker's search and wording.
import type { ChatSummary } from '../../shared/session/adapters/chatExports';

/** T3 (paste-text fallback only): share pages are not fetched, so the link itself cannot be mapped. */
export const SHARE_LINK_MESSAGE = "We couldn't read that link. Paste the conversation text instead.";
/** At most this many conversations are listed at once; the search narrows the rest. */
export const PICKER_MAX = 50;

const SHARE = /^https?:\/\/(?:www\.)?(?:chatgpt\.com|chat\.openai\.com|claude\.ai|g\.co\/gemini|gemini\.google\.com)\/share\/\S+$/i;

/** True when the pasted text is only a chat share link (nothing else to map). */
export const isShareLink = (text: string) => SHARE.test(text.trim());

/** Conversations whose title contains every word of `query` (any case), in export order. */
export function filterChats(chats: readonly ChatSummary[], query: string): ChatSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return chats.filter((c) => words.every((w) => c.title.toLowerCase().includes(w)));
}

/** "15 Oct 2026, 3 messages" (UTC date, so it reads the same everywhere). */
export function chatMeta(c: ChatSummary): string {
  const date = c.updated ? new Date(c.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  const turns = `${c.turns} message${c.turns === 1 ? '' : 's'} from you`;
  return date ? `${date}, ${turns}` : turns;
}
