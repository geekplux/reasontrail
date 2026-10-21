// The glance (DESIGN §9, PLAN M1): the task, the route with side trails and blazes, where it got stuck, and the
// destination, all visible without a click. Pure layout in layout.ts; this component measures only the band width.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { LiveRegion, useAnnouncer } from '../components/LiveRegion';
import './outline.css';
import './map.css';
import { KindGlyph } from './Glyph';
import { glanceLayout, troubleNumbers } from './layout';
import { MapLegend } from './MapLegend';
import { OutcomeCard } from './OutcomeCard';
import { glance } from './outline';
import { RouteView } from './RouteView';
import { GlanceRows, TaskCard } from './TaskCard';
import { StuckList } from './TroubleMarker';

const NARROW = '(max-width: 767px)';
const subscribe = (cb: () => void) => {
  const m = typeof matchMedia === 'function' ? matchMedia(NARROW) : undefined;
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
};
const narrow = () => typeof matchMedia === 'function' && matchMedia(NARROW).matches;

/** `performance.mark('tg:map-ready')` once the first view is drawn (PLAN G2). */
export function useMapReady() {
  useEffect(() => {
    if (performance.getEntriesByName('tg:map-ready').length === 0) performance.mark('tg:map-ready');
  }, []);
}

export function MapView({ graph: g, sample = false }: { graph: SessionGraph; sample?: boolean }) {
  const [message, announce] = useAnnouncer();
  const vertical = useSyncExternalStore(subscribe, narrow, () => false);
  const band = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [unfolded, setUnfolded] = useState(false);
  useLayoutEffect(() => {
    const el = band.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);
  const numbers = troubleNumbers(g);
  const L = useMemo(() => glanceLayout(g, width || 1216, { unbundle: expanded, unfold: unfolded, numbers }), [g, width, expanded, unfolded, numbers]);
  useMapReady();
  const count = g.episodes.filter((e) => e.laneId === g.lanes[0]?.id && !e.parentId).length;
  const [verify, , files] = glance(g);
  return (
    <div className="map" data-testid="map" data-view="map" data-ready="true">
      <div className="trailhead">
        <TaskCard g={g} sample={sample} />
        <GlanceRows g={g} />
      </div>
      <section className="region route-band" data-region="route" aria-labelledby="h-route">
        <div className="route-head">
          <h2 id="h-route" className="section-label">Route <span>· {count === 1 ? '1 episode' : `${count} episodes`} · in order</span></h2>
          <MapLegend />
        </div>
        <div ref={band}>
          {g.steps.length === 0 ? (
            <div className="empty">
              <span className="trail-stub" aria-hidden="true" />
              <p className="strong">This session has no steps yet.</p>
              <p className="muted">Run /reasontrail again after the agent has done some work.</p>
            </div>
          ) : (
            <RouteView
              L={L}
              title={g.title}
              vertical={vertical}
              expanded={expanded}
              unfolded={unfolded}
              onExpand={(id, open) => setExpanded((s) => (open ? new Set([...s, id]) : new Set([...s].filter((x) => x !== id))))}
              onUnfold={() => setUnfolded(true)}
              announce={announce}
            />
          )}
        </div>
      </section>
      <a className="dest-bar" href="#destination">
        <KindGlyph kind="answer" />
        <span className="dest-bar-text">
          <span className="section-label">Destination</span>
          <span><strong>{g.outcome.files.length === 1 ? '1 file' : `${g.outcome.files.length} files`}</strong> · {verify?.status === 'ok' ? 'verified' : 'not verified'}{files?.rest ? ` · ${files.rest.replace(/^, /, '')}` : ''}</span>
        </span>
        <span className="chevron" aria-hidden="true" />
      </a>
      <div className="bottom-band">
        <StuckList g={g} L={L} />
        <OutcomeCard g={g} />
      </div>
      <LiveRegion message={message} />
    </div>
  );
}

export type View = 'map' | 'outline';

/** Map / Outline (DESIGN §9.1): two toggle buttons; the outline is the equivalent text view (G1). */
export function ViewSwitch({ view, onChange }: { view: View; onChange(view: View): void }) {
  return (
    <div className="view-switch" role="group" aria-label="View">
      <button type="button" aria-pressed={view === 'map'} onClick={() => onChange('map')}>Map</button>
      <button type="button" aria-pressed={view === 'outline'} onClick={() => onChange('outline')}>Outline</button>
    </div>
  );
}
