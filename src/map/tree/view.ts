// What the tree renderer needs beyond geometry (docs/design/v7/PROMPT.md §5.4), pure: the layout memoised per graph
// and box, the factual summary for the SVG's label, and the hover tooltip ("7  Edit … +8 more" over "20 steps, 6 tool
// calls, 15 min wait, 17 min"). Numbers, titles and times come from the list's row model, so tree and list agree.
import type { SessionGraph } from '../../../shared/session/types';
import { listRows, type EpisodeRow, type ListRow, type VerdictRow } from '../gitlist/rows';
import { layoutTree } from './layout';
import { textWidth } from './text';
import type { Box, Pt, TreeLayout } from './types';

const SIZES_KEPT = 4;
const cache = new WeakMap<SessionGraph, Map<string, TreeLayout>>();

/** `layoutTree`, memoised per graph and box (the last few sizes per graph): a re-render, a hover or a tab switch back
 * reuses the layout. */
export function treeFor(g: SessionGraph, width: number, height: number, labels = true, reserve: readonly Box[] = []): TreeLayout {
  const key = JSON.stringify([width, height, labels, reserve]);
  let sizes = cache.get(g);
  if (!sizes) cache.set(g, (sizes = new Map()));
  const hit = sizes.get(key);
  if (hit) return hit;
  const t = layoutTree(g, { width, height, labels, reserve: [...reserve] });
  sizes.set(key, t);
  if (sizes.size > SIZES_KEPT) sizes.delete(sizes.keys().next().value as string);
  return t;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The SVG's `aria-label`: what the drawing shows, in one or two sentences (the list is the operable structure). */
export function treeSummary(g: SessionGraph, rows: readonly ListRow[] = listRows(g)): string {
  const episodes = rows.reduce((m, r) => Math.max(m, r.kind === 'episode' ? r.n : r.kind === 'verdict' ? (r.n ?? 0) : 0), 0);
  const calls = g.steps.filter((s) => s.kind === 'tool-call').length;
  const end = rows.find((r) => r.kind === 'end')?.at;
  const head = `Tree: ${[plural(episodes, 'episode'), plural(calls, 'tool call'), end].filter(Boolean).join(', ')}`;
  const lanes = rows.filter((r) => r.kind === 'lane').slice(1);
  if (lanes.length === 0) return `${head}, all by the main agent.`;
  const verdicts = new Map(rows.flatMap((r) => (r.kind === 'verdict' ? [[r.laneId, r] as const] : [])));
  const runs = lanes.map((l) => {
    const v = verdicts.get(l.laneId);
    return v ? `${l.name} (${v.text.charAt(0).toLowerCase()}${v.text.slice(1)})` : l.name;
  });
  return `${head}. The main agent spawns ${plural(lanes.length, 'subagent')}: ${runs.join(', ')}.`;
}

/** The hover tooltip of an episode: number, title, facts, the box (layout px) and where the box sits. */
export interface TreeTip { episodeId: string; n: number; title: string; facts: string; box: Box }

const TIP_H = 56;
const TIP_TITLE_MAX = 360;
const TIP_GAP = { x: 16, y: 10 };

/** The tooltip for `episodeId` (an episode row's or a lane answer's), beside its glyph or tip, inside the box where
 * it fits: right and below as on the canvas, else left or above. Undefined for an id the tree does not draw. */
export function treeTip(g: SessionGraph, t: TreeLayout, episodeId: string, rows: readonly ListRow[] = listRows(g)): TreeTip | undefined {
  const row = rows.find((r): r is EpisodeRow | VerdictRow => (r.kind === 'episode' || r.kind === 'verdict') && r.episodeId === episodeId);
  const at: Pt | undefined = t.episodes.find((m) => m.episodeId === episodeId)?.at ?? t.tips.find((m) => m.episodeId === episodeId)?.at;
  const n = row?.n;
  if (!row || !at || n === undefined) return undefined;
  const ids = new Set(g.episodes.find((e) => e.id === episodeId)?.stepIds);
  const calls = g.steps.filter((s) => ids.has(s.id) && s.kind === 'tool-call').length;
  const failed = row.kind === 'episode' && row.failed > 0 ? `${row.failed} failed` : '';
  const facts = [plural(row.steps ?? ids.size, 'step'), calls > 0 ? plural(calls, 'tool call') : '', failed, row.kind === 'episode' ? row.wait : '', row.at].filter(Boolean).join(', ');
  let title = row.kind === 'episode' ? row.title : row.text;
  // A long recorded request is cut with an ellipsis, as the list's row is.
  if (textWidth(title, 14, 500) > TIP_TITLE_MAX) {
    while (title.length > 1 && textWidth(`${title}…`, 14, 500) > TIP_TITLE_MAX) title = title.slice(0, -1);
    title = `${title.trimEnd()}…`;
  }
  // textWidth carries a 4% margin; without it, the text plus 14px on the right (the canvas's 300 for episode 7).
  const w = Math.ceil(34 + Math.max(textWidth(title, 14, 500), textWidth(facts, 12, 400)) / 1.04 + 14);
  let x = at.x + TIP_GAP.x;
  let y = at.y + TIP_GAP.y;
  if (x + w > t.width) x = Math.max(0, at.x - TIP_GAP.x - w);
  if (y + TIP_H > t.height) y = Math.max(0, at.y - TIP_GAP.y - TIP_H);
  return { episodeId, n, title, facts, box: { x0: x, y0: y, x1: x + w, y1: y + TIP_H } };
}
