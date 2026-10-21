// AI label tags (DESIGN §8.7, §13.6, X3): a quiet dashed-outline chip in italic serif. The words carry the label and
// the dash says "suggested", so nothing depends on colour. The route items carry "suggested by <model>" in their
// accessible names; the detail panel says it in words.
import type { CSSProperties } from 'react';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import { episodeOfStep, stepLabel, supportsOf, type EpisodeTag } from './labels';

/** An episode's tag: its most common label, "+n" for the others (all of them are in the item's accessible name). */
export function LabelBadge({ tag, style }: { tag: EpisodeTag; style?: CSSProperties }) {
  return (
    <span className="ai-tag" data-ai-label={tag.label} style={style} aria-hidden="true">
      {tag.label}{tag.others > 0 ? ` +${tag.others}` : ''}
    </span>
  );
}

const short = (g: SessionGraph, id: string) => {
  const s = g.steps.find((x) => x.id === id);
  const text = (s?.tool?.summary ?? s?.text ?? s?.kind ?? '').trim().split('\n', 1)[0] ?? '';
  return `Step ${(s?.seq ?? 0) + 1}: ${text.length > 64 ? `${text.slice(0, 63)}…` : text}`;
};

/** The selected step's label and, for a claim, its supporting steps as links (the text form of the dashed curves). */
export function StepAiNote({ g, overlay, stepId, episode, onPick }: { g: SessionGraph; overlay: LabelOverlay; stepId: string; episode?: string | undefined; onPick(id: string): void }) {
  const label = stepLabel(overlay, stepId);
  // The step's own supports, else those of a claim in the same episode or its subagents (as the curves are drawn).
  const of = episodeOfStep(g);
  const claim = [stepId, ...overlay.links.filter((l) => episode && of(l.claimStepId) === episode).map((l) => l.claimStepId)].find((id) => supportsOf(g, overlay, id).length > 0);
  const supports = claim ? supportsOf(g, overlay, claim) : [];
  if (!label && supports.length === 0) return null;
  return (
    <section className="ai-note" aria-label="AI suggestion">
      {label && (
        <p><span className="ai-tag">{label.label}</span> <span className="muted">suggested by {overlay.model}</span></p>
      )}
      {supports.length > 0 && (
        <>
          <p className="muted fine">{claim === stepId ? 'Supported by' : `This episode's claim (${short(g, claim ?? '').split(':')[0]}) is supported by`} {supports.length === 1 ? '1 step' : `${supports.length} steps`}, suggested by {overlay.model}:</p>
          <ul className="ai-supports">
            {supports.map((id) => (
              <li key={id}><button type="button" className="ai-button" onClick={() => onPick(id)}>{short(g, id)}</button></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
