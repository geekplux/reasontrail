// Details on demand (PLAN M3, M9; DESIGN §8.10, §10.1), pure: what a selected map item contains, its step rows, the
// tool views' text (line diff, output excerpt, exit status), provenance labels and the `?step=` / `#step=` links.
import type { Episode, Lane, SessionGraph, Step, Trouble } from '../../shared/session/types';
import type { GlanceLayout } from './layout';
import { TROUBLE_WORD } from './keyboard';
import { isUnstoredThinking } from './outline';

/** One row of a step list: a call with its result folded in, or a run of unstored thinking blocks ("×n"). */
export interface Row {
  /** The row's first step id (the one a link points to). */
  id: string;
  ids: string[];
  step: Step;
  result?: Step;
  times: number;
}

/** Rows for `stepIds`, in order. Results join their call; consecutive unstored thinking collapses (DM20). */
export function stepRows(g: SessionGraph, stepIds: readonly string[]): Row[] {
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const rows: Row[] = [];
  const calls = new Map<string, Row>();
  for (const id of stepIds) {
    const s = byId.get(id);
    if (!s) continue;
    const call = s.kind === 'tool-result' && s.tool?.callId ? calls.get(s.tool.callId) : undefined;
    if (call && !call.result) {
      call.result = s;
      call.ids.push(id);
      continue;
    }
    const prev = rows[rows.length - 1];
    if (isUnstoredThinking(s) && prev && isUnstoredThinking(prev.step)) {
      prev.ids.push(id);
      prev.times++;
      continue;
    }
    const row: Row = { id, ids: [id], step: s, times: 1 };
    if (s.kind === 'tool-call' && s.tool?.callId) calls.set(s.tool.callId, row);
    rows.push(row);
  }
  return rows;
}

export const rowStatus = (r: Row) => r.result?.status ?? r.step.status;

/** "Exit code 2" at the start of a failed shell result. */
export function exitCode(r: Row): number | undefined {
  const m = /^Exit code (\d+)/.exec(r.result?.text ?? '');
  if (m) return Number(m[1]);
  return r.step.tool?.category === 'run' && r.result?.status === 'ok' ? 0 : undefined;
}

const CATEGORY: Record<string, string> = { read: 'Read', search: 'Search', edit: 'Edit', write: 'Write', run: 'Run', web: 'Web', agent: 'Agent', plan: 'Plan', other: 'Tool' };
const KIND: Record<Step['kind'], string> = { user: 'User', assistant: 'Assistant', thinking: 'Thinking', 'tool-call': 'Tool', 'tool-result': 'Result', system: 'System', compaction: 'Compaction' };

/** "Run", "Edit", "Thinking", "Assistant"… */
export const rowCategory = (r: Row) => (r.step.tool && r.step.kind === 'tool-call' ? CATEGORY[r.step.tool.category] ?? 'Tool' : KIND[r.step.kind]);

/** "failed", "passed", "ok", "interrupted", or "" when the row has no outcome. */
export function rowStatusWord(r: Row): string {
  const s = rowStatus(r);
  if (s === 'error') return 'failed';
  if (s === 'interrupted') return 'interrupted';
  if (s === 'ok') return r.step.tool?.category === 'run' ? 'passed' : 'ok';
  return r.step.kind === 'tool-call' ? 'no result recorded' : '';
}

/** The row's one-line label: the command, the tool summary, or the first line of the text. */
export function rowLabel(r: Row): string {
  const s = r.step;
  if (isUnstoredThinking(s)) return `thinking (text not stored)${r.times > 1 ? ` ×${r.times}` : ''}`;
  if (s.tool?.command) return s.tool.command.split('\n', 1)[0] ?? '';
  if (s.tool) return s.tool.summary;
  if (s.kind === 'compaction') return 'context compacted';
  const line = (s.text ?? '').trim().split('\n', 1)[0] ?? '';
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

/** Assistant text and thinking are the agent's own words: the honesty label repeats for them (M5). */
export const ownWords = (r: Row) => r.step.kind === 'assistant' || r.step.kind === 'thinking';

export type DiffLine = { op: ' ' | '-' | '+'; text: string };

/** A line diff of `before` → `after` (longest common subsequence; past `max` lines, all old then all new). Text only. */
export function lineDiff(before: string, after: string, max = 200): DiffLine[] {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  if (a.length > max || b.length > max) return [...a.map((text) => ({ op: '-' as const, text })), ...b.map((text) => ({ op: '+' as const, text }))];
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) (dp[i] as number[])[j] = a[i] === b[j] ? (dp[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ op: ' ', text: a[i++] as string });
      j++;
    } else if (i < n && (j >= m || (dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0))) out.push({ op: '-', text: a[i++] as string });
    else out.push({ op: '+', text: b[j++] as string });
  }
  return out;
}

/** The first `lines` lines of `text` and how many more there are. */
export function excerpt(text: string, lines = 12): { head: string; more: number } {
  const all = text.replace(/\n+$/, '').split('\n');
  return { head: all.slice(0, lines).join('\n'), more: Math.max(0, all.length - lines) };
}

/** "3f2a…c91" (DESIGN §8.10). */
export const shortId = (id: string) => (id.length > 9 ? `${id.slice(0, 4)}…${id.slice(-3)}` : id);

/** Text split around redaction placeholders, so they can be marked "Redacted" (DM19). */
export function redactionParts(text: string): { text: string; redacted: boolean }[] {
  const out: { text: string; redacted: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(/\[(?:secret:[\w-]+|email|private)\]|~(?=\/)/g)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), redacted: false });
    out.push({ text: m[0], redacted: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), redacted: false });
  return out;
}

/** The raw records of a row (one per source line), from the steps that carry them. */
export function rawRecords(g: SessionGraph, r: Row): { file: string; line: number; text?: string }[] {
  const seen = new Set<string>();
  const out: { file: string; line: number; text?: string }[] = [];
  for (const id of r.ids) {
    const s = g.steps.find((x) => x.id === id);
    if (!s || seen.has(`${s.raw.file}\n${s.raw.line}`)) continue;
    seen.add(`${s.raw.file}\n${s.raw.line}`);
    const holder = g.steps.find((x) => x.rawText !== undefined && x.raw.file === s.raw.file && x.raw.line === s.raw.line);
    out.push({ file: s.raw.file, line: s.raw.line, ...(holder?.rawText !== undefined ? { text: holder.rawText } : {}) });
  }
  return out;
}

export type LinkMode = 'search' | 'hash';

/** The step id in `?step=` (website) or `#step=` (a local file). */
export function readStepLink(mode: LinkMode, loc: { search: string; hash: string }): string | undefined {
  const q = new URLSearchParams(mode === 'search' ? loc.search : loc.hash.replace(/^#/, ''));
  return q.get('step') || undefined;
}

/** `search + hash` with the step link written (or removed), other params kept. */
export function writeStepLink(mode: LinkMode, loc: { search: string; hash: string }, stepId: string | undefined): string {
  const q = new URLSearchParams(mode === 'search' ? loc.search : loc.hash.replace(/^#/, ''));
  if (stepId) q.set('step', stepId);
  else q.delete('step');
  const s = q.toString();
  return mode === 'search' ? `${s ? `?${s}` : ''}${loc.hash}` : `${loc.search}${s ? `#${s}` : ''}`;
}

/** What a selected item shows: its steps, which of them are evidence, and its heading. */
export interface Target {
  item: string;
  kind: 'episode' | 'pattern' | 'files';
  title: string;
  steps: string[];
  evidence: ReadonlySet<string>;
  episode?: Episode;
  trouble?: Trouble[];
  lane?: Lane;
}

const laneOf = (g: SessionGraph, id: string | undefined) => g.lanes.find((l) => l.id === id);
export const laneWord = (g: SessionGraph, l: Lane | undefined) => (!l || l.id === g.lanes[0]?.id ? 'main' : (l.agentType ?? l.name));

/** The selected map item: `ep:<id>` / `lep:<id>` (episodes), a blaze id (patterns), or `files`. */
export function targetOf(g: SessionGraph, L: GlanceLayout, item: string): Target | undefined {
  if (item === 'files') return { item, kind: 'files', title: `${g.outcome.files.length === 1 ? '1 file' : `${g.outcome.files.length} files`} changed`, steps: [], evidence: new Set() };
  const epId = /^l?ep:(.+)$/.exec(item)?.[1];
  if (epId) {
    const e = g.episodes.find((x) => x.id === epId);
    const lane = laneOf(g, e?.laneId);
    return e && { item, kind: 'episode', title: e.title, steps: e.stepIds, evidence: new Set(), episode: e, ...(lane ? { lane } : {}) };
  }
  const b = L.blazes.find((x) => x.id === item);
  if (!b) return undefined;
  const ids = new Set(b.trouble.flatMap((t) => t.stepIds));
  // A failed result is shown with its call (the command), so the call joins the list.
  const callOf = new Map(g.steps.filter((s) => s.kind === 'tool-call' && s.tool?.callId).map((s) => [s.tool?.callId, s.id]));
  const withCalls = new Set([...ids].flatMap((id) => {
    const s = g.steps.find((x) => x.id === id);
    const call = s?.kind === 'tool-result' ? callOf.get(s.tool?.callId) : undefined;
    return call ? [call, id] : [id];
  }));
  const seq = new Map(g.steps.map((s) => [s.id, s.seq]));
  const steps = [...withCalls].sort((x, y) => (seq.get(x) ?? 0) - (seq.get(y) ?? 0));
  const t = b.trouble[0] as Trouble;
  const lane = laneOf(g, g.steps.find((s) => s.id === steps[0])?.laneId);
  const episode = g.episodes.find((e) => e.id === b.episodeId);
  return { item, kind: 'pattern', title: b.trouble.length > 1 ? `${b.trouble.length} detected patterns` : t.summary, steps, evidence: ids, trouble: b.trouble, ...(lane ? { lane } : {}), ...(episode ? { episode } : {}) };
}

/** The map item that holds `stepId` (for deep links), and the lane item to expand when the step is in a side trail. */
export function itemForStep(g: SessionGraph, L: GlanceLayout, stepId: string): { item: string; lane?: string } | undefined {
  const s = g.steps.find((x) => x.id === stepId);
  if (!s) return undefined;
  const top = g.episodes.find((e) => e.laneId === s.laneId && !e.parentId && e.stepIds.includes(stepId)) ?? g.episodes.find((e) => e.laneId === s.laneId && e.stepIds.includes(stepId));
  if (!top) return undefined;
  if (s.laneId === g.lanes[0]?.id) return { item: `ep:${top.id}` };
  const lane = L.lanes.find((l) => l.id === `lane:${s.laneId}`);
  return { item: `lep:${top.id}`, ...(lane ? { lane: lane.id } : {}) };
}

/** The rule behind each pattern, in words (PLAN §5.11). */
export const RULE_WORDS: Record<Trouble['kind'], string> = {
  'error-streak': '2 or more failed results in a row',
  retry: 'the same tool call made again after a failure',
  revert: 'an edit or git command that undid an earlier change',
  rewind: 'a prompt edited or rewound to an earlier point',
  interrupt: 'the user interrupted or corrected the agent',
  churn: '4 or more edits to the same file in one episode',
};

/** "Detected pattern · error streak · resolved". */
export const patternLine = (t: Trouble[]) => (t.length === 1 && t[0] ? `Detected pattern · ${TROUBLE_WORD[t[0].kind]} · ${t[0].resolved ? 'resolved' : 'unresolved'}` : `Detected patterns · ${t.length}`);
