// What the tree draws, before any geometry: the parts (trunk and limbs), their episodes and twigs, tips, hand-backs and
// waits, with the along-axis position of every record. Numbers, names, verdicts and durations come from the list's
// row model (../gitlist/rows.ts), so the tree and the list always agree.
import type { SessionGraph, Step } from '../../../shared/session/types';
import { rowStatus, stepRows } from '../details';
import { listRows, type GlyphKind, type LaneRow, type VerdictRow, type VerdictTone } from '../gitlist/rows';
import type { LabelClass, TwigKind } from './types';

/** Kinds of step that take one unit on the along-axis (results fold into their call). */
const RECORD = new Set<Step['kind']>(['user', 'assistant', 'thinking', 'tool-call']);

export interface TwigSrc { stepId: string; episodeId: string; kind: TwigKind; seq: number }
export interface EpisodeSrc { id: string; n: number; glyph: GlyphKind; first: number; last: number; twigs: TwigSrc[]; calls: number }
export interface PartSrc {
  id: string;
  laneId: string;
  /** The lane whose verdict the tip shows: the trunk's leader, else the part's own lane. */
  tipLane: string;
  /** Seq of the record it grows from (the spawn), and of its last record. */
  from: number;
  last: number;
  episodes: EpisodeSrc[];
  /** Twigs straight on the part: steps of an episode that is not a branch (a spawning delegate, the answer). */
  twigs: TwigSrc[];
  tip: { kind: 'answer' | 'end'; tone: VerdictTone; episodeId?: string };
  /** The lines of the text block beside the tip. */
  block: { text: string; cls: LabelClass; icon?: VerdictTone }[];
  /** Seq of the main-lane record where the main agent resumed (the hand-back target). */
  resume?: number;
  /** The lane's duration when the main agent waited for it. */
  wait?: string;
}
export interface TreeModel {
  /** Every record's seq in session order and the extra units before it (9 after a spawn, 4 on return to main). */
  records: { seq: number; gap: number }[];
  trunk: PartSrc;
  limbs: PartSrc[];
  rootAt: string;
  /** Each lane's last episode in the list, by lane id (the hit target of a tip without an episode of its own). */
  lastEpisode: Record<string, string>;
}

// Loops, not `Math.min(...xs)`: a spread of a huge session's seqs overflows the call stack.
const least = (xs: readonly number[]) => { let v = Infinity; for (const x of xs) v = Math.min(v, x); return v; };
const most = (xs: readonly number[]) => { let v = -Infinity; for (const x of xs) v = Math.max(v, x); return v; };

const twigKind = (r: ReturnType<typeof stepRows>[number]): TwigKind =>
  r.step.kind === 'thinking' ? 'thinking' : rowStatus(r) === 'error' ? 'failed' : r.step.tool?.category === 'read' ? 'read' : 'call';

export function treeModel(g: SessionGraph): TreeModel {
  const main = g.lanes[0]?.id ?? 'main';
  const steps = [...g.steps].sort((a, b) => a.seq - b.seq);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const spawns = new Set(g.lanes.flatMap((l) => (l.spawnedBy ? [l.spawnedBy] : [])));
  const recs = steps.filter((s) => RECORD.has(s.kind));
  const records = recs.map((s, i) => {
    const prev = recs[i - 1];
    return { seq: s.seq, gap: !prev ? 0 : spawns.has(prev.id) && prev.laneId === main ? 9 : prev.laneId !== main && s.laneId === main ? 4 : 0 };
  });
  const seqs = (ids: readonly string[]) => ids.flatMap((id) => { const s = byId.get(id); return s && RECORD.has(s.kind) ? [s.seq] : []; });
  const twigsOf = (episodeId: string, ids: readonly string[]): TwigSrc[] =>
    stepRows(g, ids)
      .filter((r) => (r.step.kind === 'tool-call' && !spawns.has(r.step.id)) || r.step.kind === 'thinking')
      .map((r) => ({ stepId: r.id, episodeId, kind: twigKind(r), seq: r.step.seq }));

  const rows = listRows(g);
  const lastRow = rows[rows.length - 2];
  const spawnLane = (laneId: string) => byId.get(g.lanes.find((l) => l.id === laneId)?.spawnedBy ?? '')?.laneId;
  // The last subagent continues the trunk when the main agent does nothing after it (the trunk's leader).
  const leader = lastRow?.kind === 'verdict' && spawnLane(lastRow.laneId) === main ? lastRow.laneId : undefined;
  const make = (laneId: string, id: string): PartSrc => ({ id, laneId, tipLane: laneId, from: 0, last: 0, episodes: [], twigs: [], tip: { kind: 'end', tone: 'done' }, block: [] });
  const trunk = make(main, 'trunk');
  const parts = new Map<string, PartSrc>([[main, trunk]]);
  if (leader) {
    parts.set(leader, trunk);
    trunk.tipLane = leader;
  }
  const limbs: PartSrc[] = [];
  const episodeIds = new Set<string>();
  const lanes = new Map<string, LaneRow>();
  const lastEpisode: Record<string, string> = {};
  for (const row of rows) {
    if (row.kind === 'episode') lastEpisode[row.laneId] = row.episodeId;
    if (row.kind === 'lane' && !parts.has(row.laneId)) {
      const limb = make(row.laneId, `limb:${row.laneId}`);
      parts.set(row.laneId, limb);
      limbs.push(limb);
    }
    const part = parts.get(row.laneId);
    if (!part) continue;
    if (row.kind === 'lane' && row.laneId !== main) lanes.set(row.laneId, row);
    else if (row.kind === 'episode') {
      const e = g.episodes.find((x) => x.id === row.episodeId);
      episodeIds.add(row.episodeId);
      const s = seqs(e?.stepIds ?? []);
      const twigs = twigsOf(row.episodeId, e?.stepIds ?? []);
      if (s.length === 0) part.twigs.push(...twigs);
      else part.episodes.push({ id: row.episodeId, n: row.n, glyph: row.glyph, first: least(s), last: most(s), twigs, calls: twigs.filter((t) => t.kind !== 'thinking').length });
    } else if (row.kind === 'verdict') verdict(part, row);
    else if (row.kind === 'end' && !leader) trunk.block = [{ text: 'Session ends', cls: 'lab' }, { text: row.at, cls: 'sub' }];
  }
  function verdict(part: PartSrc, row: VerdictRow) {
    const lane = lanes.get(row.laneId);
    part.tip = { kind: 'answer', tone: row.tone, ...(row.episodeId ? { episodeId: row.episodeId } : {}) };
    const sub = [lane?.agent, row.dur].filter(Boolean).join(', ');
    part.block = [{ text: lane?.name ?? '', cls: 'lane' }, { text: row.text, cls: 'lab', icon: row.tone }, ...(sub ? [{ text: sub, cls: 'sub' as const }] : [])];
    if (row.dur) part.wait = row.dur;
  }
  // The main agent's closing answer is the trunk's tip, not a branch.
  const lastEp = trunk.episodes[trunk.episodes.length - 1];
  if (!leader && lastEp?.glyph === 'answer' && lastRow?.kind === 'episode' && lastRow.episodeId === lastEp.id) {
    trunk.episodes.pop();
    trunk.twigs.push(...lastEp.twigs);
    trunk.tip = { kind: 'answer', tone: 'done', episodeId: lastEp.id };
  }
  // Steps of episodes that are not rows (a spawning delegate, a lane's answer) grow as twigs on their lane's part.
  for (const e of g.episodes) {
    if (e.parentId || episodeIds.has(e.id)) continue;
    (parts.get(e.laneId) ?? trunk).twigs.push(...twigsOf(e.id, e.stepIds));
  }
  const mainSeqs = recs.filter((s) => s.laneId === main).map((s) => s.seq);
  const laneSeqs = (laneId: string) => recs.filter((s) => s.laneId === laneId).map((s) => s.seq);
  for (const limb of limbs) {
    const own = laneSeqs(limb.laneId);
    const spawn = byId.get(g.lanes.find((l) => l.id === limb.laneId)?.spawnedBy ?? '');
    limb.from = spawn && RECORD.has(spawn.kind) ? spawn.seq : (own[0] ?? 0);
    limb.last = own[own.length - 1] ?? limb.from;
    const resume = mainSeqs.find((s) => s > limb.last);
    if (resume !== undefined) limb.resume = resume;
    // The main agent waited when it did nothing between the spawn and the hand-back.
    if (resume === undefined || mainSeqs.some((s) => s > limb.from && s < resume)) delete limb.wait;
  }
  const trunkSeqs = [...mainSeqs, ...(leader ? laneSeqs(leader) : [])];
  trunk.from = recs[0]?.seq ?? 0;
  trunk.last = most([...trunkSeqs, ...limbs.map((l) => l.from), trunk.from]);
  delete trunk.wait;
  return { records, trunk, limbs, rootAt: rows[0]?.at ?? '', lastEpisode };
}
