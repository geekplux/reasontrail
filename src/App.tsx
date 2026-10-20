import { useMemo } from 'react';
import { AppShell } from './components/AppShell';
import { SpecimenLabel } from './components/SpecimenLabel';
import { buildTree, defaultExpanded } from './garden/buildTree';
import { GardenView } from './garden/GardenView';
import { defaultSample } from './samples';

export function App() {
  const sample = defaultSample;
  const garden = useMemo(() => buildTree(defaultSample, defaultExpanded(defaultSample)), []);

  return (
    <AppShell>
      <div className="plate">
        <SpecimenLabel sample={sample} />
        <figure className="garden-figure">
          {/* Scrolls sideways on narrow screens instead of shrinking the labels; focusable so keyboards can scroll it. */}
          <div className="garden-scroll" role="region" aria-label="Garden drawing" tabIndex={0}>
            <GardenView garden={garden} />
          </div>
          <figcaption>Each branch is one possible next token; the thicker the branch, the more likely the token.</figcaption>
        </figure>
      </div>
    </AppShell>
  );
}
