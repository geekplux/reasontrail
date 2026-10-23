// The local viewer's chrome (DESIGN §13.1, §18.1): wordmark and Map/Outline, an optional quiet shared-copy line, the map
// (or the outline, `#view=outline`) and a one-line footer that says where the page was made. No website navigation.
import { useEffect, useState } from 'react';
import { Wordmark } from '../brand/Wordmark';
import { HOW_TO_READ_URL } from '../map/HonestyLabel';
import type { Loaded } from '../map/loadGraph';
import { MapView, ViewSwitch, useMapReady, type View } from '../map/MapView';
import { Outline } from '../map/Outline';
import { ShareAction } from '../share/ShareAction';

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
        {loaded.ok ? <ViewSwitch view={view} onChange={change} /> : null}
      </header>
      {meta?.shared && (
        <section className="shared-ribbon" aria-label="Shared copy">Shared copy · redacted ({meta.shared.replaced} items replaced)</section>
      )}
      <main className="site-main viewer-main">
        <h1 className="visually-hidden">Reasoning map</h1>
        {loaded.ok ? (
          view === 'map' ? <MapView graph={loaded.payload.graph} link="hash" ai={loaded.payload.labels ? { overlay: loaded.payload.labels } : undefined} /> : <Outline graph={loaded.payload.graph} />
        ) : (
          <ViewerError reason={loaded.reason} />
        )}
      </main>
      <footer className="viewer-footer">
        <span className="viewer-privacy">Generated on your machine · nothing was uploaded</span> · Reasontrail {meta?.version ?? ''} · <a href={HOW_TO_READ_URL}>How to read this map</a> · <a href={SOURCE}>Source</a>
        {loaded.ok && <> · <ShareAction graph={loaded.payload.graph} from="page" version={meta?.version} prior={meta?.shared?.replaced} /></>}
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
