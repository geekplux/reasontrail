// The local viewer's chrome (DESIGN §13.1): wordmark, the privacy line, an optional shared-copy ribbon, the outline
// (the only view in phase 13) and a one-line footer. No website navigation.
import { useEffect } from 'react';
import { Wordmark } from '../brand/Wordmark';
import { HOW_TO_READ_URL } from '../map/HonestyLabel';
import type { Loaded } from '../map/loadGraph';
import { Outline } from '../map/Outline';

const SOURCE = 'https://github.com/geekplux/reasontrail';

export function Viewer({ loaded }: { loaded: Loaded }) {
  useEffect(() => {
    if (loaded.ok) performance.mark('tg:map-ready');
  }, [loaded]);
  const meta = loaded.ok ? loaded.payload.meta : undefined;
  return (
    <>
      <header className="site-header viewer-header">
        <Wordmark />
        <p className="viewer-privacy">Generated on your machine · nothing was uploaded</p>
      </header>
      {meta?.shared && (
        <p className="shared-ribbon">Shared copy · redacted ({meta.shared.replaced} items replaced)</p>
      )}
      <main className="site-main viewer-main">
        {loaded.ok ? (
          <Outline graph={loaded.payload.graph} />
        ) : (
          <div className="viewer-error" data-testid="map" data-ready="false">
            <p className="strong"><span className="bang" aria-hidden="true">!</span> {loaded.reason}</p>
            <p>Run the command again to write a fresh page.</p>
          </div>
        )}
      </main>
      <footer className="viewer-footer">
        Reasontrail {meta?.version ?? ''} · <a href={HOW_TO_READ_URL}>How to read this map</a> · <a href={SOURCE}>Source</a>
      </footer>
    </>
  );
}
