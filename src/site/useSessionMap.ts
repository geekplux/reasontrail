// The state shared by the tree and the session card on the website's home and in the local viewer: the hovered episode
// (from the tree's pointer or the list's pointer or focus), the selected step (from the URL) or the episode open in
// the list, how the detail panel takes focus after a pick in the tree, and the AI titles overlay (the list's tags and
// the tree's rings). `key` names the session shown (the home's
// sample id), so hover, focus and the open episode of one session never carry over to another.
import { useCallback, useMemo, useState } from 'react';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import { listTags } from '../ai/labels';
import { listRows } from '../map/gitlist/rows';
import type { ListSelection } from '../map/gitlist/GitList';
import type { HitTarget } from '../map/tree';
import { findStep, stepFacts } from './stepDetailData';

type Active = { id: string; episodeId: string } | undefined;

/** `step`: the selected step from the URL (ignored when the graph does not list it); `onStep` writes it. */
export function useSessionMap(key: string, graph: SessionGraph | null, step: string | null, onStep?: (stepId: string | undefined) => void) {
  // When the pointer leaves, the focused list row's episode (if any) is shown again; when focus leaves the rows, the
  // episode under the pointer (if any).
  const [hover, setHover] = useState<Active>();
  const [pointer, setPointer] = useState<Active>();
  const [focused, setFocused] = useState<Active>();
  // AI titles: on for this session only. Another session starts with the plain map, and so does coming back (its
  // "AI titles" button is drawn anew, off).
  const [ai, setAi] = useState<{ id: string; overlay: LabelOverlay }>();
  // Another session drops the focused row and the AI titles too (adjusted during render, not in an effect).
  const [focusedOn, setFocusedOn] = useState(key);
  if (focusedOn !== key) {
    setFocusedOn(key);
    setFocused(undefined);
    setAi(undefined);
  }
  const hovered = hover?.id === key ? hover.episodeId : undefined;
  const of = (episodeId: string | undefined): Active => (episodeId ? { id: key, episodeId } : undefined);
  const current = (a: Active): Active => (a?.id === key ? a : undefined);
  const onActive = (episodeId: string | undefined, via: 'focus' | 'pointer') => {
    if (via === 'pointer') {
      setPointer(of(episodeId));
      setHover(of(episodeId) ?? current(focused));
      return;
    }
    setFocused(of(episodeId));
    setHover(of(episodeId) ?? current(pointer));
  };
  // The selection: the URL's step (when the graph lists it), else the episode open in the list.
  const picked = graph ? findStep(graph, step) : undefined;
  const [open, setOpen] = useState<{ id: string; episodeId: string }>();
  // The step last picked in the tree, and how the panel scrolls its title into view: just into view where the tree
  // has text (desktop), to the top under the phone's bare tree.
  const [treePick, setTreePick] = useState<{ stepId: string | undefined; block: 'nearest' | 'start' }>();
  const openEp = open?.id === key ? open.episodeId : undefined;
  const selection: ListSelection = picked ? { episodeId: picked.episode.episodeId, stepId: picked.step.stepId } : openEp ? { episodeId: openEp } : {};
  const callout = useMemo<[string, string] | undefined>(() => (graph && picked ? [picked.step.label, stepFacts(graph, picked)] : undefined), [graph, picked]);
  const select = (next: ListSelection, fromTree?: { labels: boolean }) => {
    setTreePick(fromTree ? { stepId: next.stepId, block: fromTree.labels ? 'nearest' : 'start' } : undefined);
    setOpen(next.episodeId ? { id: key, episodeId: next.episodeId } : undefined);
    if (next.stepId !== picked?.step.stepId) onStep?.(next.stepId);
  };
  const onPick = (hit: HitTarget, labels: boolean) => {
    const s = graph && hit.kind === 'step' ? findStep(graph, hit.id) : undefined;
    select(s ? { episodeId: s.episode.episodeId, stepId: s.step.stepId } : { episodeId: hit.episodeId }, { labels });
  };
  /** The detail panel takes focus as it opens when its step was just picked in the tree. */
  const focusDetail = picked !== undefined && treePick?.stepId === picked.step.stepId && treePick.block;
  const overlay = ai?.id === key ? ai.overlay : undefined;
  const onOverlay = useCallback((next: LabelOverlay | undefined) => setAi((was) => (was?.id === key && was.overlay === next ? was : next && { id: key, overlay: next })), [key]);
  // The tree rings the episodes whose list row shows a tag (episode rows; a lane's verdict row has none).
  const tagged = useMemo(() => {
    if (!graph || !overlay) return undefined;
    const tags = listTags(graph, overlay);
    return new Set(listRows(graph).flatMap((r) => (r.kind === 'episode' && tags.has(r.episodeId) ? [r.episodeId] : [])));
  }, [graph, overlay]);
  return { hovered, onActive, picked, selection, callout, select, onPick, focusDetail, overlay, onOverlay, tagged };
}
