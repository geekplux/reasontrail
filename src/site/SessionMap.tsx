// One session on its own page (v7 §7; the local viewer and a session opened on the website's drop zone or chat page):
// the session header in the home's hero place (the title as the page's h1, the meta line, the actions), the session's
// tree at the full content width with its legend (the box trimmed to the drawing, the legend to what it draws), then
// the card with the git-style list and the outcome or the step's detail panel. `step` / `onStep`: the selected step, kept by the page (the viewer's hash, or memory).
import { useMemo, useState, type ComponentProps } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { TreeLegend } from '../map/tree/TreeLegend';
import { legendKeys } from '../map/tree/view';
import { HeroTree } from './HeroTree';
import { SessionCard } from './SessionCard';
import { usePhone } from './usePhone';
import { useSessionMap } from './useSessionMap';

type CardProps = ComponentProps<typeof SessionCard>;

export function SessionMap({ id, g, step, onStep, tag, ai, share, focusTitle }: { id: string; g: SessionGraph; step: string | null; onStep(stepId: string | undefined): void } & Pick<CardProps, 'tag' | 'ai' | 'share' | 'focusTitle'>) {
  const phone = usePhone();
  const { hovered, onActive, picked, selection, callout, select, onPick, focusDetail, overlay, onOverlay, tagged } = useSessionMap(id, g, step, onStep);
  // The card's header (its state stays in SessionCard) is portalled into this slot above the tree.
  const [head, setHead] = useState<HTMLDivElement | null>(null);
  const only = useMemo(() => legendKeys(g), [g]);
  return (
    <>
      <div className="hero">
        <div ref={setHead} />
        <HeroTree id="tree" g={g} hover={hovered} onHover={(e) => onActive(e, 'pointer')} selected={picked?.step.stepId} callout={callout} onPick={onPick} tagged={tagged} legend={!phone} fit />
        {phone && <div className="under"><TreeLegend only={only} /></div>}
      </div>
      <SessionCard id="session" g={g} tag={tag} ai={ai} share={share} overlay={overlay} onOverlay={onOverlay}
        hover={hovered} onActive={(a, via) => onActive(a?.episodeId, via)} selection={selection} onSelect={(next) => select(next)} focusDetail={focusDetail} headIn={head} headingLevel={1} focusTitle={focusTitle} />
    </>
  );
}
