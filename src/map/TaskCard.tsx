// The trailhead (DESIGN §8.9): the task card with the honesty label, and the three At a glance rows. Shared by the map
// and the outline.
import { useLayoutEffect, useRef, useState } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { InfoGlyph, KindGlyph, NeutralPlateGlyph, PlateGlyph, StatusGlyph } from './Glyph';
import { HonestyLabel } from './HonestyLabel';
import { REQUEST_MAX, glance, parseNotes, skippedWhere, taskCard } from './outline';

/** The first request in serif: at most 280 chars and 2 lines until "more" (M1a, DM5). */
function Request({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || more) return;
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
  }, [more]);
  const long = text.length > REQUEST_MAX;
  return (
    <div className="task-request">
      <p ref={ref} className={more ? 'task-title' : 'task-title is-clamped'}>
        {long && !more ? `${text.slice(0, REQUEST_MAX - 1)}…` : text}
      </p>
      {(long || clamped || more) && (
        <button type="button" className="link-button" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

export function TaskCard({ g, sample = false }: { g: SessionGraph; sample?: boolean }) {
  const card = taskCard(g);
  const where = skippedWhere(g);
  return (
    <section className="region task-card" data-region="task" aria-labelledby="h-task">
      <h2 id="h-task" className="section-label">Task <span>· {card.label}{sample ? ' · sample' : ''}</span></h2>
      <Request text={card.request.replace(/\*\*|`/g, '')} />
      <p className="mono muted task-meta">{card.meta.map((m) => <span key={m} className={/ wall$|^\d+ thinking/.test(m) ? 'meta-extra' : undefined}>{m}</span>)}</p>
      {parseNotes(g).map((n) => (
        <p key={n} className="note"><InfoGlyph /><span>{n}</span></p>
      ))}
      {where.length > 0 && (
        <details className="skipped-where">
          <summary>Show where</summary>
          <p className="mono">{where.join(', ')}</p>
        </details>
      )}
      <HonestyLabel />
    </section>
  );
}

/** Verified? Trouble? Files? Each row is a glyph, a bold lead and the rest (DESIGN §8.9, DM7). */
export function GlanceRows({ g }: { g: SessionGraph }) {
  const open = g.trouble.find((t) => !t.resolved);
  return (
    <section className="region glance" data-region="glance" aria-labelledby="h-glance">
      <h2 id="h-glance" className="section-label">At a glance</h2>
      <ul className="glance-rows">
        {glance(g).map((r) => (
          <li key={r.key} data-glance={r.key} data-status={r.status}>
            {r.key === 'trouble' && g.trouble.length > 0 ? (open ? <PlateGlyph kind={open.kind} resolved={false} /> : <NeutralPlateGlyph />) : r.key === 'files' ? <KindGlyph kind="change" /> : <StatusGlyph status={r.status} />}{' '}
            <span><strong>{r.lead}</strong>{r.rest}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
