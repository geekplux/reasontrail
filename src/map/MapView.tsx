// The glance (DESIGN §9, PLAN M1): the task, the route with side trails and blazes, where it got stuck, and the
// destination, all visible without a click. Pure layout in layout.ts; this component measures only the band width.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { LiveRegion, useAnnouncer } from '../components/LiveRegion';
import './outline.css';
import './map.css';
import { DetailPanel } from './DetailPanel';
import { itemForStep, readStepLink, stepRows, targetOf, writeStepLink, type LinkMode } from './details';
import { KindGlyph } from './Glyph';
import { jumpPattern } from './keyboard';
import { glanceLayout, laneLayout, troubleNumbers } from './layout';
import { SelectContext, type Selector } from './SelectContext';
import { StepList } from './StepList';
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

const here = () => ({ search: window.location.search, hash: window.location.hash });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
interface Sel { item: string; step: string | undefined; focus: boolean; raw?: boolean }

/** `link`: how a step link is written: `?step=` on the website, `#step=` in a local file (PLAN M9). */
export function MapView({ graph: g, sample = false, link = 'search' }: { graph: SessionGraph; sample?: boolean; link?: LinkMode }) {
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

  // Details on demand (M3, M9): the selected item and step, the expanded side trail, and where focus goes back to.
  const root = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [openLane, setOpenLane] = useState<string>();
  const opener = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const laneId = openLane?.slice('lane:'.length);
  const L2 = useMemo(() => (laneId ? laneLayout(g, laneId, width || 1216) : undefined), [g, laneId, width]);
  const laneMeta = g.lanes.find((l) => l.id === laneId);
  const trail = openLane && L2 ? { lane: openLane, L: L2, name: laneMeta?.agentType ?? laneMeta?.name ?? 'subagent' } : undefined;
  const target = sel ? targetOf(g, L, sel.item) : undefined;
  const rows = target ? stepRows(g, target.steps) : [];
  const url = (step: string | undefined, push: boolean) => {
    const next = writeStepLink(link, here(), step);
    if (next === `${window.location.search}${window.location.hash}`) return;
    history[push ? 'pushState' : 'replaceState'](history.state, '', `${window.location.pathname}${next}`);
  };
  const toggleLane = (id: string, on: boolean) => {
    setOpenLane(on ? id : undefined);
    const n = on ? g.episodes.filter((e) => e.laneId === id.slice('lane:'.length) && !e.parentId).length : 0;
    announce(on ? `Lane expanded, ${plural(n, 'episode')}` : 'Lane collapsed');
  };
  const choose = (item: string, step: string | undefined, opts: { push: boolean; focus: boolean; say?: string; raw?: boolean }) => {
    const t = targetOf(g, L, item);
    if (!t) return;
    const rs = stepRows(g, t.steps);
    const row = (step ? rs.find((r) => r.ids.includes(step)) : undefined) ?? rs.find((r) => r.ids.some((id) => t.evidence.has(id))) ?? rs[0];
    const active = document.activeElement as HTMLElement | null;
    if (opts.focus && active && !active.closest('.detail-panel')) opener.current = active;
    setSel({ item, step: row?.id, focus: opts.focus, ...(opts.raw ? { raw: true } : {}) });
    url(row?.id, opts.push);
    announce(`${opts.say ? `${opts.say}. ` : ''}Details: ${t.title}`);
  };
  const atStep = (stepId: string) => {
    const at = itemForStep(g, L, stepId);
    if (at?.lane) setOpenLane(at.lane);
    return at?.item;
  };
  const selector: Selector = {
    select: (item, step) => {
      const blaze = item.startsWith('trouble:') ? L.blazes.find((b) => b.trouble.some((t) => `trouble:${t.id}` === item))?.id : item;
      if (blaze) choose(blaze, step, { push: !sel, focus: true });
    },
    selectStep: (stepId, raw) => {
      const item = atStep(stepId);
      if (item) choose(item, stepId, { push: !sel, focus: true, raw: Boolean(raw) });
    },
    href: (stepId) => writeStepLink(link, here(), stepId),
  };
  const close = () => {
    const back = opener.current?.isConnected ? opener.current : sel ? root.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(sel.item)}"]`) : null;
    setSel(null);
    url(undefined, true);
    (back ?? root.current?.querySelector<HTMLElement>('[role="application"] [tabindex="0"]'))?.focus();
  };
  // Deep links and Back/Forward: the step in the URL is the selection.
  // Back that closes the panel puts focus on its map item (never <body>); Forward that reopens it from <body> focuses
  // its title. A deep link on load never moves focus.
  const fromUrl = useRef((_nav: boolean) => {});
  const read = (nav: boolean) => {
    const id = readStepLink(link, here());
    const item = id ? atStep(id) : undefined;
    const active = document.activeElement;
    if (!id || !item) {
      if (sel && active?.closest('.detail-panel')) {
        const el = root.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(sel.item)}"]`) ?? root.current?.querySelector<HTMLElement>('[role="application"] [tabindex="0"]');
        el?.focus();
      }
      return setSel(null);
    }
    const t = targetOf(g, L, item);
    const focus = nav && !sel && (!active || active === document.body);
    setSel({ item, step: t ? stepRows(g, t.steps).find((r) => r.ids.includes(id))?.id ?? id : id, focus });
  };
  useLayoutEffect(() => {
    fromUrl.current = read;
  });
  useEffect(() => {
    const sync = () => fromUrl.current(true);
    fromUrl.current(false);
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    const el = id ? root.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(id)}"]`) : null;
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
  });
  const openLaneOf = (id: string) => {
    const item = L.lanes.find((l) => l.lanes.some((x) => x.id === id));
    if (!item) return;
    if (item.id.startsWith('bundle:')) setExpanded((s) => new Set([...s, item.id]));
    toggleLane(`lane:${id}`, true);
    pendingFocus.current = `lane:${id}`;
  };
  const pattern = (dir: 1 | -1) => {
    const hit = jumpPattern(L, sel?.item, dir);
    if (hit) choose(hit.id, undefined, { push: false, focus: true, say: hit.say });
  };

  const count = g.episodes.filter((e) => e.laneId === g.lanes[0]?.id && !e.parentId).length;
  const [verify, , files] = glance(g);
  const heading = target ? (target.kind === 'pattern' ? `Steps in pattern ${L.numbers.get(target.trouble?.[0]?.id ?? '') ?? ''} · evidence highlighted` : `Steps in “${target.title.length > 48 ? `${target.title.slice(0, 47)}…` : target.title}”`) : '';
  return (
    <SelectContext.Provider value={selector}>
    <div ref={root} className={target ? 'map has-panel' : 'map'} data-testid="map" data-view="map" data-ready="true">
      <div className="map-body">
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
              current={sel?.item}
              onSelect={(id) => choose(id, undefined, { push: !sel, focus: true })}
              open={trail}
              onToggleLane={toggleLane}
              panelOpen={Boolean(target)}
              onClose={close}
            />
          )}
        </div>
        {target && rows.length > 0 && <StepList g={g} rows={rows} selected={sel?.step} evidence={target.evidence} heading={heading} onPick={(id) => { setSel((s) => s && { ...s, step: id, focus: false }); url(id, false); }} onClose={close} announce={announce} />}
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
      </div>
      {target && (
        <DetailPanel
          g={g}
          L={L}
          target={target}
          rows={rows}
          step={sel?.step}
          vertical={vertical}
          focusOnOpen={sel?.focus ?? false}
          openRaw={sel?.raw ?? false}
          onStep={(id) => { setSel((s) => s && { ...s, step: id, raw: false }); url(id, false); }}
          onClose={close}
          onPattern={pattern}
          onOpenLane={openLaneOf}
          linkFor={(id) => new URL(writeStepLink(link, here(), id), window.location.href).href}
          announce={announce}
        />
      )}
      <LiveRegion message={message} />
    </div>
    </SelectContext.Provider>
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
