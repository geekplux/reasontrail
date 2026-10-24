// The git-style list (docs/design/v7/PROMPT.md §6; geometry from docs/design/v7/gitlist.mjs), pure: the session in
// order as rows on rails. The main agent runs down the main rail; each subagent forks off it at its lane row, runs its
// episodes on its own rail and merges back after its verdict row. An open episode lists its steps on the same rail.
import type { Episode, Lane, SessionGraph, Step } from '../../../shared/session/types';
import { exitCode, rowStatus, stepRows } from '../details';
import { laneStatus } from '../layout';
import { duration, laneEpisodes } from '../outline';

/** The five episode glyphs: ▶ task, ○ explore, ■ change, ◇ verify, ◉ answer. */
export type GlyphKind = 'discuss' | 'explore' | 'change' | 'verify' | 'answer';
/** A lane's verdict: ⚠ orange failed, ✓ blue passed, a commit mark, an ink ✓ done, a dashed ring when unknown. */
export type VerdictTone = 'fail' | 'ok' | 'commit' | 'done' | 'unknown';

interface RowBase {
  key: string;
  laneId: string;
  /** The row's mark sits on the main rail (x 4.5), else on the subagent rail (x 28.5). */
  main: boolean;
}
export interface LaneRow extends RowBase { kind: 'lane'; name: string; agent?: string; steps?: number; at: string }
export interface EpisodeRow extends RowBase {
  kind: 'episode';
  episodeId: string;
  glyph: GlyphKind;
  /** The episode's number, shared with the tree: every episode of the session in list order, answers included. */
  n: number;
  title: string;
  /** Tool calls whose result failed. */
  failed: number;
  /** "14 min wait": the longest pause over 5 min before one of its steps. */
  wait?: string;
  steps: number;
  at: string;
}
export interface VerdictRow extends RowBase { kind: 'verdict'; tone: VerdictTone; text: string; dur?: string; steps?: number; at: string; episodeId?: string }
export interface EndRow extends RowBase { kind: 'end'; at: string }
export type ListRow = LaneRow | EpisodeRow | VerdictRow | EndRow;

/** One tool call or thinking step of an open episode. */
export interface StepRow { kind: 'step'; key: string; stepId: string; episodeId: string; mark: 'call' | 'thinking' | 'failed'; label: string; exit?: string; at: string }
/** "Show N more steps" under a truncated open episode. */
export interface MoreRow { kind: 'more'; key: string; episodeId: string; more: number }
export type AnyRow = ListRow | StepRow | MoreRow;

const WAIT_MS = 5 * 60_000;
/** Steps listed under an open episode before "Show N more steps". */
export const STEP_ROWS_MAX = 20;

/** "16 min" from the session start; "1 h 05 min" past an hour. */
export const minutes = (ms: number) => (ms < 3_600_000 ? `${Math.round(Math.max(0, ms) / 60_000)} min` : duration(ms));

const STOP = /\s+(?:of|for|to|and|the|in|on|at|a|an|with)$/i;
/** A recorded first request as an episode title: its first sentence, without a parenthetical tail or a cut-off word. */
export function shortTitle(title: string): string {
  let t = title.split(/(?<=[.!?])\s/, 1)[0] ?? title;
  const paren = t.indexOf(' (');
  // What the parenthesis described (a path, a branch) goes with it: "Re-verify Phase 12 of Reasontrail (/workspace/…".
  if (paren > 0) t = t.slice(0, paren).replace(/ of [^\s]+$/, '');
  else if (t.endsWith('…')) t = t.slice(0, t.lastIndexOf(' ') > 0 ? t.lastIndexOf(' ') : undefined);
  while (STOP.test(t)) t = t.replace(STOP, '');
  return t.replace(/[.:,;]$/, '') || title;
}

const time = (s: Step | undefined) => (s?.t ? Date.parse(s.t) : Number.NaN);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A commit hash in a `git commit` (`[main cceb2d5] …`) or `git log --oneline` (`cceb2d5 …`) output. */
export const COMMIT_HASH = /(?:^|\n)(?:\[[^\]\s]+ (?:\(root-commit\) )?([0-9a-f]{7,40})\]|([0-9a-f]{7,40}) )/;

const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

/** The verdict row of a subagent lane: "Failed: 1 gap", "Committed cceb2d5", "Passed", "Done"… */
export function laneVerdict(g: SessionGraph, lane: Lane, steps: Step[]): { tone: VerdictTone; text: string } {
  const st = laneStatus(g, lane, steps);
  if (st.status === 'error') {
    if (st.word === 'changes requested') return { tone: 'fail', text: 'Changes requested' };
    const report = [...steps].reverse().find((s) => s.kind === 'assistant' && s.text)?.text ?? '';
    const m = st.word === 'FAIL' ? /\b(one|two|three|four|five|six|seven|eight|nine|\d+) (gap|problem|issue|finding)s?\b/i.exec(report.split(/\n\s*\n/).slice(0, 2).join(' ')) : null;
    const n = m ? (COUNT[m[1]!.toLowerCase()] ?? Number(m[1])) : 0;
    return { tone: 'fail', text: n > 0 ? `Failed: ${n} ${m![2]!.toLowerCase()}${n === 1 ? '' : 's'}` : 'Failed' };
  }
  if (st.status === 'interrupted') return { tone: 'unknown', text: 'Interrupted' };
  if (st.status === 'unknown') return { tone: 'unknown', text: 'No result recorded' };
  if (st.word === 'PASS' || st.word === 'approved') return { tone: 'ok', text: st.word === 'PASS' ? 'Passed' : 'Approved' };
  const commits = new Set(steps.filter((s) => s.kind === 'tool-call' && /\bgit commit\b/.test(s.tool?.command ?? '')).map((s) => s.tool?.callId));
  let hash: string | undefined;
  for (const r of steps) {
    if (r.kind !== 'tool-result' || r.status !== 'ok' || !commits.has(r.tool?.callId)) continue;
    const m = COMMIT_HASH.exec(r.text ?? '');
    if (m) hash = (m[1] ?? m[2])?.slice(0, 7);
  }
  return hash ? { tone: 'commit', text: `Committed ${hash}` } : { tone: 'done', text: 'Done' };
}

/** The list's rows in session order (collapsed): Main agent, its episodes, each subagent as a lane row, its episodes
 * and its verdict, then "Session ends". A main-lane episode that spawned subagents is drawn as their lane rows. */
export function listRows(g: SessionGraph): ListRow[] {
  const main = g.lanes[0];
  if (!main) return [];
  const steps = [...g.steps].sort((a, b) => a.seq - b.seq);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const t0 = Number.isFinite(Date.parse(g.source.startedAt ?? '')) ? Date.parse(g.source.startedAt ?? '') : steps.map(time).find(Number.isFinite) ?? 0;
  const at = (s: Step | undefined) => (Number.isFinite(time(s)) ? minutes(time(s) - t0) : '');
  // The pause before each step, in session order across lanes.
  const pause = new Map<string, number>();
  let prev = Number.NaN;
  for (const s of steps) {
    const t = time(s);
    if (!Number.isFinite(t)) continue;
    if (t - prev > WAIT_MS) pause.set(s.id, t - prev);
    prev = t;
  }
  const rows: ListRow[] = [{ kind: 'lane', key: `lane:${main.id}`, laneId: main.id, main: true, name: 'Main agent', at: at(steps[0]) }];
  let n = 0;
  const episodeRow = (e: Episode, onMain: boolean): EpisodeRow => {
    const waits = e.stepIds.map((id) => pause.get(id) ?? 0);
    const wait = Math.max(0, ...waits);
    const failed = stepRows(g, e.stepIds).filter((r) => r.step.kind === 'tool-call' && rowStatus(r) === 'error').length;
    const row: EpisodeRow = {
      kind: 'episode', key: `ep:${e.id}`, laneId: e.laneId, main: onMain, episodeId: e.id, glyph: e.kind === 'delegate' ? 'discuss' : e.kind,
      n: ++n, title: shortTitle(e.title), failed, steps: e.stepIds.length, at: at(byId.get(e.stepIds[0] ?? '')),
    };
    if (wait > 0) row.wait = `${minutes(wait)} wait`;
    return row;
  };
  const placed = new Set<string>([main.id]);
  const laneBlock = (lane: Lane) => {
    placed.add(lane.id);
    const own = steps.filter((s) => s.laneId === lane.id);
    const eps = laneEpisodes(g, lane.id);
    const answer = eps.length > 1 && eps[eps.length - 1]?.kind === 'answer' ? eps[eps.length - 1] : undefined;
    const lr: LaneRow = { kind: 'lane', key: `lane:${lane.id}`, laneId: lane.id, main: true, name: lane.name, steps: own.length, at: at(own[0]) };
    if (lane.agentType) lr.agent = cap(lane.agentType);
    rows.push(lr, ...eps.filter((e) => e !== answer).map((e) => episodeRow(e, false)));
    // From the spawn to the hand-back (the spawn call's result on the main lane), else to the lane's last step.
    const spawn = byId.get(lane.spawnedBy ?? '');
    const from = time(spawn) || time(own[0]);
    const last = own[own.length - 1];
    const back = spawn?.tool?.callId ? steps.find((s) => s.kind === 'tool-result' && s.laneId !== lane.id && s.tool?.callId === spawn.tool?.callId) : undefined;
    const vr: VerdictRow = { kind: 'verdict', key: `verdict:${lane.id}`, laneId: lane.id, main: false, ...laneVerdict(g, lane, own), at: answer ? at(byId.get(answer.stepIds[0] ?? '')) : at(last) };
    const until = time(back) || time(last);
    if (Number.isFinite(until - from)) vr.dur = minutes(until - from);
    if (answer) {
      n++;
      vr.episodeId = answer.id;
      vr.steps = answer.stepIds.length;
    }
    rows.push(vr);
  };
  for (const e of laneEpisodes(g, main.id)) {
    const spawned = e.kind === 'delegate' ? g.lanes.filter((l) => l.spawnedBy && e.stepIds.includes(l.spawnedBy) && !placed.has(l.id)) : [];
    if (spawned.length > 0) spawned.forEach(laneBlock);
    else rows.push(episodeRow(e, true));
  }
  for (const l of g.lanes) if (!placed.has(l.id)) laneBlock(l); // nested or unattributed subagents, in lane order
  const wall = g.stats.durationMs ?? time(steps[steps.length - 1]) - t0;
  rows.push({ kind: 'end', key: 'end', laneId: main.id, main: true, at: Number.isFinite(wall) ? minutes(wall) : '' });
  return rows;
}

/** The step rows of an open episode: each tool call (its result folded in) and thinking step, in order. */
export function episodeSteps(g: SessionGraph, episodeId: string): StepRow[] {
  const e = g.episodes.find((x) => x.id === episodeId);
  if (!e) return [];
  const t0 = Date.parse(g.source.startedAt ?? '');
  return stepRows(g, e.stepIds)
    .filter((r) => r.step.kind === 'tool-call' || r.step.kind === 'thinking')
    .map((r) => {
      const status = rowStatus(r);
      const code = exitCode(r);
      const row: StepRow = {
        kind: 'step', key: `step:${r.id}`, stepId: r.id, episodeId,
        mark: r.step.kind === 'thinking' ? 'thinking' : status === 'error' ? 'failed' : 'call',
        label: r.step.kind === 'thinking' ? 'Thinking' : (r.step.tool?.summary ?? 'Tool call').replace(/^Bash /, ''),
        at: Number.isFinite(time(r.step) - t0) ? minutes(time(r.step) - t0) : '',
      };
      if (r.step.kind === 'tool-call') {
        const exit = code !== undefined ? `Exit ${code}` : status === 'error' ? 'Failed' : status === 'interrupted' ? 'Interrupted' : undefined;
        if (exit) row.exit = exit;
      }
      return row;
    });
}

// Geometry at 680 (gitlist.mjs): rails, then # at 64, Episode at 92, Steps right at 616, Start right at 680.
export const GEO = { mainX: 4.5, subX: 28.5, head: 32, root: 40, lane: 52, episode: 40, episodeSub: 52, verdict: 56, laneGap: 4, step: 30, stepsGap: 6, end: 40 } as const;

/** A row placed at `y` (its top), `h` tall; the mark sits at `cy` on the main or subagent rail. */
export interface Placed { row: AnyRow; y: number; h: number; cy: number; x: number }
export interface Rail { d: string; cls: 'r-main' | 'r-sub' | 'r-wait' }
export interface ListLayout { height: number; placed: Placed[]; rails: Rail[]; root: { x: number; y: number }; forks: { x: number; y: number }[]; end: { x: number; y: number }; highlight: string[] }

const f1 = (v: number) => v.toFixed(1);

/** Place the rows top to bottom from y 32 (under the header) and draw the rails. `open`: the open episode and its
 * (possibly truncated) step rows; `target`: the row the blue path from the root runs to (the selected step, else the
 * open episode). */
export function layoutList(rows: ListRow[], open?: { episodeId: string; steps: (StepRow | MoreRow)[] }, target?: string): ListLayout {
  const { mainX: MX, subX: SX } = GEO;
  const placed: Placed[] = [];
  const rails: Rail[] = [];
  const forks: { x: number; y: number }[] = [];
  const highlight: string[] = [];
  let y: number = GEO.head;
  let rootY = y + 20;
  let mainFrom = rootY;
  let railFrom = 0;
  let fork: { y: number; d: string; end: number } | undefined;
  const hi = (toY: number, onMain: boolean) => {
    if (onMain || !fork) highlight.push(`M${MX} ${f1(rootY)}V${f1(toY)}`);
    else highlight.push(`M${MX} ${f1(rootY)}V${f1(fork.y)}`, fork.d, `M${SX} ${f1(fork.end)}V${f1(toY)}`);
  };
  for (const row of rows) {
    if (row.kind === 'lane' && rows[0] === row) {
      rootY = y + 20;
      mainFrom = rootY;
      placed.push({ row, y, h: GEO.root, cy: rootY, x: MX });
      y += GEO.root;
    } else if (row.kind === 'lane') {
      const ly = y + 20;
      rails.push({ d: `M${MX} ${f1(mainFrom)}V${f1(ly)}`, cls: 'r-main' });
      const end = ly + 22;
      fork = { y: ly, end, d: `M${MX} ${f1(ly)}C${MX} ${f1(ly + 14)} ${SX} ${f1(ly + 8)} ${SX} ${f1(end)}` };
      rails.push({ d: fork.d, cls: 'r-sub' });
      forks.push({ x: MX, y: ly });
      placed.push({ row, y, h: GEO.lane, cy: ly, x: MX });
      railFrom = end;
      y += GEO.lane;
    } else if (row.kind === 'episode') {
      const h = row.failed || row.wait ? GEO.episodeSub : GEO.episode;
      const ey = y + 20;
      const x = row.main ? MX : SX;
      if (row.main) {
        rails.push({ d: `M${MX} ${f1(mainFrom)}V${f1(ey)}`, cls: 'r-main' });
        mainFrom = ey;
      } else {
        rails.push({ d: `M${SX} ${f1(railFrom)}V${f1(ey)}`, cls: 'r-sub' });
        railFrom = ey;
      }
      placed.push({ row, y, h, cy: ey, x });
      if (target === row.key) hi(ey, row.main);
      y += h;
      if (open?.episodeId === row.episodeId) {
        for (const s of open.steps) {
          const ry = y + 15;
          if (s.kind === 'step') {
            rails.push({ d: `M${x} ${f1(row.main ? mainFrom : railFrom)}V${f1(ry)}`, cls: row.main ? 'r-main' : 'r-sub' });
            if (row.main) mainFrom = ry;
            else railFrom = ry;
            if (target === s.key) hi(ry, row.main);
          }
          placed.push({ row: s, y, h: GEO.step, cy: ry, x });
          y += GEO.step;
        }
        y += GEO.stepsGap;
      }
    } else if (row.kind === 'verdict') {
      const vy = y + 20;
      rails.push({ d: `M${SX} ${f1(railFrom)}V${f1(vy)}`, cls: 'r-sub' });
      const my = vy + 30;
      rails.push({ d: `M${SX} ${f1(vy + 9)}C${SX} ${f1(my - 6)} ${MX} ${f1(my - 14)} ${MX} ${f1(my)}`, cls: 'r-sub' });
      if (fork) rails.push({ d: `M${MX} ${f1(fork.y)}V${f1(my)}`, cls: 'r-wait' });
      if (target === row.key) hi(vy, false);
      placed.push({ row, y, h: GEO.verdict + GEO.laneGap, cy: vy, x: SX });
      mainFrom = my;
      fork = undefined;
      y += GEO.verdict + GEO.laneGap;
    } else {
      const endY = y + 20;
      rails.push({ d: `M${MX} ${f1(mainFrom)}V${f1(endY)}`, cls: 'r-main' });
      placed.push({ row, y, h: GEO.end, cy: endY, x: MX });
      y += GEO.end;
    }
  }
  const last = placed[placed.length - 1];
  return { height: y, placed, rails, forks, highlight, root: { x: MX, y: rootY }, end: { x: MX, y: last?.cy ?? y } };
}
