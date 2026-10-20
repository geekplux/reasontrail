import { useMemo } from 'react';
import { buildTree, defaultExpanded } from './garden/buildTree';
import { GardenView } from './garden/GardenView';
import { defaultSample } from './samples';

export function App() {
  const sample = defaultSample;
  const garden = useMemo(() => buildTree(defaultSample, defaultExpanded(defaultSample)), []);

  return (
    <>
      <header className="site-header">
        <p className="wordmark">token-garden</p>
      </header>
      <main>
        <h1>{sample.title}</h1>
        <p className="prompt">
          <span className="visually-hidden">Prompt: </span>
          {sample.prompt}
        </p>
        <figure className="garden-figure">
          <GardenView garden={garden} />
          <figcaption>
            Each branch is one possible next token; a thicker branch is a more likely token. Hover a branch for its
            probability. Recorded with {sample.model.name}.{sample.model.note ? ` ${sample.model.note}` : ''}
          </figcaption>
        </figure>
      </main>
      <footer className="site-footer">
        <p>Runs offline; nothing you do with samples leaves your browser.</p>
      </footer>
    </>
  );
}
