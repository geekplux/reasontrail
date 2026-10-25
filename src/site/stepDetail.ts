// A selected step (docs/design/v7/PROMPT.md §4.5, §5.4; docs/design/v7/preview/Step.html), pure: which steps can be
// selected (the list's step rows, in list order across episodes), and everything the detail panel and the tree's
// callout show for one, from the session's data only.
import type { SessionGraph } from '../../shared/session/types';
import { excerpt, lineDiff, rowStatus, stepRows, textHead, type Row } from '../map/details';
import { episodeSteps, listRows, type EpisodeRow, type StepRow } from '../map/gitlist/rows';
import { isUnstoredThinking } from '../map/outline';

/** A step row with the episode row it is listed under and its lane's name. */
export interface Selectable { step: StepRow; episode: EpisodeRow; lane: string }

const memo = new WeakMap<SessionGraph, Selectable[]>();
/** Every step the list can select (tool calls and thinking under an episode row), in list order. */
export function selectableSteps(g: SessionGraph): Selectable[] {
  const hit = memo.get(g);
  if (hit) return hit;
  const rows = listRows(g);
  const lanes = new Map(rows.flatMap((r) => (r.kind === 'lane' ? [[r.laneId, r.name] as const] : [])));
  const out = rows.flatMap((r) => (r.kind === 'episode' && !r.leaf ? episodeSteps(g, r.episodeId).map((step) => ({ step, episode: r, lane: lanes.get(r.laneId) ?? '' })) : []));
  memo.set(g, out);
  return out;
}

/** The selectable step `stepId`, or undefined for an id the list does not show (an unknown or invalid link). */
export const findStep = (g: SessionGraph, stepId: string | null | undefined) => (stepId ? selectableSteps(g).find((s) => s.step.stepId === stepId) : undefined);

export type StepTone = 'fail' | 'ok' | undefined;
export interface StepOutput { note: string; text?: string }
export interface StepDetail {
  stepId: string;
  episodeId: string;
  /** "Verify phase 12, episode 6, step 1 of 28". */
  where: string;
  /** "Command failed", "Command", "Read", "Thinking"… */
  title: string;
  tone: StepTone;
  at: string;
  summary: string;
  /** The command (`$ …`), path, pattern or diff, shown in a `pre`. */
  code?: string;
  /** Thinking or other text, shown as a paragraph. */
  text?: string;
  output?: StepOutput;
  next?: { stepId: string; summary: string; at: string; tone: StepTone; output?: string };
  source: { file: string; line: number };
  prevId?: string;
  nextId?: string;
}

const NOUN: Record<string, string> = { run: 'Command', read: 'Read', search: 'Search', edit: 'Edit', write: 'Write', web: 'Web', agent: 'Subagent', plan: 'Plan', other: 'Tool call' };
const rowOf = (g: SessionGraph, s: Selectable): Row | undefined => {
  const e = g.episodes.find((x) => x.id === s.episode.episodeId);
  return e ? stepRows(g, e.stepIds).find((r) => r.id === s.step.stepId) : undefined;
};
const toneOf = (r: Row): StepTone => (r.step.kind !== 'tool-call' ? undefined : rowStatus(r) === 'error' ? 'fail' : rowStatus(r) === 'ok' ? 'ok' : undefined);
/** The result text without its leading "Exit code N" line. */
const body = (r: Row) => (r.result?.text ?? '').replace(/^Exit code \d+\s*\n?/, '').replace(/\s+$/, '');
const exit = (r: Row) => /^Exit code (\d+)/.exec(r.result?.text ?? '')?.[1] ?? (r.step.tool?.category === 'run' && rowStatus(r) === 'ok' ? '0' : undefined);
const cut = (text: string, lines: number) => {
  const ex = excerpt(text, lines);
  return ex.more > 0 ? `${ex.head}\n…` : ex.head;
};

/** "Exit code 2" (or "Failed") and the time: the callout's second line. */
export function stepFacts(g: SessionGraph, s: Selectable): string {
  const r = rowOf(g, s);
  const code = r && exit(r);
  return [code !== undefined ? `Exit code ${code}` : r && toneOf(r) === 'fail' ? 'Failed' : '', s.step.at].filter(Boolean).join(', ');
}

function output(r: Row): StepOutput | undefined {
  if (r.step.kind !== 'tool-call') return undefined;
  if (!r.result) return { note: 'No result recorded' };
  const code = exit(r);
  const text = body(r);
  const note = [code !== undefined ? `Exit code ${code}` : rowStatus(r) === 'error' ? 'Failed' : '', text ? '' : 'no output'].filter(Boolean).join(', ');
  return { note: note.charAt(0).toUpperCase() + note.slice(1), ...(text ? { text: cut(text, 12) } : {}) };
}

function codeOf(r: Row): string | undefined {
  const t = r.step.tool;
  if (r.step.kind !== 'tool-call' || !t) return undefined;
  if (t.command) return `$ ${t.command}`;
  if (t.edit) {
    const diff = lineDiff(t.edit.before, t.edit.after).filter((l) => l.op !== ' ').map((l) => `${l.op === '-' ? '−' : '+'} ${l.text}`);
    return [t.files[0] ?? '', cut(diff.join('\n'), 12)].filter(Boolean).join('\n');
  }
  if (t.pattern) return t.files[0] ? `${t.pattern}\n${t.files[0]}` : t.pattern;
  return t.files[0];
}

/** What the detail panel shows for `stepId`; undefined when the list cannot select it. */
export function stepDetail(g: SessionGraph, stepId: string): StepDetail | undefined {
  const all = selectableSteps(g);
  const i = all.findIndex((s) => s.step.stepId === stepId);
  const s = all[i];
  const r = s && rowOf(g, s);
  if (!s || !r) return undefined;
  const e = g.episodes.find((x) => x.id === s.episode.episodeId);
  const tone = toneOf(r);
  const noun = r.step.kind === 'thinking' ? 'Thinking' : (NOUN[r.step.tool?.category ?? 'other'] ?? 'Tool call');
  const d: StepDetail = {
    stepId,
    episodeId: s.episode.episodeId,
    where: `${s.lane}, episode ${s.episode.n}, step ${(e?.stepIds.indexOf(stepId) ?? 0) + 1} of ${s.episode.steps}`,
    title: tone === 'fail' ? `${noun} failed` : noun,
    tone,
    at: s.step.at,
    summary: s.step.label,
    source: { file: r.step.raw.file.split('/').pop() ?? r.step.raw.file, line: r.step.raw.line },
  };
  const c = codeOf(r);
  if (c) d.code = c;
  if (r.step.kind === 'thinking') d.text = isUnstoredThinking(r.step) ? 'Only a signature was recorded, so no text is shown.' : textHead(r.step.text ?? '', 8, 600).head;
  const out = output(r);
  if (out) d.output = out;
  // Previous / Next stay within the episode (Step.html greys Previous on an episode's first step).
  const same = (o: Selectable | undefined) => (o && o.episode.episodeId === s.episode.episodeId ? o : undefined);
  const prev = same(all[i - 1]);
  const next = same(all[i + 1]);
  if (prev) d.prevId = prev.step.stepId;
  if (next) {
    d.nextId = next.step.stepId;
    const nr = rowOf(g, next);
    const text = nr ? body(nr) : '';
    d.next = { stepId: next.step.stepId, summary: next.step.label, at: next.step.at, tone: nr && toneOf(nr), ...(text ? { output: cut(text, 4) } : {}) };
  }
  return d;
}
