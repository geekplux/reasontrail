// The trailhead (DESIGN §8.9): the task card with the honesty label, and the three At a glance rows. Shared by the map
// and the outline.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { InfoGlyph, KindGlyph, NeutralPlateGlyph, StatusGlyph } from './Glyph';
import { HonestyLabel } from './HonestyLabel';
import { selectOnClick, useSelector } from './SelectContext';
import { REQUEST_MAX, glance, parseNotes, skippedWhere, taskCard } from './outline';

/** The first request in serif: at most 280 chars and 2 lines until "more" (M1a, DM5). With an authored `title`
 * (samples and shared copies that carry one) the title is shown instead, and the raw first request waits in Session
 * details, so the trailhead keeps one control fewer (CL2). */
function Request({ text, title }: { text: string; title?: string | undefined }) {
  const [more, setMore] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || more || title !== undefined) return;
    let live = true;
    // Half a line of tolerance: serif ascenders and sub-pixel line boxes must not count as a third line.
    const check = () => {
      if (live) setClamped(el.scrollHeight - el.clientHeight > parseFloat(getComputedStyle(el).lineHeight) / 2);
    };
    check();
    void document.fonts?.ready.then(check);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    observer?.observe(el);
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [more, title]);
  const long = text.length > REQUEST_MAX;
  const shown = title ?? (long && !more ? `${text.slice(0, REQUEST_MAX - 1)}…` : text);
  return (
    <div className="task-request">
      <p ref={ref} className={more || title !== undefined ? 'task-title' : 'task-title is-clamped'}>{shown}</p>
      {title === undefined && (long || clamped || more) && (
        <button type="button" className="link-button" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

/** `title`: an authored heading (a sample's or a shared copy's), shown in place of the first request. `label`: one more
 * word for the TASK eyebrow ("pasted"). `head`: header items at the eyebrow row's right end (the Map/Outline switch). */
export function TaskCard({ g, sample = false, title, label, head }: { g: SessionGraph; sample?: boolean; title?: string | undefined; label?: string | undefined; head?: ReactNode }) {
  const card = taskCard(g);
  const where = skippedWhere(g);
  const [details, setDetails] = useState(false);
  const detailsId = useId();
  const request = card.request.replace(/\*\*|`/g, '');
  const folded = card.details.length > 0 || title !== undefined;
  return (
    <section className="region task-card" data-region="task" aria-labelledby="h-task">
      <div className="task-eyebrow">
        <h2 id="h-task" className="section-label task-label">
          Task <span>· {card.source}{sample ? ' · sample' : ''}{label ? ` · ${label}` : ''}</span>
        </h2>
        {head}
      </div>
      <Request text={request} title={title} />
      <p className="mono muted task-meta">
        <span>{card.meta.map((m) => <span key={m} className="meta-item">{m}</span>)}</span>
        {folded && <button type="button" className="link-button session-toggle" aria-expanded={details} aria-controls={detailsId} onClick={() => setDetails(!details)}>Session details</button>}
      </p>
      {/* Folded, never deleted (CL4): the rest of the meta, the model and an authored title's first request. */}
      {folded && <div id={detailsId} className="session-details" hidden={!details}>
        {card.details.length > 0 && <p className="mono muted">{card.details.map((m) => <span key={m} className="meta-item">{m}</span>)}</p>}
        {title !== undefined && <p className="task-raw"><span className="sub-label">First request</span>{request}</p>}
      </div>}
      {parseNotes(g).map((n) => (
        <p key={n} className="note"><InfoGlyph /><span>{n}</span></p>
      ))}
      {where.length > 0 && (
        <details className="skipped-where">
          <summary>Show where</summary>
          <p className="mono">{where.join(', ')}</p>
        </details>
      )}
      <HonestyLabel chat={g.source.kind === 'chat'} />
    </section>
  );
}

/** Verified? Trouble? Files? Each row is a glyph, a bold lead and the rest (DESIGN §8.9, DM7). */
export function GlanceRows({ g }: { g: SessionGraph }) {
  const open = g.trouble.find((t) => !t.resolved);
  const sel = useSelector();
  // Each row is a link that selects its target in the map (DESIGN §10.3); plain text in the outline.
  const v = g.outcome.lastVerification;
  const t = open ?? g.trouble[0];
  const link = (key: string, text: ReactNode) => {
    if (!sel) return text;
    if (key === 'verify' && v) return <a href={sel.href(v.stepId)} onClick={selectOnClick(() => sel.selectStep(v.stepId))}>{text}</a>;
    if (key === 'trouble' && t) return <a href={sel.href(t.stepIds[0])} onClick={selectOnClick(() => sel.select(`trouble:${t.id}`))}>{text}</a>;
    if (key === 'files' && g.outcome.files.length > 0) return <a href="#destination" onClick={selectOnClick(() => sel.select('files'))}>{text}</a>;
    return text;
  };
  return (
    <section className="region glance" data-region="glance" aria-labelledby="h-glance">
      <h2 id="h-glance" className="section-label">At a glance</h2>
      <ul className="glance-rows">
        {glance(g).map((r) => (
          <li key={r.key} data-glance={r.key} data-status={r.status}>
            {r.key === 'trouble' && g.trouble.length > 0 ? <NeutralPlateGlyph open={open !== undefined} /> : r.key === 'files' ? <KindGlyph kind="change" /> : <StatusGlyph status={r.status} />}{' '}
            <span>{link(r.key, <><strong>{r.lead}</strong>{r.rest}</>)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
