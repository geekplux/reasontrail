// `?view=chat` (PLAN phase 23, DESIGN §13.8, §18.1): the paste box is the focal point; an export file is a quiet text
// link; format help sits in a <details>. The export picker lists the conversations of a ChatGPT or Claude export.
import { useState, type Ref } from 'react';
import type { ChatSummary } from '../../shared/session/adapters/chatExports';
import { PICKER_MAX, chatMeta, filterChats, isShareLink } from './chatInput';

interface PasteProps {
  /** The text to map. */
  onText(text: string): void;
  /** A ChatGPT or Claude export file to read. */
  onFile(file: File): void;
  /** The pasted text is only a share link (T3). */
  onShareLink(): void;
  /** A message about the last attempt is shown (it has `id="intake-error"`). */
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

/** The paste box, "Map this conversation", and the export file link. */
export function PasteBox({ onText, onFile, onShareLink, invalid = false, ref }: PasteProps) {
  const [text, setText] = useState('');
  return (
    <form className="paste-box" onSubmit={(e) => {
      e.preventDefault();
      if (isShareLink(text)) onShareLink();
      else if (text.trim()) onText(text);
    }}>
      <label htmlFor="chat-text" className="strong">Paste a conversation</label>
      <p id="chat-text-hint" className="muted">Copy the whole chat from the page, with its “You said:” and “ChatGPT said:” lines (or “User:” and “Assistant:”, or Markdown headings).</p>
      <textarea ref={ref} id="chat-text" aria-invalid={invalid || undefined} aria-describedby={invalid ? 'chat-text-hint intake-error' : 'chat-text-hint'} rows={10} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="paste-actions">
        <button type="submit" className="button primary" disabled={!text.trim()}>Map this conversation</button>
        <label className="text-button file-link">
          or choose a ChatGPT or Claude export (conversations.json)
          <input type="file" accept=".json,application/json" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }} />
        </label>
      </div>
    </form>
  );
}

/** A searchable list of an export's conversations; picking one maps it. */
export function ChatPicker({ chats, onPick, onCancel, ref }: { chats: ChatSummary[]; onPick(chat: ChatSummary): void; onCancel(): void; ref?: Ref<HTMLInputElement> }) {
  const [query, setQuery] = useState('');
  const found = filterChats(chats, query);
  const shown = found.slice(0, PICKER_MAX);
  return (
    <section className="chat-picker" aria-labelledby="chat-picker-title">
      <h2 id="chat-picker-title" className="strong">This export holds {chats.length} conversations. Pick one to map.</h2>
      <label htmlFor="chat-search">Search by title</label>
      <input ref={ref} id="chat-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        onCancel();
      }} aria-describedby="chat-count" />
      <p id="chat-count" className="muted" aria-live="polite">
        {found.length === 0 ? 'No conversation matches.' : found.length > shown.length ? `Showing ${shown.length} of ${found.length}; type to narrow the list.` : `${found.length === 1 ? '1 conversation' : `${found.length} conversations`} shown.`}
      </p>
      <ul className="chat-list">
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" className="chat-choice" onClick={() => onPick(c)}>
              <span className="chat-title">{c.title}</span>
              <span className="mono muted">{chatMeta(c)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="text-button" onClick={onCancel}>Back to the paste box</button>
    </section>
  );
}
