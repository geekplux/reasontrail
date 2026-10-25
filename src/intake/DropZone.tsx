// `?view=open` (DESIGN §13.4, §12; PLAN V1, V2, V5; v7 §7): drop or choose a session file; it is read and mapped in
// this browser, with progress and Cancel for big files, and calm, specific messages for anything that cannot be mapped.
// `?view=chat` (phase 23): the same page with the paste box as its focal point, and the picker for chat exports.
// A mapped session shows on the v7 session page (SessionMap: header, tree, list and outcome), as in the local viewer.
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { COMMANDS } from '../../shared/commands';
import type { ChatSummary } from '../../shared/session/adapters/chatExports';
import type { SessionGraph } from '../../shared/session/types';
import { AlertIcon } from '../map/gitlist/marks';
import { CommandLine } from '../site/Install';
import { SessionMap } from '../site/SessionMap';
import { PRIVACY, pageTitle } from '../site/SiteShell';
import { ChatPicker, PasteBox } from './ChatImport';
import { SHARE_LINK_MESSAGE } from './chatInput';
import { startParse, warmIntake, type Job } from './intake';
import { MAX_BYTES, PROGRESS_MIN_BYTES, megabytes, progressText, type IntakeError } from './messages';

const ACCEPT = '.jsonl,.json,.ndjson,application/x-ndjson,application/jsonl';

type State =
  | { at: 'idle' }
  | { at: 'reading'; lines: number; total: number; big: boolean }
  | { at: 'error'; error: IntakeError; mb: number }
  | { at: 'pick'; file: File; chats: ChatSummary[] }
  | { at: 'done'; graph: SessionGraph; name: string };

const MESSAGE: Record<IntakeError, string> = {
  unsupported: "This doesn't look like a Claude Code, Codex or Grok Build session (.jsonl).",
  empty: 'This file has no steps we can map.',
  unreadable: "This file couldn't be read. Try choosing it again.",
  worker: "This browser couldn't start the reader for a file this size. The command line can map it:",
  'too-large': '',
  'share-link': SHARE_LINK_MESSAGE,
};
const CHAT_UNSUPPORTED = "This doesn't look like a chat transcript or a ChatGPT or Claude export.";
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** `onMount` lets the site move focus to this page's heading once the lazy page is drawn. `chat`: the paste page. */
export function OpenSession({ file, onFile, onMount, chat = false }: { file: File | null; onFile(file: File): void; onMount?(): void; chat?: boolean }) {
  const [state, setState] = useState<State>({ at: 'idle' });
  const [said, setSaid] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const job = useRef<Job | null>(null);
  const paste = useRef<HTMLTextAreaElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => void warmIntake(), []);
  useEffect(() => {
    onMount?.();
    // Arriving on the paste page (a link, or "paste the conversation text instead"): the paste box is the focal point.
    if (chat && document.activeElement?.matches('main h1')) paste.current?.focus();
  }, [onMount, chat]);
  useEffect(() => () => job.current?.cancel(), []);

  // A new file starts a new read (state adjusted during render; the read itself starts in the effect below). The paste
  // page ignores a file dropped before it opened.
  const [seen, setSeen] = useState<File | null>(chat ? file : null);
  const big = !!file && file.size > PROGRESS_MIN_BYTES && file.size <= MAX_BYTES;
  if (file !== seen) {
    setSeen(file);
    if (file) {
      setState({ at: 'reading', lines: 0, total: 0, big });
      setSaid(big ? 'Reading session' : '');
    }
  }
  /** Reads `f` (the conversation `pick` of a chat export) and shows the map, the picker or a message. */
  const run = useCallback((f: File, pick?: ChatSummary): Job => {
    const large = f.size > PROGRESS_MIN_BYTES && f.size <= MAX_BYTES;
    let quarter = 0;
    performance.mark('tg:intake-start');
    const j = (job.current = startParse(f, (lines, total) => {
      setState({ at: 'reading', lines, total, big: large });
      const q = Math.floor((lines / Math.max(total, 1)) * 4);
      if (large && q > quarter && q < 4) setSaid(`Reading session: ${(quarter = q) * 25} %`);
    }, pick?.id));
    void j.result.then((r) => {
      if (job.current !== j || !r) return;
      job.current = null;
      performance.measure('tg:intake-parse', 'tg:intake-start'); // PLAN G2: ≤ 3 s for 10 MB
      if (r.ok === 'pick') return setState({ at: 'pick', file: f, chats: r.chats });
      if (!r.ok) return setState({ at: 'error', error: r.error, mb: megabytes(f.size) });
      const episodes = r.graph.episodes.filter((e) => !e.parentId).length;
      setSaid(`Map ready: ${plural(episodes, 'episode')}, ${plural(r.graph.trouble.length, 'detected pattern')}`);
      setStep(null);
      setState({ at: 'done', graph: r.graph, name: pick ? `${f.name} › ${pick.title}` : f.name });
    });
    return j;
  }, []);
  const ignored = useRef(chat ? file : null);
  useEffect(() => {
    if (!file || file === ignored.current) return;
    const j = run(file);
    return () => j.cancel();
  }, [file, run]);
  useEffect(() => {
    if (state.at === 'pick') search.current?.focus();
    // A picked conversation unmounts the picker: keep focus on the page rather than losing it to the body.
    if (state.at === 'reading' && document.activeElement === document.body) document.querySelector<HTMLElement>('main h1')?.focus();
    if (state.at === 'error' && chat) paste.current?.focus();
  }, [state.at, chat]);
  const name = state.at === 'done' ? state.name : null;
  useEffect(() => {
    document.title = pageTitle(name ?? (chat ? 'Map a chat' : 'Open a session'));
  }, [name, chat]);
  const again = () => {
    setState({ at: 'idle' });
    requestAnimationFrame(() => (chat ? paste.current : input.current)?.focus());
  };

  const cancel = () => {
    job.current?.cancel();
    job.current = null;
    setState({ at: 'idle' });
    setSaid('Reading cancelled');
    requestAnimationFrame(() => (chat ? paste.current : input.current)?.focus());
  };
  const error = state.at === 'error' ? state : null;
  const another = <button type="button" className="btn ghost" onClick={again}>{chat ? 'Map another chat' : 'Open another file'}</button>;
  const live = <p className="visually-hidden" role="status" data-role="intake-live">{said}</p>;

  // The file's name (or "Pasted chat") is the meta line's last tag, where a sample says "Sample".
  if (state.at === 'done') {
    return (
      <div className="v7 session-page open-session" data-testid="opened">
        {live}
        <MapBoundary>
          <SessionMap key={state.name} id={`open:${state.name}`} g={state.graph} step={step} onStep={(id) => setStep(id ?? null)} tag={state.name} focusTitle />
        </MapBoundary>
        <div className="open-after">{another}</div>
      </div>
    );
  }
  return (
    <div className="page open-session">
      {live}
      <h1 className="page-title" tabIndex={-1}>{chat ? 'Map a chat' : 'Open a session'}</h1>
      {state.at === 'pick' ? (
        <ChatPicker ref={search} chats={state.chats} onPick={(c) => {
          setState({ at: 'reading', lines: 0, total: 0, big: state.file.size > PROGRESS_MIN_BYTES });
          run(state.file, c);
        }} onCancel={again} />
      ) : state.at === 'reading' && state.big ? (
        <Progress lines={state.lines} total={state.total} onCancel={cancel} />
      ) : chat ? (
        <PasteBox ref={paste} invalid={!!error} onText={(t) => onFile(new File([t], 'Pasted chat', { type: 'text/plain' }))} onFile={onFile} onShareLink={() => {
          // Clear first so the alert's text is re-added, and a repeated share link is announced again.
          flushSync(() => setState({ at: 'idle' }));
          setState({ at: 'error', error: 'share-link', mb: 0 });
        }} />
      ) : (
        <div className="drop-target" data-testid="drop-target" data-busy={state.at === 'reading' || undefined}>
          <FileIcon />
          <p className="strong">Drop a session file</p>
          <label className="btn ghost">
            Choose file
            <input ref={input} type="file" accept={ACCEPT} onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onFile(f);
            }} />
          </label>
          <p className="muted small">{PRIVACY}</p>
        </div>
      )}
      {!chat && (state.at === 'pick' || (state.at === 'reading' && state.big)) && <p className="muted small">{PRIVACY}</p>}
      <div role="alert" className="intake-alert">
        {error && (
          <p className="intake-error" id="intake-error">
            <AlertIcon />
            {error.error === 'too-large' ? `This file is ${error.mb} MB. The browser can map files up to 50 MB; the command line has no limit:` : chat && error.error === 'unsupported' ? CHAT_UNSUPPORTED : MESSAGE[error.error]}
            {!chat && error.error === 'unsupported' && <a href="?view=chat">For a chat, paste the conversation text instead.</a>}
          </p>
        )}
      </div>
      {(error?.error === 'too-large' || error?.error === 'worker') && <CommandLine command={COMMANDS.file} label="the command line" />}
      {chat ? (
        <>
          <p className="muted">{PRIVACY}</p>
          <details className="quiet-details">
            <summary>Where to find a chat</summary>
            <ul className="plain-list">
              <li>Copied text: select the whole conversation and paste it, with its “You said:” and “ChatGPT said:” lines (or “User:” and “Assistant:”, or Markdown headings). Without speaker lines, turns are assumed to alternate, starting with you.</li>
              <li>ChatGPT: Settings › Data controls › Export data. Unzip the download and choose <code>conversations.json</code>.</li>
              <li>Claude: Settings › Privacy › Export data. Unzip it and choose <code>conversations.json</code>.</li>
              <li>Share links can&apos;t be read from here: open the link and copy the conversation text instead.</li>
            </ul>
            <p>Reasoning or thinking text in an export is shown when it is there. Or <a href="?view=open">map an agent session</a>.</p>
          </details>
        </>
      ) : (
        <>
          <dl className="where">
            <div><dt>Claude Code</dt><dd className="code">~/.claude/projects/&lt;folder&gt;/&lt;id&gt;.jsonl</dd></div>
            <div><dt>Codex</dt><dd className="code">~/.codex/sessions/…/rollout-….jsonl</dd></div>
            <div><dt>Grok Build</dt><dd><span className="code">updates.jsonl</span> in the session folder</dd></div>
            <div><dt>Chat</dt><dd><a className="link" href="?view=chat">Paste the text</a> or drop a ChatGPT or Claude <span className="code">conversations.json</span></dd></div>
          </dl>
          <p className="muted small">Files up to 50 MB.</p>
        </>
      )}
    </div>
  );
}

function Progress({ lines, total, onCancel }: { lines: number; total: number; onCancel(): void }) {
  const text = progressText(lines, total);
  return (
    <div className="intake-progress" data-testid="intake-progress">
      <div className="progress-track" role="progressbar" aria-label="Reading session" aria-valuemin={0} aria-valuemax={total} aria-valuenow={lines} aria-valuetext={text}>
        <div className="progress-bar" style={{ inlineSize: `${total ? (100 * lines) / total : 0}%` }} />
      </div>
      <p>{total > 0 && lines >= total ? text : `Reading session… ${text}`}</p>
      <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** "The map couldn't be drawn" (DESIGN §12); the page's "Open another file" stays under it. */
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="intake-error page">
        <AlertIcon /> The map couldn&apos;t be drawn.
      </div>
    );
  }
}

/** The canvas Open frame's 24px file icon (docs/design/v7/gen7.mjs `openPage`), slate-11 strokes. */
function FileIcon() {
  return (
    <svg className="ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 2.75h8.5l4.75 4.75v13.75H6z" fill="var(--slate-1)" stroke="var(--slate-11)" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M14.25 2.75V7.75h5" fill="none" stroke="var(--slate-11)" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M9.5 13h6M9.5 16.5h4" stroke="var(--slate-11)" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
