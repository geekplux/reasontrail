// The local viewer's chrome (DESIGN §13.1): wordmark, Map/Outline, the privacy line, an optional shared-copy ribbon,
// the map (or the outline, `#view=outline`) and a one-line footer. No website navigation.
import { useEffect, useState } from 'react';
import { Wordmark } from '../brand/Wordmark';
import { HOW_TO_READ_URL } from '../map/HonestyLabel';
import type { Loaded } from '../map/loadGraph';
import { MapView, ViewSwitch, useMapReady, type View } from '../map/MapView';
import { Outline } from '../map/Outline';

const SOURCE = 'https://github.com/geekplux/reasontrail';
const readView = (): View => (/(^#|&)view=outline(&|$)/.test(window.location.hash) ? 'outline' : 'map');

export function Viewer({ loaded }: { loaded: Loaded }) {
  const [view, setView] = useState(readView);
  useEffect(() => {
    const sync = () => setView(readView());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const change = (next: View) => {
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${next === 'outline' ? '#view=outline' : ''}`);
    setView(next);
  };
  const meta = loaded.ok ? loaded.payload.meta : undefined;
  return (
    <>
      <header className="site-header viewer-header">
        <Wordmark />
        {loaded.ok ? <ViewSwitch view={view} onChange={change} /> : <span />}
        <p className="viewer-privacy">Generated on your machine · nothing was uploaded</p>
      </header>
      {meta?.shared && (
        <section className="shared-ribbon" aria-label="Shared copy">Shared copy · redacted ({meta.shared.replaced} items replaced)</section>
      )}
      <main className="site-main viewer-main">
        <h1 className="visually-hidden">Reasoning map</h1>
        {loaded.ok ? (
          view === 'map' ? <MapView graph={loaded.payload.graph} /> : <Outline graph={loaded.payload.graph} />
        ) : (
          <ViewerError reason={loaded.reason} />
        )}
      </main>
      <footer className="viewer-footer">
        Reasontrail {meta?.version ?? ''} · <a href={HOW_TO_READ_URL}>How to read this map</a> · <a href={SOURCE}>Source</a>
      </footer>
    </>
  );
}

function ViewerError({ reason }: { reason: string }) {
  useMapReady();
  return (
    <div className="viewer-error" data-testid="map" data-ready="false">
      <p className="strong"><span className="bang" aria-hidden="true">!</span> {reason}</p>
      <p>Run the command again to write a fresh page.</p>
    </div>
  );
}
