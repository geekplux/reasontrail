// The AI titles overlay read for the map (PLAN phase 21, X3; v7 §7): step labels summed up per top-level episode, for
// the list's 12px tags and the tree's rings. Pure; the overlay never changes the graph (D22).
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';

/** Most conclusive first: an episode's tag is its most conclusive label. */
const ORDER = ['answer', 'decision', 'dead end', 'hypothesis', 'evidence', 'sub-question'];

export interface EpisodeTag {
  /** The most conclusive label in the episode. */
  label: string;
  /** How many other labels it also has. */
  others: number;
  /** "decision (3 steps), evidence (1 step)". */
  text: string;
}

const plural = (n: number) => `${n} ${n === 1 ? 'step' : 'steps'}`;

/** Step id → the top-level main-route episode it belongs to; a subagent's steps belong to the episode that spawned it. */
export function episodeOfStep(g: SessionGraph): (stepId: string) => string | undefined {
  const main = g.lanes[0]?.id;
  const top = new Map<string, string>();
  for (const e of g.episodes) if (e.laneId === main && !e.parentId) for (const id of e.stepIds) top.set(id, e.id);
  const steps = new Map(g.steps.map((s) => [s.id, s]));
  const lanes = new Map(g.lanes.map((l) => [l.id, l]));
  const find = (id: string, depth = 0): string | undefined => {
    const hit = top.get(id);
    if (hit || depth > 8) return hit;
    const spawn = lanes.get(steps.get(id)?.laneId ?? '')?.spawnedBy;
    return spawn ? find(spawn, depth + 1) : undefined;
  };
  return (id) => find(id);
}

/** One tag per labelled top-level episode, keyed by episode id. `of` maps a step to its episode: by default the
 * main-route episode (a subagent's steps count for the episode that spawned it). */
export function episodeTags(g: SessionGraph, overlay: LabelOverlay, of: (stepId: string) => string | undefined = episodeOfStep(g)): Map<string, EpisodeTag> {
  const counts = new Map<string, Map<string, number>>();
  for (const l of overlay.labels) {
    const ep = of(l.stepId);
    if (!ep) continue;
    const c = counts.get(ep) ?? new Map<string, number>();
    c.set(l.label, (c.get(l.label) ?? 0) + 1);
    counts.set(ep, c);
  }
  const tags = new Map<string, EpisodeTag>();
  for (const [ep, c] of counts) {
    const sorted = [...c].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]) || b[1] - a[1]);
    const [label] = sorted[0] as [string, number];
    tags.set(ep, { label, others: sorted.length - 1, text: sorted.map(([l, n]) => `${l} (${plural(n)})`).join(', ') });
  }
  return tags;
}

/** The list's and the tree's tags: one per labelled top-level episode of any lane (a step counts for its own episode),
 * keyed by episode id. */
export function listTags(g: SessionGraph, overlay: LabelOverlay): Map<string, EpisodeTag> {
  const ofStep = new Map(g.episodes.filter((e) => !e.parentId).flatMap((e) => e.stepIds.map((id) => [id, e.id] as const)));
  return episodeTags(g, overlay, (id) => ofStep.get(id));
}

/** The accessible text of an episode's tag; every title says which model suggested it (X3). */
export const tagName = (tag: EpisodeTag, model: string) => `AI title, suggested by ${model}: ${tag.text}`;
