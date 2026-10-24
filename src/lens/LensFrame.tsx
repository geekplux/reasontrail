// The zoom-in lens (PLAN phase 22, Z1–Z3; DESIGN §13.5, DM35): the existing garden, unchanged, framed by a breadcrumb
// whose "Map" goes back, one line saying whose predictions these are (Z2), and the sentence with its source step.
// A recorded sentence grows from its recording with no network request; anything else grows live only after the
// reader opts in. Plain garden links (`?sample=cat`) open here too. Loaded on demand, so the map never carries it.
import { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ProviderError } from '../../shared/llm/types';
import { App, type LensSource } from '../App';
import { AppShell } from '../components/AppShell';
import { InlineNote } from '../components/states/InlineNote';
import type { CanGrow } from '../garden/buildTree';
import { mapSearch } from '../app/urlState';
import { LIVE_K, LIVE_MAX_CALLS, LIVE_MAX_DEPTH, liveProvider } from '../llm/cachedProvider';
import { providerMessage } from '../llm/messages';
import { InfoGlyph } from '../map/Glyph';
import { modelLabel } from '../samples/describe';
import type { SampleGarden } from '../samples/types';
import { sessionSamples } from '../sessions/samples';
import { pageTitle } from '../site/SiteShell';
import './lens.css';
import { LensIcon } from './LensIcon';
import { lensSamples, loadLensGarden, type LensSample } from './lensSamples';
import { LensProvider } from './lensProvider';
import type { LensTarget } from './lensTarget';

export const Z2_TEXT = "An open model's predictions for this text, not what the session's model computed.";
const OPT_IN = 'Grow live with an open model';
const OPT_IN_NOTE = 'Sends this text to the Reasontrail Worker. Nothing is sent until you choose this.';
/** The footer's privacy line once live growth is on (L6). */
const LIVE_PRIVACY = 'Live: this sentence is sent to the Reasontrail Worker to predict tokens.';

const loaded = new Map<string, Promise<SampleGarden | null>>();
/** One promise per recorded garden, so `use` sees the same one on every render; a failed load resolves to null. */
const recording = (id: string) => {
  if (!loaded.has(id)) loaded.set(id, loadLensGarden(id).catch(() => null));
  return loaded.get(id)!;
};

/** A recorded sentence opened from its link alone (a reload or a shared `?sample=lens-…`): provenance from the index. */
function fromRecording(rec: LensSample): LensTarget {
  const sample = sessionSamples.find((s) => s.id === rec.sampleId);
  return { sentence: rec.sentence, prompt: '', stepId: rec.stepId, where: sample?.short ?? rec.sampleId, sampleTitle: sample?.title, recorded: rec };
}

/** The garden a live-only sentence starts from: its opening words and nothing grown yet. */
function liveGarden(target: LensTarget): SampleGarden {
  const model = { provider: 'workers-ai', name: liveProvider().model };
  return { schemaVersion: 1, id: 'live', title: `${target.prompt}…`, prompt: target.prompt, model, recordedAt: '', k: LIVE_K, nodes: {} };
}

/** `target`: the sentence opened from the map in this tab, or null for a link. `focusOnOpen`: opened from the map. */
export function LensFrame({ target, focusOnOpen, onBack }: { target: LensTarget | null; focusOnOpen: boolean; onBack(): void }) {
  const [rec] = useState(() => target?.recorded ?? lensSamples.find((s) => s.gardenId === new URLSearchParams(window.location.search).get('sample')));
  useEffect(() => {
    document.title = pageTitle('Zoom-in lens');
  }, []);
  const lens = useMemo(() => target ?? (rec ? fromRecording(rec) : null), [target, rec]);
  if (lens) return <SentenceLens target={lens} focusOnOpen={focusOnOpen} onBack={onBack} />;
  return <App header={<LensHeader onBack={onBack} />} />;
}

function SentenceLens({ target, focusOnOpen, onBack }: { target: LensTarget; focusOnOpen: boolean; onBack(): void }) {
  const rec = target.recorded;
  const recorded = rec ? use(recording(rec.gardenId)) : null;
  const garden = useMemo(() => recorded ?? (rec ? null : liveGarden(target)), [recorded, rec, target]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<ProviderError | null>(null);
  const [, setCalls] = useState(0);
  const [mount, setMount] = useState(0);
  const provider = useMemo(
    () =>
      garden &&
      new LensProvider(garden.prompt, recorded, {
        onSettled: (err) => {
          setError(err);
          setCalls((n) => n + 1);
        },
      }),
    [garden, recorded],
  );
  const canGrow = useCallback<CanGrow>((key, depth) => Boolean(recorded && Object.hasOwn(recorded.nodes, key)) || (live && LensProvider.canGrowLive(depth)), [recorded, live]);
  const source = useMemo<LensSource | null>(
    () =>
      garden && provider && {
        garden,
        provider,
        urlId: rec?.gardenId ?? null,
        canGrow,
        missingText: live ? `Live growth stops ${LIVE_MAX_DEPTH} tokens past the opening words.` : providerMessage('not_recorded'),
        missingName: live ? `grows no deeper, ${LIVE_MAX_DEPTH}-token limit` : 'not in this recording',
        missingState: live ? `${LIVE_MAX_DEPTH}-token limit` : 'not recorded',
        liveOnly: !rec,
      },
    [garden, provider, rec, canGrow, live],
  );
  const optIn = () => {
    if (!provider) return;
    provider.goLive();
    setError(null);
    setLive(true);
    if (!recorded) setMount((n) => n + 1); // nothing grown yet: a new garden asks for its first fork, live
  };

  // The sentence moves from where it was in the panel to its place here (DESIGN §11, 240 ms; instant under reduced
  // motion, where the duration token is 0). Nothing waits for the animation.
  const quote = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const el = quote.current;
    const from = target.from;
    if (!el || !from || typeof el.animate !== 'function') return;
    const ms = parseFloat(getComputedStyle(el).getPropertyValue('--motion-ms')) || 0;
    const to = el.getBoundingClientRect();
    const easing = getComputedStyle(el).getPropertyValue('--motion-ease').trim() || 'ease-out';
    if (ms > 0) el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], { duration: ms, easing });
  }, [target]);
  useEffect(() => {
    if (focusOnOpen) document.getElementById('lens-title')?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  // After the opt-in, focus moves to the live status line, which says what is now on (A2).
  useEffect(() => {
    if (live) document.getElementById('lens-live')?.focus({ preventScroll: true });
  }, [live]); // set in the same batch as a new mount, so the new garden's bar is already drawn

  const where = target.where;
  const header = (
    <LensHeader onBack={onBack} where={where} quote={quote}>
      <p className="lens-sentence-text">{target.sentence}</p>
      <figcaption className="mono muted">
        Step {target.stepId}
        {target.where ? `, ${target.where}` : ''}
      </figcaption>
    </LensHeader>
  );
  if (!source) {
    return (
      <AppShell>
        {header}
        <div className="lens-bar">
          <InlineNote variant="error">The recorded lens couldn&apos;t load. Check your connection and try again.</InlineNote>
        </div>
      </AppShell>
    );
  }
  const status = (
    <div role="status" className="lens-status">
      {error ? <InlineNote variant="error">{providerMessage(error.code, error.retryAfterSec)}</InlineNote> : null}
    </div>
  );
  const offer = (
    <>
      <button type="button" className="lens-optin" onClick={optIn}>
        {OPT_IN}
      </button>
      <span className="muted">{OPT_IN_NOTE}</span>
    </>
  );
  // A recorded sentence needs no bar until live growth is on: the figcaption says it works offline and the opt-in waits
  // in More options. A sentence with no recording offers it right here.
  const bar = (
    <div className="lens-bar">
      {live ? (
        <p id="lens-live" className="lens-live muted" tabIndex={-1}>
          Live growth on, {modelLabel({ provider: '', name: provider!.model })}, {LIVE_K} branches per fork, up to {LIVE_MAX_DEPTH} tokens deep,{' '}
          {provider!.callsLeft} of {LIVE_MAX_CALLS} live calls left in this tab
        </p>
      ) : rec ? null : (
        <p className="lens-offer">
          <span className="muted">No recording for this sentence.</span>
          {offer}
        </p>
      )}
      {status}
    </div>
  );
  const options = rec && !live ? <p className="lens-offer lens-offer-options">{offer}</p> : null;
  return <App key={mount} header={header} lens={source} bar={bar} options={options} recorded={Boolean(rec)} privacy={live ? LIVE_PRIVACY : undefined} />;
}

/** Breadcrumb with Back, the Z2 line and, in a sentence's lens, the sentence itself (`children`, in a figure). */
function LensHeader({ onBack, where, quote, children }: { onBack(): void; where?: string; quote?: RefObject<HTMLElement | null>; children?: ReactNode }) {
  return (
    <div className="lens-head">
      {/* The page's one h1, focused when the lens opens from the map (A1); the visible title is the breadcrumb. */}
      <h1 id="lens-title" className="visually-hidden" tabIndex={-1}>
        Zoom-in lens{where ? `: ${where}` : ''}
      </h1>
      {/* The breadcrumb's "Map" is the way back (L2): it restores the map's selection and focus, as Back does. */}
      <div className="lens-crumbs">
        <nav aria-label="Breadcrumb">
          <ol className="mono lens-breadcrumb">
            <li>
              <a href={`${window.location.pathname}${mapSearch(window.location.search)}`} onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab still opens the map
                  e.preventDefault();
                  onBack();
                }}>
                <LensIcon />
                Map
              </a>
            </li>
            {where ? <li>{where}</li> : null}
            <li aria-current="page">{children ? 'Sentence' : 'Next-token garden'}</li>
          </ol>
        </nav>
      </div>
      <p className="lens-z2">
        <InfoGlyph />
        <span>{children ? Z2_TEXT : "An open model's predictions for this prompt, recorded so it works offline."}</span>
      </p>
      {children ? (
        <figure className="lens-quote" ref={quote}>
          {children}
        </figure>
      ) : null}
    </div>
  );
}
