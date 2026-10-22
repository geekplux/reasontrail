// "Save shareable copy…" (PLAN V4, DESIGN §13.1, §13.9): a native modal dialog that first says what redaction will
// replace, can preview the redacted text, and saves the redacted map as one HTML file or as a 1200×630 map card.
// Loaded on first use only (ShareAction).
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { RAW_TEXT_MAX, type SessionGraph } from '../../shared/session/types';
import { cardLabel, renderCard } from './exportCard';
import { PLACEHOLDER, download, fetchTemplate, planShare, shareFileName, shareHtml, templateFromDocument } from './exportHtml';
import './share.css';

const n = (v: number, one: string, many = `${one}s`) => `${v.toLocaleString('en')} ${v === 1 ? one : many}`;

/** Text with each redaction placeholder marked (bold, bracketed and highlighted: never colour alone). */
function Marked({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    parts.push(text.slice(at, m.index), <mark key={m.index}><span className="visually-hidden">replaced: </span>{m[0]}</mark>);
    at = m.index + m[0].length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

export default function ShareDialog({ graph, from, version = '', prior = 0, onClose }: { graph: SessionGraph; from: 'site' | 'page'; version?: string | undefined; prior?: number | undefined; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const previewId = useId();
  const plan = useMemo(() => planShare(graph), [graph]);
  const [preview, setPreview] = useState(false);
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);
  const c = plan.counts;
  const run = async (what: string, job: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setSaid('Saving…');
    try {
      setSaid(`Saved ${await job()}`);
    } catch (err) {
      setSaid('');
      setError(`Could not save the ${what}: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };
  const saveHtml = () => run('HTML file', async () => {
    const name = shareFileName(plan.graph);
    const template = from === 'site' ? await fetchTemplate() : templateFromDocument(document);
    download(shareHtml(template, plan, version, prior), name, 'text/html');
    return name;
  });
  const saveCard = () => run('map card', async () => {
    const card = await renderCard(plan.graph);
    const name = shareFileName(plan.graph, 'png');
    download(card.png, name, 'image/png');
    setAlt(true);
    return name;
  });
  const label = alt ? cardLabel(plan.graph) : '';
  const copyAlt = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(label);
      setSaid('Alt text copied');
    } catch {
      setSaid('');
      setError('Could not copy the alt text: select it and copy it by hand.');
    }
  };
  return (
    <dialog
      ref={ref}
      className="share-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onKeyDown={(e) => {
        // Keep Tab inside the dialog (a native modal lets it leave for the browser's own controls).
        if (e.key !== 'Tab') return;
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('button, input') ?? [])];
        const edge = e.shiftKey ? items[0] : items[items.length - 1];
        if (document.activeElement === edge || !ref.current?.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? items[items.length - 1] : items[0])?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="share-title">Save a shareable copy</h2>
      <p id={descId} className="share-summary" data-share-summary>
        {c.total - c.cut > 0 ? `${n(c.secrets, 'secret')}, ${n(c.emails, 'email')}, ${n(c.paths, 'path')} will be replaced.` : 'No secrets, emails or home paths were found to replace.'}
        {c.cut > 0 && ` ${n(c.cut, 'cut-off string')} that might start a secret will be replaced too.`}
        {c.dropped > 0 && ` ${n(c.dropped, 'non-conversation record')} will be left out.`}
      </p>
      <dl className="share-facts">
        <dt>Included</dt>
        <dd>The map: {n(plan.graph.episodes.length, 'episode')}, {n(plan.graph.steps.length, 'step')}{plan.rawExcerpts > 0 && `, and ${n(plan.rawExcerpts, 'raw excerpt')} (each at most ${RAW_TEXT_MAX.toLocaleString('en')} characters)`}</dd>
        <dt>Opens</dt>
        <dd>Anywhere, offline: one HTML file with no requests</dd>
      </dl>
      <label className="share-toggle">
        <input type="checkbox" checked={preview} aria-controls={previewId} onChange={(e) => setPreview(e.target.checked)} /> Preview redacted
      </label>
      <div id={previewId} hidden={!preview}>
        {plan.examples.length > 0 ? (
          <ul className="share-examples" aria-label="Redacted excerpts">
            {plan.examples.map((x) => <li key={x} className="mono"><Marked text={x} /></li>)}
          </ul>
        ) : (
          <p className="muted">Nothing changes: the copy has the same text as this map.</p>
        )}
      </div>
      <div className="share-actions">
        <button type="button" className="share-primary" aria-disabled={busy || undefined} onClick={() => void saveHtml()}>Download HTML</button>
        <button type="button" aria-disabled={busy || undefined} onClick={() => void saveCard()}>Download map card (PNG)</button>
        <button type="button" className="text-button share-close" onClick={onClose}>Close</button>
      </div>
      {alt && (
        <div className="share-alt-box">
          <p className="share-alt"><span className="share-alt-label">Alt text for the card:</span> {label}</p>
          <button type="button" className="text-button" onClick={() => void copyAlt()}>Copy alt text</button>
        </div>
      )}
      <p className="share-status" role="status">{said}</p>
      <p className="share-error" role="alert">{error}</p>
    </dialog>
  );
}
