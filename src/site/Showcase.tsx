// The showcase home (DESIGN §13.3, §18.1): one focal point, the live map of a real session ("Watch the agents that
// built this app", its region's name); the headline and sub-line above it; Map/Outline at the right end of the task's
// eyebrow row; the sample switcher, the install line and How to read (folded) after it.
import { useEffect, useState } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { InlineNote } from '../components/states/InlineNote';
import { HowToReadMap } from '../map/HowToReadMap';
import { LIVE_AI, MapView, ViewSwitch, type View } from '../map/MapView';
import { Outline } from '../map/Outline';
import { defaultSessionGraph, sessionSamples } from '../sessions/samples';
import { ShareAction } from '../share/ShareAction';
import { Gallery } from './Gallery';
import { InstallLine } from './Install';

export function Showcase({ session, view, onView, onSession }: { session: string | null; view: View; onView(v: View): void; onSession(id: string): void }) {
  const sample = sessionSamples.find((s) => s.id === session) ?? sessionSamples[0];
  const unknown = session !== null && sample?.id !== session;
  // The loaded graph is kept per sample id, so switching samples re-renders the map without remounting the switcher
  // (focus stays on the chosen radio or the select).
  const [loaded, setLoaded] = useState<{ id: string; graph: SessionGraph } | null>(
    sample && sample.id === sessionSamples[0]?.id ? { id: sample.id, graph: defaultSessionGraph } : null,
  );
  const graph = loaded && loaded.id === sample?.id ? loaded.graph : null;
  useEffect(() => {
    if (graph || !sample) return;
    let live = true; // a late answer for a sample left behind must not replace the current one
    void sample.load().then((g) => live && setLoaded({ id: sample.id, graph: g }));
    return () => {
      live = false;
    };
  }, [graph, sample]);
  const toggle = <ViewSwitch view={view} onChange={onView} />;
  return (
    <div className="showcase">
      <div className="hero">
        <h1 className="headline" tabIndex={-1}>See how your coding agent got there.</h1>
        <p className="sub-line">Reasontrail turns a Claude Code, Codex or Grok Build session into a map: the task, the route, where it got stuck, what it changed.</p>
      </div>
      <section className="site-map showcase-map" aria-labelledby="h-watch">
        <h2 id="h-watch" className="visually-hidden">Watch the agents that built this app</h2>
        {unknown && <InlineNote variant="info">That session isn&apos;t here, so here is “{sample?.title}”.</InlineNote>}
        {!graph ? <p className="muted">Loading the sample map…</p> : view === 'map' ? <MapView key={sample?.id} graph={graph} sample ai={LIVE_AI} head={toggle} /> : <Outline key={sample?.id} graph={graph} sample head={toggle} />}
        <div className="showcase-controls">
          <Gallery samples={sessionSamples} current={sample?.id ?? ''} onChoose={onSession} />
          {graph && <ShareAction graph={graph} from="site" />}
        </div>
      </section>
      <InstallLine />
      <HowToReadMap />
    </div>
  );
}
