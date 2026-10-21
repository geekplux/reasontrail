// The glance layout (DESIGN §8.1–8.5, §8.11): pure and deterministic. Episodes become route segments whose length
// encodes effort (√steps), subagents become side trails below, detected patterns become numbered blazes, long idle
// gaps become breaks. Only episodes and lanes are laid out, never single steps, and no text is measured: label room is
// given in characters from the mono estimate (0.6 em).
import type { Episode, Lane, SessionGraph, Step, Trouble } from '../../shared/session/types';

export type GlyphStatus = 'ok' | 'error' | 'interrupted' | 'unknown';

/** Geometry constants, px (DESIGN §8.1, §8.3, §8.5). */
export const G = {
  segMin: 56, segMax: 240, growMax: 480, segBase: 36, kMax: 19.5, kNum: 204,
  start: 24, end: 30, breakW: 44, pitch: 24, foldW: 56,
  laneSpan: 96, laneDrop: 34, trackGap: 64, tracks: 3,
  routeY: 76, laneLabelH: 54, monoPx: 6.9,
  maxEpisodes: 12, keepFirst: 3, keepLast: 8, idleMs: 10 * 60_000, maxBreaks: 3, maxPlates: 3,
} as const;

export interface RouteEpisode {
  episode: Episode;
  /** 1-based position among all top-level main episodes. */
  n: number;
  x: number;
  len: number;
  /** Steps, including the steps of the subagent lanes it spawned (what the length encodes). */
  steps: number;
  /** First to last timed step, lanes included, in ms. */
  ms: number;
  /** "· 12 min idle" when idle time is not drawn as a break. */
  idle: string;
}

export interface LaneItem {
  /** `lane:<id>` or `bundle:<episode id>`. */
  id: string;
  lanes: Lane[];
  episodeId: string;
  track: number;
  x1: number;
  x2: number;
  rejoins: boolean;
  status: GlyphStatus;
  /** "done", "PASS", "failed", "interrupted", "no result recorded". */
  word: string;
  calls: number;
  failed: number;
  ms: number;
  nested: number;
  /** Extra parallel lanes not drawn (a 4th track or more): "+n parallel". */
  parallel: number;
  /** Characters of mono label that fit before the next item on the track. */
  chars: number;
  /** The lane ended on its own report, but its result never came back into the main session. */
  noHandBack?: boolean;
}

export interface Blaze {
  id: string;
  trouble: Trouble[];
  /** Badge: "2", or a range "4–9" for a "+n" plate. */
  badge: string;
  first: number;
  resolved: boolean;
  x: number;
  /** -1 = the route; 0..2 = a lane track. */
  track: number;
  episodeId: string;
  laneItem?: string;
}

export interface IdleBreak { x: number; ms: number; label: string; before: string }
export interface Fold { x: number; episodes: Episode[]; steps: number; trouble: number }

export interface GlanceLayout {
  width: number;
  height: number;
  routeEnd: number;
  /** Route pieces [x1, x2], split by idle breaks. */
  pieces: [number, number][];
  episodes: RouteEpisode[];
  answer?: RouteEpisode;
  fold?: Fold;
  lanes: LaneItem[];
  blazes: Blaze[];
  breaks: IdleBreak[];
  tracks: number;
  /** Badge number of each trouble id, in route order (shared with the outline and the stuck list). */
  numbers: Map<string, number>;
  /** Trouble in badge order. */
  order: Trouble[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const time = (s: Step | undefined) => (s?.t ? Date.parse(s.t) : Number.NaN);

/** "≈11 h", "≈25 min". */
export function idleText(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min >= 60 ? `≈${Math.round(min / 60)} h` : `${min} min`;
}

const VERDICT = /\b(CHANGES REQUESTED|APPROVED|PASS|FAIL)\b/;

/** The verdict of a report: the only one on its first line, or a `LABEL: VERDICT` line, else the only distinct verdict in the text. */
export function verdictOf(text: string): string | undefined {
  const lines = text.split('\n').map((l) => l.replace(/[*_`#>]/g, '').trim()).filter(Boolean);
  const distinct = (t: string) => new Set([...t.matchAll(new RegExp(VERDICT, 'g'))].map((m) => m[1] as string));
  const first = distinct(lines[0] ?? '');
  if (first.size === 1) return [...first][0];
  const labelled = lines.map((l) => /^[A-Za-z][\w -]{0,30}:\s*(CHANGES REQUESTED|APPROVED|PASS|FAIL)\b/.exec(l)?.[1]).find(Boolean);
  if (labelled) return labelled;
  const all = distinct(text);
  return all.size === 1 ? [...all][0] : undefined;
}

/** Lane status word (DESIGN §8.3): a verdict from the lane's final text, else done / failed / interrupted. A lane whose
 * hand-back is missing from the main session but which ended on its own report counts as done (`handBack: false`). */
export function laneStatus(g: SessionGraph, lane: Lane, steps: Step[] = g.steps.filter((s) => s.laneId === lane.id)): { status: GlyphStatus; word: string; handBack: boolean } {
  const last = [...steps].reverse().find((s) => s.kind === 'assistant' && s.text);
  const verdict = verdictOf(last?.text ?? '');
  if (lane.status === 'interrupted') return { status: 'interrupted', word: 'interrupted', handBack: true };
  if (lane.status === 'error') return { status: 'error', word: 'failed', handBack: true };
  // Undefined status: the lane ended on its report (its last step is that text) or was cut off mid-tool.
  const reported = lane.status === undefined && !!last && steps[steps.length - 1] === last;
  if (lane.status !== 'ok' && !reported) return { status: 'unknown', word: 'no result recorded', handBack: true };
  const handBack = lane.status === 'ok';
  if (verdict === 'FAIL' || verdict === 'CHANGES REQUESTED') return { status: 'error', word: verdict === 'FAIL' ? 'FAIL' : 'changes requested', handBack };
  return { status: 'ok', word: verdict === 'APPROVED' ? 'approved' : verdict ?? 'done', handBack };
}

const RANK: Record<GlyphStatus, number> = { error: 3, interrupted: 2, unknown: 1, ok: 0 };

/** Lay out the glance for a band `width` px wide. `unfold` draws every episode; `unbundle` holds bundle ids to split. */
export function glanceLayout(g: SessionGraph, width: number, opts: { unfold?: boolean; unbundle?: ReadonlySet<string>; numbers?: ReadonlyMap<string, number> } = {}): GlanceLayout {
  const main = g.lanes[0]?.id ?? 'main';
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const laneById = new Map(g.lanes.map((l) => [l.id, l]));
  const laneSteps = new Map<string, Step[]>();
  for (const s of g.steps) {
    const list = laneSteps.get(s.laneId);
    if (list) list.push(s);
    else laneSteps.set(s.laneId, [s]);
  }
  // Every subagent lane belongs to a top lane (spawned from main); nested lanes add their steps to it.
  const topOf = new Map<string, string>();
  const findTop = (id: string, depth = 0): string | undefined => {
    if (topOf.has(id)) return topOf.get(id);
    const lane = laneById.get(id);
    const parent = lane?.spawnedBy ? byId.get(lane.spawnedBy)?.laneId : undefined;
    const top = !parent || depth > 20 ? undefined : parent === main ? id : findTop(parent, depth + 1);
    if (top) topOf.set(id, top);
    return top;
  };
  for (const l of g.lanes) if (l.id !== main) findTop(l.id);
  const family = new Map<string, Step[]>();
  const nested = new Map<string, number>();
  for (const [id, top] of topOf) {
    family.set(top, [...(family.get(top) ?? []), ...(laneSteps.get(id) ?? [])]);
    if (id !== top) nested.set(top, (nested.get(top) ?? 0) + 1);
  }

  const tops = g.episodes.filter((e) => e.laneId === main && !e.parentId);
  const answerEp = tops.length > 1 && tops[tops.length - 1]?.kind === 'answer' ? tops[tops.length - 1] : undefined;
  const segs = answerEp ? tops.slice(0, -1) : tops;
  const where = new Map<string, { e: Episode; i: number }>();
  const nOf = new Map(tops.map((e, i) => [e.id, i + 1]));
  for (const e of tops) e.stepIds.forEach((id, i) => where.set(id, { e, i }));
  const spawnedIn = new Map<string, Lane[]>();
  for (const l of g.lanes) {
    const at = topOf.get(l.id) === l.id && l.spawnedBy ? where.get(l.spawnedBy)?.e.id : undefined;
    if (at) spawnedIn.set(at, [...(spawnedIn.get(at) ?? []), l]);
  }

  // Effort and time per episode, lanes included.
  const info = (e: Episode) => {
    const lanes = spawnedIn.get(e.id) ?? [];
    const all = [...e.stepIds.map((id) => byId.get(id) as Step), ...lanes.flatMap((l) => family.get(l.id) ?? [])];
    const ts = all.map(time).filter(Number.isFinite).sort((a, b) => a - b);
    let inner = 0;
    for (let i = 1; i < ts.length; i++) if ((ts[i] as number) - (ts[i - 1] as number) > G.idleMs) inner += (ts[i] as number) - (ts[i - 1] as number);
    return { steps: all.length, first: ts[0] ?? Number.NaN, last: ts[ts.length - 1] ?? Number.NaN, inner };
  };

  // Fold the middle past 12 drawn episodes: the first 3 and the last 8 (answer included) stay (§8.11).
  const drawnCount = segs.length + (answerEp ? 1 : 0);
  const folding = !opts.unfold && drawnCount > G.maxEpisodes;
  const lastKeep = G.keepLast - (answerEp ? 1 : 0);
  const foldEps = folding ? segs.slice(G.keepFirst, segs.length - lastKeep) : [];
  const shown = folding ? [...segs.slice(0, G.keepFirst), ...segs.slice(segs.length - lastKeep)] : segs;
  const infos = new Map(tops.map((e) => [e.id, info(e)]));

  // Idle gaps at episode boundaries: the 3 longest over 10 min are breaks; the rest note on the next episode.
  const order = [...shown, ...(answerEp ? [answerEp] : [])];
  const gaps = order.slice(1).map((e, i) => ({ before: e.id, ms: (infos.get(e.id)?.first ?? NaN) - (infos.get(order[i]?.id ?? '')?.last ?? NaN), i }));
  const drawn = new Set(gaps.filter((x) => x.ms > G.idleMs).sort((a, b) => b.ms - a.ms || a.i - b.i).slice(0, G.maxBreaks).map((x) => x.before));
  const noted = new Map(gaps.filter((x) => x.ms > G.idleMs && !drawn.has(x.before)).map((x) => [x.before, x.ms]));

  // Segment lengths: clamp(56, 36 + k·√steps, 240); a short route grows uniformly to fill the band (the longest
  // segment at most 480 px), a long one shrinks uniformly to fit, floored at 56 (§8.1).
  const maxSteps = Math.max(1, ...shown.map((e) => infos.get(e.id)?.steps ?? 1));
  const k = Math.min(G.kMax, G.kNum / Math.sqrt(maxSteps));
  const base = shown.map((e) => clamp(G.segBase + k * Math.sqrt(infos.get(e.id)?.steps ?? 1), G.segMin, G.segMax));
  const fixed = G.start + G.end + drawn.size * G.breakW + (folding ? G.foldW : 0);
  const avail = width - fixed;
  const sum = base.reduce((a, l) => a + l, 0);
  const grow = sum > 0 && sum < avail ? Math.max(1, Math.min(avail / sum, G.growMax / Math.max(...base))) : 1;
  const natural = base.map((l) => l * grow);
  // One uniform factor for every segment above the floor, found by flooring the ones it would push under 56.
  let floored = new Set<number>();
  let scale = 1;
  for (let pass = 0; pass <= natural.length; pass++) {
    const free = natural.reduce((a, l, i) => (floored.has(i) ? a : a + l), 0);
    scale = Math.min(1, Math.max(0, avail - floored.size * G.segMin) / Math.max(1, free));
    const next = new Set(natural.flatMap((l, i) => (l * scale < G.segMin ? [i] : [])));
    if (next.size === floored.size) break;
    floored = next;
  }
  const lens = natural.map((l, i) => (floored.has(i) ? G.segMin : Math.max(G.segMin, l * scale)));

  const pieces: [number, number][] = [];
  const breaks: IdleBreak[] = [];
  const episodes: RouteEpisode[] = [];
  let x: number = G.start;
  let pieceStart = x;
  let fold: Fold | undefined;
  const mk = (e: Episode, len: number): RouteEpisode => {
    const inf = infos.get(e.id);
    const idleMs = (inf?.inner ?? 0) + (noted.get(e.id) ?? 0);
    return { episode: e, n: nOf.get(e.id) ?? 0, x, len, steps: inf?.steps ?? e.stepIds.length, ms: Number.isFinite(inf?.last) ? (inf?.last ?? 0) - (inf?.first ?? 0) : 0, idle: idleMs > G.idleMs ? ` · ${idleText(idleMs)} idle` : '' };
  };
  const breakBefore = (id: string) => {
    if (!drawn.has(id)) return;
    pieces.push([pieceStart, x]);
    const ms = gaps.find((gp) => gp.before === id)?.ms ?? 0;
    breaks.push({ x, ms, label: `${idleText(ms)} idle`, before: id });
    x += G.breakW;
    pieceStart = x;
  };
  shown.forEach((e, i) => {
    if (folding && i === G.keepFirst) {
      const t = new Set(foldEps.flatMap((f) => f.stepIds));
      fold = { x, episodes: foldEps, steps: foldEps.reduce((a, f) => a + (infos.get(f.id)?.steps ?? 0), 0), trouble: g.trouble.filter((tr) => t.has(tr.stepIds[0] ?? '')).length };
      x += G.foldW;
    }
    breakBefore(e.id);
    episodes.push(mk(e, lens[i] ?? G.segMin));
    x += lens[i] ?? G.segMin;
  });
  let answer: RouteEpisode | undefined;
  if (answerEp) {
    breakBefore(answerEp.id);
    answer = mk(answerEp, 0);
  }
  const routeEnd = x;
  pieces.push([pieceStart, routeEnd]);

  // x(step) = segStart + segLen · indexInEpisode / steps (§8.1); folded steps sit on the fold chip.
  const segOf = new Map(episodes.map((r) => [r.episode.id, r]));
  const xOf = (stepId: string | undefined): number | undefined => {
    const w = stepId ? where.get(stepId) : undefined;
    if (!w) return undefined;
    if (w.e === answerEp) return routeEnd;
    const r = segOf.get(w.e.id);
    if (!r) return fold ? fold.x + G.foldW / 2 : undefined;
    return r.x + (r.len * w.i) / Math.max(1, w.e.stepIds.length);
  };

  // Side trails: one item per top lane, on the first track free since it was spawned; crowded segments bundle (§8.3).
  const resultOf = new Map<string, Step>();
  for (const s of g.steps) if (s.kind === 'tool-result' && s.laneId === main && s.tool?.callId) resultOf.set(s.tool.callId, s);
  const lanes: LaneItem[] = [];
  const calls = (ls: Step[]) => ls.filter((s) => s.kind === 'tool-call').length;
  const spanMs = (ls: Step[]) => {
    const ts = ls.map(time).filter(Number.isFinite);
    return ts.length > 1 ? Math.max(...ts) - Math.min(...ts) : 0;
  };
  const trackEnd: number[] = [];
  for (const r of [...episodes, ...(answer ? [answer] : [])]) {
    const own = spawnedIn.get(r.episode.id) ?? [];
    const items = own.map((l): LaneItem => {
      const spawn = l.spawnedBy ? byId.get(l.spawnedBy) : undefined;
      const result = spawn?.tool?.callId ? resultOf.get(spawn.tool.callId) : undefined;
      const x1 = xOf(spawn?.id) ?? r.x;
      const back = result ? xOf(result.id) : undefined;
      const ls = family.get(l.id) ?? [];
      const st = laneStatus(g, l, laneSteps.get(l.id));
      const rejoins = back !== undefined && st.status !== 'interrupted';
      return {
        id: `lane:${l.id}`, lanes: [l], episodeId: r.episode.id, track: 0, x1, x2: Math.max(x1 + G.laneSpan, rejoins ? back : r.x + r.len - 6), rejoins,
        status: st.status, word: st.word, calls: calls(ls), failed: st.status === 'error' ? 1 : 0, ms: spanMs(ls), nested: nested.get(l.id) ?? 0, parallel: 0, chars: 0,
        ...(st.handBack || result ? {} : { noHandBack: true }),
      };
    });
    // Sequential lanes in one segment that cannot each get 96 px become one bundle.
    const crowded = items.some((a, i) => i > 0 && (items[i - 1] as LaneItem).x2 > a.x1 && resultSeq(items[i - 1], byId, resultOf) < seqOf(a, byId));
    if (crowded && !opts.unbundle?.has(`bundle:${r.episode.id}`)) {
      const worst = items.reduce((w, it) => (RANK[it.status] > RANK[w.status] ? it : w), items[0] as LaneItem);
      const x1 = Math.min(...items.map((it) => it.x1));
      lanes.push({
        id: `bundle:${r.episode.id}`, lanes: items.flatMap((it) => it.lanes), episodeId: r.episode.id, track: Math.min(G.tracks - 1, placeTrack(trackEnd, x1, 0)), x1,
        x2: Math.max(x1 + G.laneSpan, ...items.map((it) => it.x2)), rejoins: items.every((it) => it.rejoins), status: worst.status, word: worst.word,
        calls: items.reduce((a, it) => a + it.calls, 0), failed: items.filter((it) => it.status === 'error').length, ms: 0,
        nested: items.reduce((a, it) => a + it.nested, 0), parallel: 0, chars: 0,
      });
      claim(trackEnd, lanes[lanes.length - 1] as LaneItem);
      continue;
    }
    for (const it of items) {
      const t = placeTrack(trackEnd, it.x1, 0);
      const host = t >= G.tracks ? [...lanes].reverse().find((p) => p.track === G.tracks - 1) : undefined;
      if (host) {
        host.parallel++;
        continue;
      }
      it.track = Math.min(t, G.tracks - 1);
      lanes.push(it);
      claim(trackEnd, it);
    }
  }
  // Label room: up to the next item on the same track, or the band end.
  for (const it of lanes) {
    const next = lanes.filter((o) => o.track === it.track && o.x1 > it.x1).reduce((m, o) => Math.min(m, o.x1), width);
    it.chars = Math.max(4, Math.floor((next - it.x1 - 12 - 8) / G.monoPx));
  }

  // Blazes on their first evidence step: the route, or the lane item holding it (§8.5).
  const laneItemOf = new Map<string, LaneItem>();
  for (const it of lanes) for (const l of it.lanes) for (const [id, top] of topOf) if (top === l.id) laneItemOf.set(id, it);
  const placed = g.trouble.map((t, i) => {
    const s = byId.get(t.stepIds[0] ?? '');
    const it = s && s.laneId !== main ? laneItemOf.get(s.laneId) : undefined;
    if (it) {
      const ls = family.get(topOf.get(s?.laneId ?? '') ?? '') ?? [];
      const at = Math.max(0, ls.indexOf(s as Step)) / Math.max(1, ls.length);
      const lead = it.track > 0 ? 50 : G.laneDrop;
      return { t, i, x: it.x1 + lead + (it.x2 - it.x1 - lead - (it.rejoins ? lead : 12)) * at, track: it.track, episodeId: it.episodeId, laneItem: it.id };
    }
    const w = s ? where.get(s.id) : undefined;
    return { t, i, x: xOf(s?.id) ?? G.start, track: -1, episodeId: w?.e.id ?? '', laneItem: undefined as string | undefined };
  });
  placed.sort((a, b) => a.x - b.x || a.track - b.track || a.i - b.i);
  const numbers = new Map(opts.numbers ?? placed.map((p, n) => [p.t.id, n + 1]));
  placed.sort((a, b) => (numbers.get(a.t.id) ?? 0) - (numbers.get(b.t.id) ?? 0));
  const blazes: Blaze[] = [];
  const groups = new Map<string, typeof placed>();
  for (const p of placed) {
    const key = `${p.track}|${p.laneItem ?? p.episodeId}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const list of groups.values()) {
    const chunks = list.length > G.maxPlates ? [list] : list.map((p) => [p]);
    for (const c of chunks) {
      const first = c[0] as (typeof placed)[number];
      const a = numbers.get(first.t.id) ?? 0;
      const b = numbers.get((c[c.length - 1] as (typeof placed)[number]).t.id) ?? a;
      const blaze: Blaze = { id: `blaze:${first.t.id}`, trouble: c.map((p) => p.t), badge: a === b ? String(a) : `${a}–${b}`, first: a, resolved: c.every((p) => p.t.resolved), x: first.x, track: first.track, episodeId: first.episodeId };
      if (first.laneItem) blaze.laneItem = first.laneItem;
      blazes.push(blaze);
    }
  }
  blazes.sort((a, b) => a.first - b.first);
  // Collisions: plates on one line keep route order at a 24 px pitch, and on the route they never cover a kind glyph.
  const glyphs = episodes.map((r) => r.x);
  for (const track of new Set(blazes.map((b) => b.track))) {
    let prev = Number.NEGATIVE_INFINITY;
    for (const b of blazes.filter((z) => z.track === track).sort((p, q) => p.x - q.x || p.first - q.first)) {
      b.x = Math.max(b.x, prev + G.pitch);
      const hit = track < 0 ? glyphs.find((gx) => Math.abs(b.x - gx) < G.pitch * 0.75) : undefined;
      if (hit !== undefined) b.x = hit + G.pitch * 0.75;
      prev = b.x;
    }
  }

  const tracks = lanes.length > 0 ? Math.max(...lanes.map((l) => l.track)) + 1 : 0;
  const height = G.routeY + (tracks > 0 ? G.laneDrop + (tracks - 1) * G.trackGap + G.laneLabelH : breaks.length > 0 ? 52 : 20);
  const right = Math.max(width, routeEnd + G.end, ...lanes.map((l) => l.x2 + 8));
  return { width: right, height, routeEnd, pieces, episodes, ...(answer ? { answer } : {}), ...(fold ? { fold } : {}), lanes, blazes, breaks, tracks, numbers, order: placed.map((p) => p.t) };
}

function seqOf(it: LaneItem, byId: Map<string, Step>): number {
  return byId.get(it.lanes[0]?.spawnedBy ?? '')?.seq ?? 0;
}
function resultSeq(it: LaneItem | undefined, byId: Map<string, Step>, resultOf: Map<string, Step>): number {
  const spawn = byId.get(it?.lanes[0]?.spawnedBy ?? '');
  return (spawn?.tool?.callId ? resultOf.get(spawn.tool.callId)?.seq : undefined) ?? Number.POSITIVE_INFINITY;
}
/** The first track (from `min`) that is free at x. */
function placeTrack(trackEnd: number[], x: number, min: number): number {
  let t = min;
  while ((trackEnd[t] ?? Number.NEGATIVE_INFINITY) > x - 8) t++;
  return t;
}
function claim(trackEnd: number[], it: LaneItem) {
  trackEnd[it.track] = Math.max(trackEnd[it.track] ?? Number.NEGATIVE_INFINITY, it.x2);
}

/** y of the route (-1) or a lane track. */
export const lineY = (track: number) => (track < 0 ? G.routeY : G.routeY + G.laneDrop + track * G.trackGap);

const numbered = new WeakMap<SessionGraph, Map<string, number>>();
/** Badge numbers of a graph's patterns in route order, the same in the map, its stuck list and the outline. */
export function troubleNumbers(g: SessionGraph): Map<string, number> {
  let n = numbered.get(g);
  if (!n) numbered.set(g, (n = glanceLayout(g, 1216).numbers));
  return n;
}
