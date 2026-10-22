import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LogprobProvider } from '../shared/llm/types';
import { readUrlState, writeUrlState } from './app/urlState';
import { AppShell } from './components/AppShell';
import { HowToRead } from './components/HowToRead';
import { LiveRegion, useAnnouncer } from './components/LiveRegion';
import { ShareButton } from './components/ShareButton';
import { SamplePicker } from './components/SamplePicker';
import { SpecimenFields, SpecimenLabel } from './components/SpecimenLabel';
import { TemperatureControl, TemperaturePresets } from './components/TemperatureControl';
import { InlineNote } from './components/states/InlineNote';
import { useOverflows } from './components/useOverflows';
import { buildTree, pathTo, type CanGrow } from './garden/buildTree';
import { GardenView } from './garden/GardenView';
import { initialScrollLeft, layoutGarden, placeNote } from './garden/layout';
import { Legend } from './garden/Legend';
import { PathReadout, SampledReadout, stopText } from './garden/PathReadout';
import { forksOf, samplePath } from './garden/samplePath';
import { grewMessage } from './garden/scales';
import { TableView } from './garden/TableView';
import { useGarden } from './garden/useGarden';
import { RecordedProvider } from './llm/recordedProvider';
import { defaultSample, samples } from './samples';
import type { SampleGarden } from './samples/types';
import './garden/garden.css';

const RECORDED_ONLY = 'Not in this recording.';
const SCROLL_CUE = { start: 'Scroll sideways for more →', middle: '← Scroll sideways →', end: '← Scroll sideways to the seed' };

/** A sentence's garden in the zoom-in lens (phase 22), shown in place of the picker's samples. */
export interface LensSource {
  garden: SampleGarden;
  /** Kept for the lens's life: a new one would mount a new garden. */
  provider: LogprobProvider;
  /** The `sample=` the address bar keeps: the recorded lens garden's id, or null for a sentence that only grows live. */
  urlId: string | null;
  canGrow: CanGrow;
  /** Said for a branch that can't grow, in place of "Not in this recording." */
  missingText: string;
  /** Its accessible-name part ("not in this recording", or the live depth limit) and its table/legend state. */
  missingName: string;
  missingState: string;
  /** Grown live only (no recording): the specimen card names the live model and no date. */
  liveOnly: boolean;
}

/** What the address bar asks for: the garden, the path to reopen, and whether anything was off. */
function boot(lens?: LensSource) {
  const url = readUrlState(window.location.search);
  if (lens) return { sample: lens.garden, urlId: lens.urlId, ranks: url.path, unknown: false, valid: url.valid, provider: lens.provider, t: url.t, seed: url.seed };
  const sample = samples.find((s) => s.id === url.sample) ?? defaultSample;
  const unknown = url.sample !== null && sample.id !== url.sample;
  const seed = unknown ? null : url.seed;
  return { sample, urlId: sample.id as string | null, ranks: unknown ? [] : url.path, unknown, valid: url.valid, provider: new RecordedProvider(sample) as LogprobProvider, t: url.t, seed };
}
/** `walk` counts "Sample a path" clicks (0: show a path at once, e.g. after a temperature change). */
type View = ReturnType<typeof boot> & { n: number; walk: number };
const newSeed = () => 1 + Math.floor(Math.random() * 9999);

/**
 * The picker and the garden it shows. Choosing a garden, or going back/forward to a share link (no network needed),
 * mounts a fresh garden: default expansion (D11) or the link's path, and the URL follows it. In the lens (`lens`) it
 * shows that sentence's garden instead, full width, with its specimen fields and the settings behind "More options"
 * (DESIGN §18.1); `header` and `bar` are the lens frame's (breadcrumb, Z2 line, live status), `options` its opt-in.
 */
export function App({ header, lens, bar, options, recorded, privacy }: { header?: ReactNode; lens?: LensSource; bar?: ReactNode; options?: ReactNode; recorded?: boolean; privacy?: string | undefined } = {}) {
  const [view, setView] = useState<View>(() => ({ ...boot(lens), n: 0, walk: 0 }));
  const [message, announce] = useAnnouncer();
  useEffect(() => {
    const reopen = () => setView((v) => ({ ...boot(lens), n: v.n + 1, walk: 0 }));
    window.addEventListener('popstate', reopen);
    return () => window.removeEventListener('popstate', reopen);
  }, [lens]);
  const choose = (id: string) => {
    const sample = samples.find((s) => s.id === id) ?? defaultSample;
    // A new history entry, so Back reopens the garden (and fork) the reader came from, offline too.
    const next = writeUrlState(window.location.search, { sample: sample.id, path: [], t: view.t, seed: null });
    history.pushState(null, '', `${window.location.pathname}${next}${window.location.hash}`);
    setView((v) => ({ ...v, sample, urlId: sample.id, ranks: [], unknown: false, valid: true, provider: new RecordedProvider(sample), seed: null, n: v.n + 1, walk: 0 }));
  };
  const sampleWith = (seed: number) => setView((v) => ({ ...v, seed, walk: v.walk + 1 }));
  const setT = (t: number) => setView((v) => ({ ...v, t, walk: 0 }));
  // Visible: the slider and "Sample a path"; the presets and New seed wait in More options (DESIGN §18.1, GA2).
  const settings = (
    <div className="controls-row">
      <TemperatureControl t={view.t} onChange={setT} />
      <button type="button" className="view-toggle" onClick={() => sampleWith(view.seed ?? newSeed())}>
        Sample a path
      </button>
    </div>
  );
  const extra = (
    <div className="controls-row">
      <TemperaturePresets t={view.t} onChange={setT} />
      <button type="button" className="view-toggle" onClick={() => sampleWith(newSeed())}>
        New seed
      </button>
    </div>
  );
  // More options: one quiet text button after the readout, beside Table view (L5). In the lens it also holds the
  // specimen fields, whether it works offline, the live opt-in and the settings.
  const more = (
    <details className="lens-options">
      <summary>
        More options
        <svg className="lens-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      {lens ? (
        <>
          <SpecimenFields sample={view.sample} live={lens.liveOnly} />
          {recorded ? <p className="muted fine">Recorded, works offline.</p> : null}
          {options}
          {settings}
        </>
      ) : null}
      {extra}
    </details>
  );
  return (
    <AppShell actions={<ShareButton announce={announce} />} footer={<HowToRead />} privacy={privacy}>
      {header}
      {lens ? null : (
        <div className="controls">
          <SamplePicker samples={samples} value={view.sample.id} onChange={choose} />
          {settings}
        </div>
      )}
      {bar}
      <Garden key={view.n} view={view} lens={lens} heading={header ? 'h2' : 'h1'} announce={announce} more={more} />
      <LiveRegion message={message} />
    </AppShell>
  );
}

function Garden({ view, lens, heading, announce, more }: { view: View; lens: LensSource | undefined; heading: 'h1' | 'h2'; announce(text: string): void; more: ReactNode }) {
  const { sample, ranks, unknown, valid, provider, t, seed, walk } = view;
  const missingText = lens?.missingText ?? RECORDED_ONLY;
  const recorded = useCallback<CanGrow>((key) => Object.hasOwn(sample.nodes, key), [sample]);
  const canGrow = lens?.canGrow ?? recorded;
  const { state, opened, activate, select, reveal } = useGarden(provider, sample.prompt, sample.k, ranks);
  // Children come only from provider answers (state.nodes); the recording's key list only marks what can grow.
  // The layout uses the recorded tree only, so temperature never re-runs it (spec §10.1); `shown` is the tempered tree.
  const build = useCallback(
    (temp: number) => buildTree({ prompt: sample.prompt, nodes: state.nodes }, state.expanded, canGrow, temp),
    [sample, state.nodes, state.expanded, canGrow],
  );
  const garden = useMemo(() => build(1), [build]);
  const shown = useMemo(() => (t === 1 ? garden : build(t)), [garden, build, t]);
  const layout = useMemo(() => {
    performance.mark('tg:layout'); // counted by the temperature flow: a slider step must not lay out again
    return layoutGarden(garden);
  }, [garden]);
  // The sampled path is a pure function of (recording, T, seed): zero calls; its forks open in the same frame.
  const sampled = useMemo(() => (seed === null ? null : samplePath(sample.nodes, t, seed)), [sample, t, seed]);
  useLayoutEffect(() => {
    if (!opened || !sampled) return;
    const keys = forksOf(sampled);
    reveal(Object.fromEntries(['', ...keys].map((k) => [k, sample.nodes[k]!])), keys);
  }, [opened, sampled, sample, reveal]);
  // A new object per walk too, so sampling again with the same seed says the sentence again.
  const sentence = useMemo(
    () => (sampled && seed !== null ? { walk, text: `Sampled (T ${t.toFixed(1)}, seed ${seed}): ${sample.prompt}${sampled.keys.at(-1) ?? ''} — stopped: ${stopText(sampled, sample.k)}` } : null),
    [sampled, seed, t, sample, walk],
  );
  useEffect(() => {
    if (!sentence) return;
    const timer = setTimeout(() => announce(sentence.text), 400); // once the slider settles, not on every step
    return () => clearTimeout(timer);
  }, [sentence, announce]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const selectedKey = state.selectedKey;
  const [scrollRef, position] = useOverflows<HTMLDivElement>();
  const [table, setTable] = useState(false);
  // The branch last activated, until its outcome (grown, collapsed, not recorded) is known and announced once.
  const pending = useRef<string | null>(null);
  const [activations, setActivations] = useState(0);
  const onActivate = (key: string) => {
    pending.current = key;
    setActivations((n) => n + 1);
    activate(key);
  };
  const notice = unknown
    ? `That garden isn't here, so here is “${sample.title}”.`
    : !valid || opened?.complete === false
      ? "Part of this link isn't in the recording."
      : null;
  const missing = selectedKey !== null && state.status[selectedKey] === 'not-recorded';
  // Next to the branch where it covers nothing, else on the readout line (spec §5).
  const noteBox = useMemo(() => (missing ? placeNote(layout, selectedKey, missingText.length) : null), [missing, layout, selectedKey, missingText]);

  // Narrow screens start at the open fork rather than at the seed (spec §8), once when the garden opens
  // (never after a click, which would undo the anchoring); wide ones clamp to 0.
  const scrolledTo = useRef(false);
  useLayoutEffect(() => {
    if (!opened || !scrollRef.current || scrolledTo.current) return;
    scrolledTo.current = true;
    scrollRef.current.scrollLeft = initialScrollLeft(garden);
  }, [scrollRef, opened, garden]);

  useEffect(() => {
    const key = activations > 0 ? pending.current : null; // re-checked after each activation and each answer
    if (key === null || state.status[key] === 'loading') return;
    pending.current = null;
    const b = pathTo(garden, key).at(-1);
    if (state.status[key] === 'not-recorded') announce(missingText);
    else if (b?.state === 'expanded') announce(grewMessage(b));
  }, [activations, garden, state.status, announce, missingText]);

  // Phones: the sticky readout covers the bottom of the viewport, so focus scrolling keeps that much clear (A1).
  useEffect(() => {
    const readout = document.querySelector<HTMLElement>('[data-role="readout"]');
    if (!readout || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--tg-readout-h', `${readout.offsetHeight}px`));
    observer.observe(readout);
    return () => observer.disconnect();
  }, []);

  // The address bar always reopens this view (F14): replaceState, debounced so rapid selection changes write once.
  useEffect(() => {
    if (!opened) return;
    const path = selectedKey ? pathTo(garden, selectedKey).map((b) => b.rank) : [];
    const next = writeUrlState(window.location.search, { sample: view.urlId, path, t, seed });
    if (next === window.location.search) return;
    const timer = setTimeout(() => history.replaceState(history.state, '', `${window.location.pathname}${next}${window.location.hash}`), 100);
    return () => clearTimeout(timer);
  }, [opened, selectedKey, garden, view.urlId, t, seed]);

  return (
    // In the lens the specimen fields sit in More options and the garden takes the full width (DESIGN D1).
    <div className={lens ? 'plate plate-wide' : 'plate'}>
      {lens ? null : <SpecimenLabel sample={sample} level={heading} />}
      <figure className="garden-figure">
        {notice ? <InlineNote variant="info">{notice}</InlineNote> : null}
        {position ? (
          <p className="scroll-cue" aria-hidden="true">
            {SCROLL_CUE[position]}
          </p>
        ) : null}
        {/* Scrolls sideways on narrow screens instead of shrinking the labels; never its own tab stop: the focused branch scrolls into view. */}
        <div ref={scrollRef} className="garden-scroll" role="region" aria-label="Garden drawing">
          {/* Sized by the drawing, so the overflow check sees it grow; the branch note is positioned in it. */}
          <div className="garden-canvas">
            {opened ? (
              <GardenView
                garden={shown}
                layout={layout}
                sampled={sampled && { path: sampled, walk }}
                selectedKey={selectedKey}
                hoverKey={hoverKey}
                onHover={setHoverKey}
                onActivate={onActivate}
                onSelect={select}
                missingName={lens?.missingName}
                note={noteBox ? { box: noteBox, content: <InlineNote variant="not-recorded" announced>{missingText}</InlineNote> } : null}
              />
            ) : null}
          </div>
        </div>
        <PathReadout
          garden={shown}
          labelledKey={hoverKey ?? selectedKey}
          note={missing && !noteBox ? <InlineNote as="span" variant="not-recorded" className="readout-note" announced>{missingText}</InlineNote> : null}
        />
        {sampled && seed !== null ? <SampledReadout prompt={sample.prompt} sampled={sampled} t={t} seed={seed} k={sample.k} /> : null}
        <div className="view-toggle-row">
          <button type="button" className="view-toggle" aria-pressed={table} onClick={() => setTable((on) => !on)}>
            Table view
          </button>
          {more}
        </div>
        {table ? <TableView garden={shown} t={t} missingState={lens?.missingState} /> : null}
        <Legend missingState={lens?.missingState} />
      </figure>
    </div>
  );
}
