// The map's keyboard model and accessible names, pure. One tab stop, a roving tabindex, arrow
// keys along a line (the route or a lane track), ↓/↑ (→/← in the vertical layout) between a delegate episode and its
// side trails, Home/End, and `[` `]` through the detected patterns with wrap-around.
import { duration } from './outline';
import { G, type Blaze, type GlanceLayout, type LaneItem, type RouteEpisode } from './layout';

export interface NavItem {
  id: string;
  /** -1: the route; 0..2: a lane track. */
  line: number;
  x: number;
  /** Lanes and their blazes: the spawning episode. */
  parent?: string;
  /** Delegate episodes: their first lane item; an expanded lane: its first episode. */
  child?: string;
  /** Sort key in the vertical layout, where the lanes and an expanded lane's episodes read as one list. */
  vx?: number;
}

/** The line of an expanded lane's episodes (below the three lane tracks). */
export const OPEN_LANE_LINE = 3;
/** Nav id of an episode inside an expanded lane. */
export const lepId = (r: RouteEpisode) => `lep:${r.episode.id}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const epId = (r: RouteEpisode) => `ep:${r.episode.id}`;

/** Every focusable map item in route order; `open` adds the episodes of an expanded lane under its lane item. */
export function navItems(L: GlanceLayout, open?: { lane: string; L: GlanceLayout }): NavItem[] {
  const eps = [...L.episodes, ...(L.answer ? [L.answer] : [])];
  const items: NavItem[] = eps.map((r) => {
    const lane = L.lanes.find((l) => l.episodeId === r.episode.id);
    return { id: epId(r), line: -1, x: r === L.answer ? L.routeEnd : r.x, ...(lane ? { child: lane.id } : {}) };
  });
  if (L.fold) items.push({ id: 'fold', line: -1, x: L.fold.x + 1 });
  const inner = open ? [...open.L.episodes, ...(open.L.answer ? [open.L.answer] : [])] : [];
  for (const l of L.lanes) items.push({ id: l.id, line: l.track, x: l.x1, parent: `ep:${l.episodeId}`, ...(open?.lane === l.id && inner[0] ? { child: lepId(inner[0]) } : {}) });
  const at = L.lanes.find((l) => l.id === open?.lane)?.x1 ?? 0;
  if (open) inner.forEach((r, i) => items.push({ id: lepId(r), line: OPEN_LANE_LINE, x: r === open.L.answer ? open.L.routeEnd : r.x, parent: open.lane, vx: at + (i + 1) / 1000 }));
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
  if (vertical) line.sort((a, b) => (a.vx ?? a.x) - (b.vx ?? b.x) || a.line - b.line);
  const at = line.indexOf(cur);
  const nearest = (l: number) => items.filter((i) => i.line === l).sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x))[0]?.id;
  const [prev, next, into, out] = vertical ? ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'];
  if (key === prev) return line[at - 1]?.id;
  if (key === next) return line[at + 1]?.id;
  if (key === 'Home') return at > 0 ? line[0]?.id : undefined;
  if (key === 'End') return at < line.length - 1 ? line[line.length - 1]?.id : undefined;
  if (key === into) return cur.child ?? (cur.line < 0 || vertical || cur.line + 1 >= OPEN_LANE_LINE ? undefined : nearest(cur.line + 1));
  if (key === out) return cur.line < 0 ? undefined : vertical || cur.line === 0 || cur.line === OPEN_LANE_LINE ? cur.parent : nearest(cur.line - 1);
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

/** The count line under an episode title: "23 steps, 12 min idle", else the longest of "23 steps" or "23" that fits
 * `availPx` (mono 12 px, 7.2 px a character). Never truncated; the idle note stays in the accessible name. */
export function countText(r: RouteEpisode, availPx = Number.POSITIVE_INFINITY): string {
  const options = [`${plural(r.steps, 'step')}${r.idle}`, plural(r.steps, 'step'), String(r.steps)];
  return options.find((t) => t.length * G.monoPx <= availPx) ?? String(r.steps);
}

/** "Delegate: Verify phase 12" says its kind already; the name does not repeat it. */
const kindAndTitle = (r: RouteEpisode) => {
  const kind = KIND_WORD[r.episode.kind] ?? r.episode.kind;
  return r.episode.title.toLowerCase().startsWith(kind.toLowerCase()) ? r.episode.title : `${kind}: ${r.episode.title}`;
};

/** "Episode 5 of 10, delegate: Phase 4 UI 64 steps, 36 min. 2 detected patterns." The drawn title and count come
 * first after the position, so the visible label is part of the name (WCAG 2.5.3). */
export function episodeName(L: GlanceLayout, r: RouteEpisode, total: number): string {
  const lanes = L.lanes.filter((l) => l.episodeId === r.episode.id);
  const k = L.blazes.filter((b) => b.episodeId === r.episode.id).reduce((a, b) => a + b.trouble.length, 0);
  const parts = [`Episode ${r.n} of ${total}, ${kindAndTitle(r)} ${countText(r)}${r.ms >= 60_000 ? `, ${duration(r.ms)}` : ''}.`];
  if (lanes.length > 0) parts.push(`${lanes.map(laneSummary).join('; ')}.`);
  parts.push(k > 0 ? `${plural(k, 'detected pattern')}.` : 'No detected patterns.');
  return parts.join(' ');
}

const laneSummary = (l: LaneItem) => (l.lanes.length > 1 ? `${l.lanes.length} subagents` : `subagent ${l.lanes[0]?.agentType ?? 'agent'}, ${l.word}`);

export interface LaneLines {
  /** Agent type (or "3 subagents"), with "+n nested" / "+n parallel". CSS may ellipsis it. */
  name: string;
  /** "14 calls, 12 min,": the part of the facts line that gives way first. */
  count: string;
  /** "FAIL", "done", "1 failed": never cut. */
  word: string;
}

/** The two label lines of a lane item: agent type, then "<n> calls, <duration>, <status>". With `availPx` (the facts
 * line's width, glyph included) the duration goes first, then "calls"; the status word is always whole. `duration:
 * false` leaves the duration out (the mobile rail). */
export function laneLines(l: LaneItem, opts: { availPx?: number; duration?: boolean } = {}): LaneLines {
  const many = l.lanes.length > 1;
  const base = many ? `${l.lanes.length} subagents` : (l.lanes[0]?.agentType ?? l.lanes[0]?.name ?? 'subagent');
  const extra = [l.nested ? `+${l.nested} nested` : '', l.parallel ? `+${l.parallel} parallel` : ''].filter(Boolean).join(' ');
  const name = extra ? `${base} ${extra}` : base;
  const word = many ? `${l.failed} failed` : l.word;
  const dur = !many && opts.duration !== false && l.ms >= 5 * 60_000 ? `, ${duration(l.ms)}` : '';
  const options = [`${plural(l.calls, 'call')}${dur},`, `${plural(l.calls, 'call')},`, `${l.calls},`];
  // The status glyph and its gap take about 2.5 characters.
  const room = (opts.availPx ?? Number.POSITIVE_INFINITY) / G.monoPx - 2.5 - word.length - 1;
  const count = options.find((t) => t.length <= room) ?? (options[options.length - 1] as string);
  return { name, count, word };
}

/** Facts-line width of a lane label on the horizontal route (its box less the padding). */
export const laneAvailPx = (l: LaneItem) => Math.max(88, l.chars * G.monoPx + 12) - 10;

/** "Subagent lane: implementer 14 calls, interrupted. Fix the audit gap." / "3 subagents 41 calls, 1 failed. Collapsed."
 * Starts with the label as drawn with the same `opts` (WCAG 2.5.3: the visible text is part of the name), then gives the
 * full facts when the drawn count gave way. */
export function laneName(l: LaneItem, opts: { availPx?: number; duration?: boolean } = {}): string {
  const { name, count, word } = laneLines(l, opts);
  const full = laneLines(l).count.replace(/,$/, '');
  const more = full !== count.replace(/,$/, '') ? ` ${full}.` : '';
  if (l.lanes.length > 1) return `${name} ${count} ${word}.${more} Bundle, collapsed.`;
  return `Subagent lane: ${name} ${count} ${word}${l.noHandBack ? ', hand-back not recorded in the main session' : ''}.${more} ${l.lanes[0]?.name ?? ''}.`;
}

/** "Detected pattern 2 of 3: error streak, resolved. Error streak: 4 failed checks, then passed. In implementer, Phase 4 UI."
 * A group: "Detected patterns, group of 6: 4–9 of 12, some unresolved. In the main route, Build." */
export function blazeName(L: GlanceLayout, b: Blaze): string {
  const ep = [...L.episodes, ...(L.answer ? [L.answer] : [])].find((r) => r.episode.id === b.episodeId)?.episode.title ?? '';
  const lane = L.lanes.find((l) => l.id === b.laneItem);
  const where = `In ${lane ? (lane.lanes.length > 1 ? 'subagents' : lane.lanes[0]?.agentType ?? 'a subagent') : 'the main route'}${ep ? `, ${ep}` : ''}.`;
  const t = b.trouble[0];
  // A group's plate reads "+6" with "4–9" on its badge: the name says both, in that order (WCAG 2.5.3).
  if (!t || b.trouble.length > 1) return `Detected patterns, group of ${b.trouble.length}: ${b.badge} of ${L.order.length}, ${b.resolved ? 'all resolved' : 'some unresolved'}. ${where}`;
  return `Detected pattern ${b.badge} of ${L.order.length}: ${TROUBLE_WORD[t.kind]}, ${t.resolved ? 'resolved' : 'unresolved'}. ${t.summary}. ${where}`;
}
