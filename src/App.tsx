import { useLayoutEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { SpecimenLabel } from './components/SpecimenLabel';
import { useOverflows } from './components/useOverflows';
import { buildTree, defaultExpanded } from './garden/buildTree';
import { GardenView } from './garden/GardenView';
import { initialScrollLeft } from './garden/layout';
import { Legend } from './garden/Legend';
import { PathReadout } from './garden/PathReadout';
import { defaultSample } from './samples';

const SCROLL_CUE = { start: 'Scroll sideways for more →', middle: '← Scroll sideways →', end: '← Scroll sideways to the seed' };

export function App() {
  const sample = defaultSample;
  const garden = useMemo(() => buildTree(defaultSample, defaultExpanded(defaultSample)), []);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const selectedKey = null; // click selection arrives in phase 4, focus in phase 5
  const [scrollRef, position] = useOverflows<HTMLDivElement>();

  // Narrow screens start at the open fork rather than at the seed (spec §8); wide ones clamp to 0.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = initialScrollLeft(garden);
  }, [scrollRef, garden]);

  return (
    <AppShell>
      <div className="plate">
        <SpecimenLabel sample={sample} />
        <figure className="garden-figure">
          {position ? (
            <p className="scroll-cue" aria-hidden="true">
              {SCROLL_CUE[position]}
            </p>
          ) : null}
          {/* Scrolls sideways on narrow screens instead of shrinking the labels; a tab stop only when it scrolls. */}
          <div ref={scrollRef} className="garden-scroll" role="region" aria-label="Garden drawing" tabIndex={position ? 0 : undefined}>
            <GardenView garden={garden} selectedKey={selectedKey} hoverKey={hoverKey} onHover={setHoverKey} />
          </div>
          <PathReadout garden={garden} labelledKey={hoverKey ?? selectedKey} />
          <Legend />
          <figcaption>Each branch is one possible next token; the thicker the branch, the more likely the token.</figcaption>
        </figure>
      </div>
    </AppShell>
  );
}
