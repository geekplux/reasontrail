// Pure derivations for the outline view (DESIGN §8.9, §10.2): task card, At a glance, route items, step lines.
import type { Episode, Lane, SessionGraph, Step, StepStatus, Trouble } from '../../shared/session/types';

const IDLE_MS = 10 * 60_000;
export const REQUEST_MAX = 280;

export const SOURCE_LABEL: Record<SessionGraph['source']['kind'], string> = {
  'claude-code': 'Claude Code', codex: 'Codex', 'grok-build': 'Grok Build', chat: 'Chat',
};

export const TROUBLE_LABEL: Record<Trouble['kind'], string> = {
  'error-streak': 'Error streak', retry: 'Retry', revert: 'Revert', rewind: 'Rewound', interrupt: 'Interrupted', churn: 'Churn',
};

export const STATUS_WORD: Record<StepStatus, string> = { ok: 'ok', error: 'failed', interrupted: 'interrupted' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** "42 s", "12 min", "2 h 05 min". */
export function duration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Wall and active time: active = the sum of gaps between timed steps that are shorter than 10 min. */
export function times(steps: readonly Step[]): { wall: number; active: number } | undefined {
  const t = steps.flatMap((s) => (s.t ? [Date.parse(s.t)] : [])).filter(Number.isFinite).sort((a, b) => a - b);
  if (t.length < 2) return undefined;
  let active = 0;
  for (let i = 1; i < t.length; i++) {
    const gap = (t[i] as number) - (t[i - 1] as number);
    if (gap < IDLE_MS) active += gap;
  }
  return { wall: (t[t.length - 1] as number) - (t[0] as number), active };
}

/** `s` shortened in the middle with "…" to at most `max` characters (DESIGN §8.10). */
export const middle = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.ceil((max - 1) / 2))}…${s.slice(s.length - Math.floor((max - 1) / 2))}` : s);

/** A provenance file name: the basename, shortened in the middle to 28 characters. */
export const fileLabel = (path: string) => middle(path.split('/').pop() ?? path, 28);

export function isUnstoredThinking(s: Step): boolean {
  return s.kind === 'thinking' && (s.textStored === false || !s.text?.trim());
}

/** The trailhead card: source and model (after "Task · "), the first user request and the meta row (zero counts omitted). */
export function taskCard(g: SessionGraph) {
  const main = g.lanes[0]?.id ?? 'main';
  const request = g.steps.find((s) => s.laneId === main && s.kind === 'user' && s.text?.trim())?.text?.trim() || g.title;
  // Set in capitals by CSS ("TASK · CLAUDE CODE · <MODEL>"); the DOM keeps normal case for screen readers.
  const meta: string[] = [];
  const tm = times(g.steps);
  if (tm && tm.wall - tm.active > IDLE_MS) meta.push(`${duration(tm.wall)} wall`);
  if (tm) meta.push(`${duration(tm.active)} active`);
  const count = (n: number, one: string, many?: string) => n > 0 && meta.push(plural(n, one, many));
  count(g.steps.filter((s) => s.kind === 'tool-call').length, 'tool call');
  count(g.lanes.length - 1, 'subagent');
  const unstored = g.steps.filter(isUnstoredThinking).length;
  if (unstored > 0) meta.push(`${unstored} thinking (text not stored)`);
  return { source: SOURCE_LABEL[g.source.kind], model: g.source.model, request, meta };
}

export type GlanceStatus = 'ok' | 'error' | 'unknown';
export interface GlanceRow { key: 'verify' | 'trouble' | 'files'; status: GlanceStatus; lead: string; rest: string }

function finalStatus(g: SessionGraph): string | undefined {
  const ran = (re: RegExp) => g.steps.some((s) => s.tool?.command && re.test(s.tool.command) && g.steps.some((r) => r.kind === 'tool-result' && r.tool?.callId === s.tool?.callId && r.status === 'ok'));
  if (ran(/\bgh pr create\b/)) return 'PR opened';
  if (ran(/\bgit commit\b/)) return 'committed';
  return undefined;
}

/** The three At a glance rows (DESIGN §8.9). */
export function glance(g: SessionGraph): GlanceRow[] {
  const v = g.outcome.lastVerification;
  const n = g.trouble.length;
  const k = g.trouble.filter((t) => t.resolved).length;
  const files = g.outcome.files.length;
  const final = finalStatus(g) ?? (files === 0 ? 'answer only' : undefined);
  return [
    v ? { key: 'verify', status: v.ok ? 'ok' : 'error', lead: v.ok ? 'Verified:' : 'Not verified:', rest: ` ${clip(v.command, 80)} ${v.ok ? 'passed' : 'failed'}` }
      : { key: 'verify', status: 'unknown', lead: 'No verification run found', rest: '' },
    n > 0 ? { key: 'trouble', status: k === n ? 'ok' : 'error', lead: plural(n, 'trouble spot'), rest: `, ${k} resolved` }
      : { key: 'trouble', status: 'ok', lead: 'No trouble detected', rest: '' },
    { key: 'files', status: 'unknown', lead: `${plural(files, 'file')} changed`, rest: final ? `, ${final}` : '' },
  ];
}

/** Top-level episodes of a lane, in order. */
export function laneEpisodes(g: SessionGraph, laneId: string): Episode[] {
  return g.episodes.filter((e) => e.laneId === laneId && !e.parentId);
}

/** Trouble patterns whose first evidence step is in this episode, and the subagent lanes it spawned. */
export function episodeLinks(g: SessionGraph, e: Episode): { trouble: { t: Trouble; n: number }[]; lanes: Lane[] } {
  const ids = new Set(e.stepIds);
  return {
    trouble: g.trouble.flatMap((t, i) => (ids.has(t.stepIds[0] ?? '') ? [{ t, n: i + 1 }] : [])),
    lanes: g.lanes.filter((l) => l.spawnedBy && ids.has(l.spawnedBy)),
  };
}

export interface StepLine { id: string; kind: Step['kind']; text: string; status?: StepStatus; times: number }

/** One line per step for an episode's step list: calls carry their result's status; results are folded into them;
 * consecutive unstored thinking blocks collapse into one "×n" line (DM20). */
export function stepLines(g: SessionGraph, e: Episode): StepLine[] {
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const result = new Map(g.steps.filter((s) => s.kind === 'tool-result' && s.tool?.callId).map((s) => [s.tool?.callId, s.status]));
  const lines: StepLine[] = [];
  for (const id of e.stepIds) {
    const s = byId.get(id);
    if (!s || s.kind === 'tool-result') continue;
    const prev = lines[lines.length - 1];
    if (isUnstoredThinking(s)) {
      if (prev?.kind === 'thinking' && prev.text === 'thinking (text not stored)') prev.times++;
      else lines.push({ id, kind: 'thinking', text: 'thinking (text not stored)', times: 1 });
      continue;
    }
    const text = s.kind === 'tool-call' ? s.tool?.summary ?? 'tool call' : s.kind === 'compaction' ? 'context compacted' : (s.text ?? '').trim().split('\n', 1)[0] ?? '';
    const line: StepLine = { id, kind: s.kind, text: clip(text, 160), times: 1 };
    const status = s.kind === 'tool-call' ? result.get(s.tool?.callId) : s.status;
    if (status) line.status = status;
    lines.push(line);
  }
  return lines;
}

/** Notes shown under the task meta row (DESIGN §12), as static text. */
export function parseNotes(g: SessionGraph): string[] {
  const notes: string[] = [];
  const bad = g.stats.skippedLines - g.stats.partialLines;
  if (bad > 0) notes.push(`${plural(bad, 'line')} could not be read and ${bad === 1 ? 'was' : 'were'} skipped.`);
  if (g.stats.partialLines > 0) notes.push('This session is still being written; the last line was incomplete and was skipped. Run the command again to update.');
  return notes;
}

/** Where the skipped lines are, for the "Show where" disclosure: "line 12", or "file:12" when the session spans several
 * files; "and n more" past the stored cap. */
export function skippedWhere(g: SessionGraph): string[] {
  const at = g.stats.skippedLineNumbers ?? [];
  const multi = g.lanes.length > 1 || new Set(at.map((p) => p.file)).size > 1;
  const out = at.map((p) => (multi ? `${p.file}:${p.line}` : `line ${p.line}`));
  const rest = g.stats.skippedLines - at.length;
  if (at.length > 0 && rest > 0) out.push(`and ${rest} more`);
  return out;
}
