// The website (PLAN phase 16): the first view is the default sample's reasoning map; `?session=<id>` opens another
// sample (loaded lazily), `?view=outline` the outline. Garden links (`?sample=…`) still open the next-token lens.
import { lazy, Suspense, useEffect, useState } from 'react';
import type { SessionGraph } from '../shared/session/types';
import { readSiteState, writeView } from './app/urlState';
import { AppShell } from './components/AppShell';
import { InlineNote } from './components/states/InlineNote';
import { MapView, ViewSwitch, type View } from './map/MapView';
import { Outline } from './map/Outline';
import { defaultSessionGraph, sessionSamples } from './sessions/samples';

const Garden = lazy(() => import('./App').then((m) => ({ default: m.App })));

export function Site() {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const state = readSiteState(search);
  if (state.garden) {
    return (
      <Suspense fallback={null}>
        <Garden />
      </Suspense>
    );
  }
  return <SessionPage key={state.session ?? ''} session={state.session} view={state.view} onView={(v) => {
    const next = writeView(window.location.search, v);
    history.replaceState(history.state, '', `${window.location.pathname}${next}${window.location.hash}`);
    setSearch(next);
  }} />;
}

function SessionPage({ session, view, onView }: { session: string | null; view: View; onView(view: View): void }) {
  const sample = sessionSamples.find((s) => s.id === session) ?? sessionSamples[0];
  const unknown = session !== null && sample?.id !== session;
  const [graph, setGraph] = useState<SessionGraph | null>(sample?.id === sessionSamples[0]?.id ? defaultSessionGraph : null);
  useEffect(() => {
    if (!graph) void sample?.load().then(setGraph);
  }, [graph, sample]);
  return (
    <AppShell actions={<ViewSwitch view={view} onChange={onView} />} footer={<p>Zoom into the words: <a className="footer-link" href="?sample=">the next-token garden</a></p>}>
      <h1 className="visually-hidden">Reasoning map</h1>
      <div className="site-map">
        {unknown && <InlineNote variant="info">That session isn&apos;t here, so here is “{sample?.title}”.</InlineNote>}
        {!graph ? <p className="muted">Loading the sample map…</p> : view === 'map' ? <MapView graph={graph} sample /> : <Outline graph={graph} sample />}
      </div>
    </AppShell>
  );
}
