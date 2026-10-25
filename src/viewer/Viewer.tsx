// The local viewer (v7 §7 "Local viewer", docs/design/v7/preview/Home.html without the site chrome): the wordmark
// header, the session's tree at the full content width with its legend, the session card (title, meta line, AI titles
// when the page has them, Details, Share; the git-style list and the outcome or the step's detail panel) and a footer
// of two plain links. The selected step lives in the hash (`#step=s41`), so it works from file:// and deep links
// within the file open the same state. One file, no requests.
import { useEffect, useState } from 'react';
import { Wordmark } from '../brand/Wordmark';
import { AlertIcon } from '../map/gitlist/marks';
import type { Loaded, ViewerPayload } from '../map/loadGraph';
import { TreeLegend } from '../map/tree/TreeLegend';
import { HeroTree } from '../site/HeroTree';
import { SessionCard } from '../site/SessionCard';
import { usePhone } from '../site/usePhone';
import { useSessionMap } from '../site/useSessionMap';

export const SITE_URL = 'https://reasontrail.geekplux.com';
export const MAKER_URL = 'https://geekplux.com';

/** The step in the hash: `#step=s41` (other hash text is ignored). */
export function readStep(hash = window.location.hash): string | null {
  const m = /^#(?:.*&)?step=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** The hash state: opening a step from none and closing the panel are history entries; stepping replaces the entry. */
function useHashStep(): [string | null, (stepId: string | undefined) => void] {
  const [step, setStep] = useState(() => readStep());
  useEffect(() => {
    const sync = () => setStep(readStep());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  const write = (next: string | undefined) => {
    const { pathname, search } = window.location;
    history[step && next ? 'replaceState' : 'pushState'](history.state, '', `${pathname}${search}${next ? `#step=${encodeURIComponent(next)}` : ''}`);
    setStep(next ?? null);
  };
  return [step, write];
}

function Session({ payload }: { payload: ViewerPayload }) {
  const { graph, meta, labels } = payload;
  const phone = usePhone();
  const [step, onStep] = useHashStep();
  const { hovered, onActive, picked, selection, callout, select, onPick, focusDetail } = useSessionMap('viewer', graph, step, onStep);
  const replaced = meta.shared?.replaced;
  return (
    <>
      <div className="hero">
        <HeroTree id="tree" g={graph} hover={hovered} onHover={(e) => onActive(e, 'pointer')} selected={picked?.step.stepId} callout={callout} onPick={onPick} legend={!phone} />
        {phone && <div className="under"><TreeLegend /></div>}
      </div>
      <SessionCard id="session" g={graph} tag={replaced === undefined ? undefined : `Shared copy, redacted (${replaced} items replaced)`}
        ai={labels ? { overlay: labels } : null} share={{ from: 'page', version: meta.version, prior: replaced }}
        hover={hovered} onActive={(a, via) => onActive(a?.episodeId, via)} selection={selection} onSelect={(next) => select(next)} focusDetail={focusDetail} />
    </>
  );
}

export function Viewer({ loaded }: { loaded: Loaded }) {
  return (
    <>
      <header className="v7 bar">
        <Wordmark />
      </header>
      <main className="v7 viewer">
        <h1 className="visually-hidden">Reasoning map</h1>
        {loaded.ok ? <Session payload={loaded.payload} /> : (
          <div className="viewer-error">
            <p className="strong"><AlertIcon size={14} /> {loaded.reason}</p>
            <p className="muted">Run the command again to write a fresh page.</p>
          </div>
        )}
      </main>
      <footer className="v7 foot">
        <a href={SITE_URL}>Made with Reasontrail</a>
        <nav aria-label="More">
          <a href={MAKER_URL}>geekplux.com</a>
        </nav>
      </footer>
    </>
  );
}
