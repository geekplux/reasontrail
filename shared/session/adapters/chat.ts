// Pasted chat transcripts: plain text with speaker lines ("You:", "User:", "You said:",
// "ChatGPT said:", "## Assistant", "**Claude:**", …). Each turn starts at its speaker line, which is its provenance.
// Without any speaker line the turns are assumed to alternate (you first) at blank lines, and the map says so.
import type { SessionAdapter } from '../adapter';
import type { NormalizedSession, SessionInput } from '../types';

const USER = /^(?:you|user|me|human)$/i;
const ASSISTANT = /^(?:chatgpt|gpt[\w.-]*|claude|assistant|ai|gemini|copilot|grok)$/i;
/** `## You said:`, `**User:** text`, `> Assistant: text`, `ChatGPT` alone; group 1 is the name, group 2 the rest. */
const SPEAKER = /^(?:#{1,6}\s*|>\s*)?(?:\*\*|__)?([A-Za-z][\w.-]*)(?:\s+said)?(?:\*\*|__)?\s*(?:[:：]\s*(?:\*\*|__)?\s*(.*))?$/;

/** The note shown with a map whose turns had to be guessed. */
export const ALTERNATING_NOTE = 'No speaker names were found, so turns are assumed to alternate, starting with you, at blank lines. Add "You:" and "Assistant:" lines for an exact map.';

/** The speaker a line names, and the text after the marker; `undefined` for an ordinary line. */
export function speakerOf(line: string): { role: 'user' | 'assistant'; name: string; rest: string } | undefined {
  const m = SPEAKER.exec(line.trim());
  const name = m?.[1] ?? '';
  const role = USER.test(name) ? 'user' : ASSISTANT.test(name) ? 'assistant' : undefined;
  if (!m || !role) return undefined;
  // A bare name ("Assistant") counts only when it is a heading, bold or one of the copy-paste names.
  if (m[2] === undefined && !/^(?:#|\*\*|__)/.test(line.trim()) && !/^(?:you|chatgpt|claude)$/i.test(name)) return undefined;
  return { role, name, rest: (m[2] ?? '').replace(/(?:\*\*|__)\s*$/, '').trim() };
}

/** Not JSON and not binary (no NUL, no undecodable bytes). */
const looksLikeText = (first: string) => first !== '' && !/^[[{]/.test(first) && !first.includes('\u0000') && !first.includes('\uFFFD');

/** Parse pasted chat text into turns. Pure; never throws. */
export function parseChatText(input: SessionInput): NormalizedSession {
  const main = input.files[0];
  const path = main?.path ?? 'chat.txt';
  const session: NormalizedSession = {
    source: { kind: 'chat', sessionId: path.replace(/^.*\//, '').replace(/\.\w+$/, ''), file: path },
    lanes: [{ id: 'main', name: 'Main', file: path }],
    records: [],
    stats: { skippedLines: 0, partialLines: 0, skippedLineNumbers: [], unknownRecords: 0, ignoredRecords: 0 },
  };
  const lines = (main?.text ?? '').split('\n').map((l) => l.replace(/\r$/, ''));
  const turns: { role: 'user' | 'assistant'; line: number; text: string[] }[] = [];
  let preamble = false;
  const names = new Set<string>();
  lines.forEach((l, i) => {
    const s = speakerOf(l);
    if (s) {
      if (s.role === 'assistant') names.add(s.name);
      turns.push({ role: s.role, line: i + 1, text: s.rest ? [s.rest] : [] });
    } else if (turns.length > 0) (turns[turns.length - 1] as (typeof turns)[number]).text.push(l);
    else if (l.trim()) preamble = true;
  });
  if (turns.length === 0) {
    // Fallback: blocks split by two blank lines when there are any, else by one; roles alternate.
    const gap = lines.some((l, i) => !l.trim() && !lines[i + 1]?.trim() && lines.slice(i + 2).some((x) => x.trim())) ? 2 : 1;
    let blank = 0;
    lines.forEach((l, i) => {
      if (!l.trim()) return void blank++;
      const last = turns[turns.length - 1];
      if (!last || blank >= gap) turns.push({ role: turns.length % 2 === 0 ? 'user' : 'assistant', line: i + 1, text: [l] });
      else last.text.push(...Array<string>(blank).fill(''), l);
      blank = 0;
    });
    if (turns.length > 0) session.notes = [ALTERNATING_NOTE];
  } else if (preamble) session.stats.ignoredRecords++; // page chrome copied above the first turn
  for (const t of turns) {
    const text = t.text.join('\n').trim();
    if (!text) {
      // A speaker line with nothing under it: counted and located, never dropped silently.
      session.stats.skippedLines++;
      session.stats.skippedLineNumbers.push({ file: path, line: t.line });
      continue;
    }
    session.records.push({ laneId: 'main', file: path, line: t.line, items: [{ kind: t.role, text }] });
  }
  const agent = names.size === 1 ? [...names][0] : undefined;
  session.source.agent = agent && !/^(?:assistant|ai)$/i.test(agent) ? agent.replace(/^chatgpt$/i, 'ChatGPT').replace(/^claude$/i, 'Claude') : 'Chat';
  return session;
}

/** Plain text (not JSON) whose first lines name a speaker. Pasted text that names none is still read by
 * {@link parseChatText} through `parseChat` (shared/session/adapter.ts). */
export const chatTextAdapter: SessionAdapter = {
  id: 'chat',
  label: 'Chat transcript',
  sniff: (lines) => looksLikeText(lines[0] ?? '') && lines.some((l) => !!speakerOf(l)),
  parse: parseChatText,
};

/** True for text that may be a pasted chat (not JSON, not binary). */
export const maybeChatText = (text: string) => looksLikeText(text.trimStart().slice(0, 200).split('\n', 1)[0] ?? '');
