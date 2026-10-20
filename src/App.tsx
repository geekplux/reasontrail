import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readUrlState, writeUrlState } from './app/urlState';
import { AppShell } from './components/AppShell';
import { ShareButton } from './components/ShareButton';
import { SpecimenLabel } from './components/SpecimenLabel';
import { InlineNote } from './components/states/InlineNote';
import { useOverflows } from './components/useOverflows';
import { buildTree, pathTo } from './garden/buildTree';
import { GardenView } from './garden/GardenView';
import { initialScrollLeft, layoutGarden, placeNote } from './garden/layout';
import { Legend } from './garden/Legend';
import { PathReadout } from './garden/PathReadout';
import { useGarden } from './garden/useGarden';
import { RecordedProvider } from './llm/recordedProvider';
import { defaultSample, samples } from './samples';

const NOT_RECORDED = 'Not in this recording.';
const SCROLL_CUE = { start: 'Scroll sideways for more →', middle: '← Scroll sideways →', end: '← Scroll sideways to the seed' };

/** What the address bar asked for, read once: the garden, the path to reopen, and whether anything was off. */
function boot() {
  const url = readUrlState(window.location.search);
  const sample = samples.find((s) => s.id === url.sample) ?? defaultSample;
  const unknown = url.sample !== null && sample.id !== url.sample;
  return { sample, ranks: unknown ? [] : url.path, unknown, valid: url.valid, provider: new RecordedProvider(sample) };
}

export function App() {
  const [{ sample, ranks, unknown, valid, provider }] = useState(boot);
  const { state, opened, activate } = useGarden(provider, sample.prompt, sample.k, ranks);
  // Children come only from provider answers (state.nodes); the recording's key list only marks what can grow.
  const garden = useMemo(
    () => buildTree({ prompt: sample.prompt, nodes: state.nodes }, state.expanded, (key) => Object.hasOwn(sample.nodes, key)),
    [sample, state.nodes, state.expanded],
  );
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const selectedKey = state.selectedKey;
  const [scrollRef, position] = useOverflows<HTMLDivElement>();
  const notice = unknown
    ? `That garden isn't here, so here is “${sample.title}”.`
    : !valid || opened?.complete === false
      ? "Part of this link isn't in the recording."
      : null;
  const missing = selectedKey !== null && state.status[selectedKey] === 'not-recorded';
  // Next to the branch where it covers nothing, else on the readout line (spec §5).
  const noteBox = useMemo(() => (missing ? placeNote(layoutGarden(garden), selectedKey, NOT_RECORDED.length) : null), [missing, garden, selectedKey]);

  // Narrow screens start at the open fork rather than at the seed (spec §8), once when the garden opens
  // (never after a click, which would undo the anchoring); wide ones clamp to 0.
  const scrolledTo = useRef(false);
  useLayoutEffect(() => {
    if (!opened || !scrollRef.current || scrolledTo.current) return;
    scrolledTo.current = true;
    scrollRef.current.scrollLeft = initialScrollLeft(garden);
  }, [scrollRef, opened, garden]);

  // The address bar always reopens this view (F14): replaceState, debounced so rapid selection changes write once.
  useEffect(() => {
    if (!opened) return;
    const path = selectedKey ? pathTo(garden, selectedKey).map((b) => b.rank) : [];
    const next = writeUrlState(window.location.search, { sample: sample.id === defaultSample.id ? null : sample.id, path });
    if (next === window.location.search) return;
    const timer = setTimeout(() => history.replaceState(history.state, '', `${window.location.pathname}${next}${window.location.hash}`), 100);
    return () => clearTimeout(timer);
  }, [opened, selectedKey, garden, sample]);

  return (
    <AppShell actions={<ShareButton />}>
      <div className="plate">
        <SpecimenLabel sample={sample} />
        <figure className="garden-figure">
          {notice ? <InlineNote variant="info">{notice}</InlineNote> : null}
          {position ? (
            <p className="scroll-cue" aria-hidden="true">
              {SCROLL_CUE[position]}
            </p>
          ) : null}
          {/* Scrolls sideways on narrow screens instead of shrinking the labels; a tab stop only when it scrolls. */}
          <div ref={scrollRef} className="garden-scroll" role="region" aria-label="Garden drawing" tabIndex={position ? 0 : undefined}>
            {/* Sized by the drawing, so the overflow check sees it grow; the branch note is positioned in it. */}
            <div className="garden-canvas">
              {opened ? (
                <GardenView
                  garden={garden}
                  selectedKey={selectedKey}
                  hoverKey={hoverKey}
                  onHover={setHoverKey}
                  onActivate={activate}
                  note={noteBox ? { box: noteBox, content: <InlineNote variant="not-recorded">{NOT_RECORDED}</InlineNote> } : null}
                />
              ) : null}
            </div>
          </div>
          <PathReadout
            garden={garden}
            labelledKey={hoverKey ?? selectedKey}
            note={missing && !noteBox ? <InlineNote as="span" variant="not-recorded" className="readout-note">{NOT_RECORDED}</InlineNote> : null}
          />
          <Legend />
          <figcaption>Each branch is one possible next token; the thicker the branch, the more likely the token.</figcaption>
        </figure>
      </div>
    </AppShell>
  );
}
