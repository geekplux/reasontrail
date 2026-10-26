// The V3 consent dialog: a native modal <dialog> (focus stays inside, Esc cancels) that says exactly what would be
// sent, how many requests, to which endpoint, how it is redacted and what is cached. Nothing is sent until "Send".
import { useEffect, useId, useRef } from 'react';
import type { StructureSummary } from '../../shared/structureClient';

const n = (v: number, one: string, many = `${one}s`) => `${v.toLocaleString('en')} ${v === 1 ? one : many}`;

export function ConsentDialog({ summary, onSend, onCancel }: { summary: StructureSummary; onSend(): void; onCancel(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    cancel.current?.focus(); // a dialog that sends data opens on its safe choice
    return () => d?.close?.();
  }, []);
  const endpoint = new URL(summary.endpoint, window.location.href).href;
  return (
    <dialog
      ref={ref}
      className="ai-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onKeyDown={(e) => {
        // A native modal dialog lets Tab leave for the browser's own controls; keep it inside (focus trap).
        if (e.key !== 'Tab') return;
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('button') ?? [])];
        const edge = e.shiftKey ? items[0] : items[items.length - 1];
        if (document.activeElement === edge || !ref.current?.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? items[items.length - 1] : items[0])?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault(); // Esc: we close it ourselves, so the state and the focus stay in step
        onCancel();
      }}
    >
      <h2 id={titleId} className="ai-dialog-title">Ask a model to title this session?</h2>
      <p id={descId}>
        A model suggests a title for each step; the list shows them as tags and the tree rings their episodes. The map
        doesn&apos;t change; you can switch the titles off.
      </p>
      <dl className="ai-facts">
        <dt>What is sent</dt>
        <dd>{n(summary.steps, 'redacted step summary', 'redacted step summaries')}, {n(summary.characters, 'character')} in all</dd>
        <dt>Requests</dt>
        <dd>{summary.batches === 1 ? '1 request' : `${n(summary.batches, 'request')}, one after another`}</dd>
        <dt>To</dt>
        <dd className="mono">{endpoint}</dd>
        <dt>Redaction</dt>
        <dd>Secrets, tokens, emails and home paths are replaced before sending; each summary is at most 300 characters.</dd>
        <dt>Caching</dt>
        <dd>{summary.caching}</dd>
      </dl>
      <div className="ai-dialog-actions">
        <button type="button" className="btn primary" onClick={onSend}>Send</button>
        <button ref={cancel} type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </dialog>
  );
}
