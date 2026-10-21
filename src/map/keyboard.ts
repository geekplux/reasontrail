// The map's keyboard model and accessible names (DESIGN §10.3, §10.4), pure. One tab stop, a roving tabindex, arrow
// keys along a line (the route or a lane track), ↓/↑ (→/← in the vertical layout) between a delegate episode and its
// side trails, Home/End, and `[` `]` through the detected patterns with wrap-around.
import { duration } from './outline';
import type { Blaze, GlanceLayout, LaneItem, RouteEpisode } from './layout';

export interface NavItem {
  id: string;
  /** -1: the route; 0..2: a lane track. */
  line: number;
  x: number;
  /** Lanes and their blazes: the spawning episode. */
  parent?: string;
  /** Delegate episodes: their first lane item. */
  child?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const epId = (r: RouteEpisode) => `ep:${r.episode.id}`;

/** Every focusable map item in route order. */
export function navItems(L: GlanceLayout): NavItem[] {
  const eps = [...L.episodes, ...(L.answer ? [L.answer] : [])];
  const items: NavItem[] = eps.map((r) => {
    const lane = L.lanes.find((l) => l.episodeId === r.episode.id);
    return { id: epId(r), line: -1, x: r === L.answer ? L.routeEnd : r.x, ...(lane ? { child: lane.id } : {}) };
  });
  if (L.fold) items.push({ id: 'fold', line: -1, x: L.fold.x + 1 });
  for (const l of L.lanes) items.push({ id: l.id, line: l.track, x: l.x1, parent: `ep:${l.episodeId}` });
  for (const b of L.blazes) items.push({ id: b.id, line: b.track, x: b.x, ...(b.track >= 0 ? { parent: `ep:${b.episodeId}` } : {}) });
  return items.sort((a, b) => a.line - b.line || a.x - b.x);
}

/** The item a key moves to from `from`, or undefined at a dead end (nothing happens, nothing is announced). */
export function move(items: NavItem[], from: string, key: string, vertical: boolean): string | undefined {
  const cur = items.find((i) => i.id === from);
  if (!cur) return items[0]?.id;
  // The vertical layout reads the lanes as one list under the route.
  const lineOf = (i: NavItem) => (vertical ? Math.min(i.line, 0) : i.line);
  const line = items.filter((i) => lineOf(i) === lineOf(cur));
  const at = line.indexOf(cur);
  const nearest = (l: number) => items.filter((i) => i.line === l).sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x))[0]?.id;
  const [prev, next, into, out] = vertical ? ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'];
  if (key === prev) return line[at - 1]?.id;
  if (key === next) return line[at + 1]?.id;
  if (key === 'Home') return at > 0 ? line[0]?.id : undefined;
  if (key === 'End') return at < line.length - 1 ? line[line.length - 1]?.id : undefined;
  if (key === into) return cur.line < 0 ? cur.child : vertical ? undefined : nearest(cur.line + 1);
  if (key === out) return cur.line < 0 ? undefined : vertical || cur.line === 0 ? cur.parent : nearest(cur.line - 1);
  return undefined;
}

/** `]` / `[`: the next or previous blaze in badge order, wrapping, with what to announce. */
export function jumpPattern(L: GlanceLayout, from: string | undefined, dir: 1 | -1): { id: string; say: string } | undefined {
  const list = L.blazes;
  if (list.length === 0) return undefined;
  const at = list.findIndex((b) => b.id === from);
  const raw = at < 0 ? (dir > 0 ? 0 : list.length - 1) : at + dir;
  const i = (raw + list.length) % list.length;
  const b = list[i] as Blaze;
  const wrapped = at >= 0 && raw !== i;
  return { id: b.id, say: `Pattern ${b.badge} of ${L.order.length}${wrapped ? ', wrapped' : ''}` };
}

export const KIND_WORD: Record<string, string> = { discuss: 'ask', explore: 'explore', change: 'change', verify: 'verify', delegate: 'delegate', answer: 'answer' };
export const TROUBLE_WORD: Record<string, string> = { 'error-streak': 'error streak', retry: 'retry', revert: 'revert', rewind: 'rewind', interrupt: 'interrupt', churn: 'churn' };

/** The count line under an episode title, as drawn: "23 steps", "23 steps · 12 min idle". */
export const countText = (r: RouteEpisode) => `${plural(r.steps, 'step')}${r.idle}`;

/** "Episode 5 of 10, delegate: Phase 4 UI 64 steps, 36 min. 2 detected patterns." The drawn title and count come
 * first after the position, so the visible label is part of the name (WCAG 2.5.3). */
export function episodeName(L: GlanceLayout, r: RouteEpisode, total: number): string {
  const lanes = L.lanes.filter((l) => l.episodeId === r.episode.id);
  const k = L.blazes.filter((b) => b.episodeId === r.episode.id).reduce((a, b) => a + b.trouble.length, 0);
  const parts = [`Episode ${r.n} of ${total}, ${KIND_WORD[r.episode.kind]}: ${r.episode.title} ${countText(r)}${r.ms >= 60_000 ? `, ${duration(r.ms)}` : ''}.`];
  if (lanes.length > 0) parts.push(`${lanes.map(laneSummary).join('; ')}.`);
  parts.push(k > 0 ? `${plural(k, 'detected pattern')}.` : 'No detected patterns.');
  return parts.join(' ');
}

const laneSummary = (l: LaneItem) => (l.lanes.length > 1 ? `${l.lanes.length} subagents` : `subagent ${l.lanes[0]?.agentType ?? 'agent'}, ${l.word}`);

/** The two label lines of a lane item, untruncated (CSS clips them): agent type, then "<n> calls · <duration> · <status>". */
export function laneLines(l: LaneItem): [string, string] {
  const many = l.lanes.length > 1;
  const name = many ? `${l.lanes.length} subagents` : (l.lanes[0]?.agentType ?? l.lanes[0]?.name ?? 'subagent');
  const extra = [l.nested ? `+${l.nested} nested` : '', l.parallel ? `+${l.parallel} parallel` : ''].filter(Boolean).join(' ');
  const facts = many ? [plural(l.calls, 'call'), `${l.failed} failed`] : [plural(l.calls, 'call'), ...(l.ms >= 5 * 60_000 ? [duration(l.ms)] : []), l.word];
  return [extra ? `${name} ${extra}` : name, facts.join(' · ')];
}

/** "Subagent lane: implementer 14 calls · interrupted. Fix the audit gap." / "3 subagents 41 calls · 1 failed. Collapsed." */
export function laneName(l: LaneItem): string {
  const [a, b] = laneLines(l);
  if (l.lanes.length > 1) return `${a} ${b}. Bundle, collapsed.`;
  return `Subagent lane: ${a} ${b}. ${l.lanes[0]?.name ?? ''}.`;
}

/** "Detected pattern 2 of 3: error streak, resolved. Error streak: 4 failed checks, then passed. In implementer, Phase 4 UI." */
export function blazeName(L: GlanceLayout, b: Blaze): string {
  const ep = [...L.episodes, ...(L.answer ? [L.answer] : [])].find((r) => r.episode.id === b.episodeId)?.episode.title ?? '';
  const lane = L.lanes.find((l) => l.id === b.laneItem);
  const where = `In ${lane ? (lane.lanes.length > 1 ? 'subagents' : lane.lanes[0]?.agentType ?? 'a subagent') : 'the main route'}${ep ? `, ${ep}` : ''}.`;
  const t = b.trouble[0];
  if (!t || b.trouble.length > 1) return `Detected patterns ${b.badge} of ${L.order.length}: ${plural(b.trouble.length, 'pattern')}, ${b.resolved ? 'all resolved' : 'some unresolved'}. ${where}`;
  return `Detected pattern ${b.badge} of ${L.order.length}: ${TROUBLE_WORD[t.kind]}, ${t.resolved ? 'resolved' : 'unresolved'}. ${t.summary}. ${where}`;
}
