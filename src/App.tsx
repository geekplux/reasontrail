import { useMemo } from 'react';
import { AppShell } from './components/AppShell';
import { SpecimenLabel } from './components/SpecimenLabel';
import { useOverflows } from './components/useOverflows';
import { buildTree, defaultExpanded } from './garden/buildTree';
import { GardenView } from './garden/GardenView';
import { defaultSample } from './samples';

export function App() {
  const sample = defaultSample;
  const garden = useMemo(() => buildTree(defaultSample, defaultExpanded(defaultSample)), []);
  const [scrollRef, scrolls] = useOverflows<HTMLDivElement>();

  return (
    <AppShell>
      <div className="plate">
        <SpecimenLabel sample={sample} />
        <figure className="garden-figure">
          {/* Scrolls sideways on narrow screens instead of shrinking the labels; a tab stop only when it scrolls. */}
          <div ref={scrollRef} className="garden-scroll" role="region" aria-label="Garden drawing" tabIndex={scrolls ? 0 : undefined}>
            <GardenView garden={garden} />
          </div>
          <figcaption>Each branch is one possible next token; the thicker the branch, the more likely the token.</figcaption>
        </figure>
      </div>
    </AppShell>
  );
}
