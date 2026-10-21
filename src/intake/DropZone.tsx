// `?view=open` (DESIGN §13.4, §12; PLAN V1, V2, V5): drop or choose a session file; it is read and mapped in this
// browser, with progress and Cancel for big files, and calm, specific messages for anything that cannot be mapped.
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { COMMANDS } from '../../shared/commands';
import type { SessionGraph } from '../../shared/session/types';
import { LogoMark } from '../brand/LogoMark';
import { MapView, ViewSwitch, type View } from '../map/MapView';
import { Outline } from '../map/Outline';
import { CommandLine } from '../site/Install';
import { PRIVACY } from '../site/SiteShell';
import { startParse, warmIntake, type Job } from './intake';
import { MAX_BYTES, PROGRESS_MIN_BYTES, megabytes, type IntakeError } from './messages';

const ACCEPT = '.jsonl,.json,.ndjson,application/x-ndjson,application/jsonl';

type State =
  | { at: 'idle' }
  | { at: 'reading'; lines: number; total: number; big: boolean }
  | { at: 'error'; error: IntakeError; mb: number }
  | { at: 'done'; graph: SessionGraph; name: string };

const MESSAGE: Record<IntakeError, string> = {
  unsupported: "This doesn't look like a Claude Code, Codex or Grok Build session (.jsonl).",
  empty: 'This file has no steps we can map.',
  unreadable: "This file couldn't be read. Try choosing it again.",
  worker: "This browser couldn't start the reader for a file this size. The command line can map it:",
  'too-large': '',
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function OpenSession({ file, onFile }: { file: File | null; onFile(file: File): void }) {
  const [state, setState] = useState<State>({ at: 'idle' });
  const [said, setSaid] = useState('');
  const [view, setView] = useState<View>('map');
  const input = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const job = useRef<Job | null>(null);
  useEffect(() => void warmIntake(), []);

  // A new file starts a new read (state adjusted during render; the read itself starts in the effect below).
  const [seen, setSeen] = useState<File | null>(null);
  const big = !!file && file.size > PROGRESS_MIN_BYTES && file.size <= MAX_BYTES;
  if (file !== seen) {
    setSeen(file);
    if (file) {
      setState({ at: 'reading', lines: 0, total: 0, big });
      setSaid(big ? 'Reading session' : '');
    }
  }
  useEffect(() => {
    if (!file) return;
    let quarter = 0;
    performance.mark('tg:intake-start');
    const j = (job.current = startParse(file, (lines, total) => {
      setState({ at: 'reading', lines, total, big });
      const q = Math.floor((lines / Math.max(total, 1)) * 4);
      if (big && q > quarter && q < 4) setSaid(`Reading session: ${(quarter = q) * 25} %`);
    }));
    void j.result.then((r) => {
      if (job.current !== j || !r) return;
      job.current = null;
      performance.measure('tg:intake-parse', 'tg:intake-start'); // PLAN G2: ≤ 3 s for 10 MB
      if (!r.ok) return setState({ at: 'error', error: r.error, mb: megabytes(file.size) });
      const episodes = r.graph.episodes.filter((e) => !e.parentId).length;
      setSaid(`Map ready: ${plural(episodes, 'episode')}, ${plural(r.graph.trouble.length, 'detected pattern')}`);
      setView('map');
      setState({ at: 'done', graph: r.graph, name: file.name });
    });
    return () => j.cancel();
  }, [file, big]);
  useEffect(() => {
    if (state.at === 'done') title.current?.focus();
  }, [state.at]);

  const cancel = () => {
    job.current?.cancel();
    job.current = null;
    setState({ at: 'idle' });
    setSaid('Reading cancelled');
    requestAnimationFrame(() => input.current?.focus());
  };
  const error = state.at === 'error' ? state : null;

  return (
    <div className="page open-session">
      <p className="visually-hidden" role="status" data-role="intake-live">{said}</p>
      {state.at === 'done' ? (
        <>
          <div className="open-head">
            <h1 ref={title} tabIndex={-1} className="open-file"><span className="visually-hidden">Your session map: </span>{state.name}</h1>
            <ViewSwitch view={view} onChange={setView} />
            <button type="button" className="text-button" onClick={() => setState({ at: 'idle' })}>Open another file</button>
          </div>
          <MapBoundary key={view} onOutline={() => setView('outline')}>
            {view === 'map' ? <MapView graph={state.graph} /> : <Outline graph={state.graph} />}
          </MapBoundary>
        </>
      ) : (
        <>
          <h1 className="page-title">Map your own session</h1>
          {state.at === 'reading' && state.big ? (
            <Progress lines={state.lines} total={state.total} onCancel={cancel} />
          ) : (
            <div className="drop-target" data-testid="drop-target" data-busy={state.at === 'reading' || undefined}>
              <LogoMark />
              <p className="strong">Drop a .jsonl here</p>
              <label className="button">
                Choose a file
                <input ref={input} type="file" accept={ACCEPT} onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) onFile(f);
                }} />
              </label>
            </div>
          )}
          {error?.error === 'empty' && <span className="trail-stub" aria-hidden="true" />}
          <div role="alert" className="intake-alert">
            {error && (
              <p className="intake-error">
                <span className="bang" aria-hidden="true">!</span>
                {error.error === 'too-large' ? `This file is ${error.mb} MB. The browser can map files up to 50 MB; the command line has no limit:` : MESSAGE[error.error]}
              </p>
            )}
          </div>
          {(error?.error === 'too-large' || error?.error === 'worker') && <CommandLine command={COMMANDS.file} label="the command line" />}
          <p className="muted">{PRIVACY}</p>
          <details className="quiet-details">
            <summary>Supported files</summary>
            <ul className="plain-list">
              <li>Claude Code: <code>~/.claude/projects/&lt;folder&gt;/&lt;id&gt;.jsonl</code></li>
              <li>Codex: <code>~/.codex/sessions/…/rollout-….jsonl</code></li>
              <li>Grok Build: the session&apos;s <code>updates.jsonl</code></li>
            </ul>
            <p>Up to 50 MB. Or <a href="./">try a sample</a>.</p>
          </details>
        </>
      )}
    </div>
  );
}

function Progress({ lines, total, onCancel }: { lines: number; total: number; onCancel(): void }) {
  const text = `${lines.toLocaleString('en')} of ${total.toLocaleString('en')} lines`;
  return (
    <div className="intake-progress" data-testid="intake-progress">
      <div className="progress-track" role="progressbar" aria-label="Reading session" aria-valuemin={0} aria-valuemax={total} aria-valuenow={lines} aria-valuetext={text}>
        <div className="progress-bar" style={{ inlineSize: `${total ? (100 * lines) / total : 0}%` }} />
      </div>
      <svg className="route-skeleton" viewBox="0 0 600 24" aria-hidden="true" focusable="false">
        <path d="M12 12 H588" />
        {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={60 + i * 96} cy={12} r={6} />)}
      </svg>
      <p>Reading session… {text}</p>
      <button type="button" className="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** "The map couldn't be drawn" (DESIGN §12): the outline has everything. */
class MapBoundary extends Component<{ children: ReactNode; onOutline(): void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="intake-error">
        <span className="bang" aria-hidden="true">!</span> The map couldn&apos;t be drawn. The outline has everything:{' '}
        <button type="button" className="text-button" onClick={this.props.onOutline}>Open outline</button>
      </div>
    );
  }
}
