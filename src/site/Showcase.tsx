// The showcase home (DESIGN §13.3, §18.1): one focal point, the live map of a real session ("Watch the agents that
// built this app"); the headline and sub-line above it; the sample switcher, the install line and How to read after it.
import { useEffect, useState } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { InlineNote } from '../components/states/InlineNote';
import { HowToReadMap } from '../map/HowToReadMap';
import { MapView, ViewSwitch, type View } from '../map/MapView';
import { Outline } from '../map/Outline';
import { defaultSessionGraph, sessionSamples } from '../sessions/samples';
import { Gallery } from './Gallery';
import { InstallLine } from './Install';

export function Showcase({ session, view, onView, onSession }: { session: string | null; view: View; onView(v: View): void; onSession(id: string): void }) {
  const sample = sessionSamples.find((s) => s.id === session) ?? sessionSamples[0];
  const unknown = session !== null && sample?.id !== session;
  const [graph, setGraph] = useState<SessionGraph | null>(sample?.id === sessionSamples[0]?.id ? defaultSessionGraph : null);
  useEffect(() => {
    if (!graph) void sample?.load().then(setGraph);
  }, [graph, sample]);
  return (
    <div className="showcase">
      <div className="hero">
        <h1 className="headline">See how your coding agent got there.</h1>
        <p className="sub-line">Reasontrail turns a Claude Code, Codex or Grok Build session into a map: the task, the route, where it got stuck, what it changed.</p>
      </div>
      <section className="site-map showcase-map" aria-labelledby="h-watch">
        <h2 id="h-watch" className="section-label">Watch the agents that built this app</h2>
        {unknown && <InlineNote variant="info">That session isn&apos;t here, so here is “{sample?.title}”.</InlineNote>}
        {!graph ? <p className="muted">Loading the sample map…</p> : view === 'map' ? <MapView graph={graph} sample /> : <Outline graph={graph} sample />}
        <div className="showcase-controls">
          <Gallery samples={sessionSamples} current={sample?.id ?? ''} onChoose={onSession} />
          <ViewSwitch view={view} onChange={onView} />
        </div>
      </section>
      <InstallLine />
      <HowToReadMap />
    </div>
  );
}
