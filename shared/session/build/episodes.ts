// Episodes (PLAN §5.11): deterministic segments of one lane's steps, at most MAX_TOP_EPISODES top-level ones per lane.
import type { Episode, Lane, Step } from '../types';
import { FILE_SPLIT_STEPS, KIND_WINDOW, MAX_EPISODE_STEPS, MAX_TOP_EPISODES, MIN_EPISODE_STEPS } from './constants';
import { relPath } from './outcome';
import { isVerification, shellEffects, shellReads, verifyNouns } from './shell';

type Kind = Episode['kind'];
type Work = 'explore' | 'change' | 'verify' | 'delegate';
interface Draft {
  kind: Kind;
  steps: Step[];
  title: string;
}

/** What a tool call does for episode purposes; `undefined` for steps that are not tool calls, plans and unknown tools. */
export function workKind(step: Step, cwd?: string): Work | undefined {
  const t = step.tool;
  if (step.kind !== 'tool-call' || !t) return undefined;
  if (t.category === 'read' || t.category === 'search' || t.category === 'web') return 'explore';
  if (t.category === 'edit' || t.category === 'write') return 'change';
  if (t.category === 'agent') return 'delegate';
  if (t.category !== 'run' || !t.command) return undefined;
  const fx = shellEffects(t.command, cwd);
  if (fx.writes.length + fx.deletes.length + fx.reverts.length > 0 || fx.revertAll) return 'change';
  return isVerification(t.command) || /^\s*(cd \S+ && )?(git|gh)\s/.test(t.command) ? 'verify' : 'explore';
}

function mostCommon(values: string[]): [string, number] | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: [string, number] | undefined;
  for (const [v, n] of counts) if (!best || n > best[1]) best = [v, n];
  return best;
}

const clip = (s: string, max = 80) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;
/** Distinct values, most frequent first (ties keep first appearance). */
const ranked = (values: string[]) => {
  const n = new Map<string, number>();
  for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.keys()].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0));
};
const more = (list: string[]) => (list.length > 1 ? ` +${list.length - 1} more` : '');
/** "a", "a and b", "a, b and c". */
const series = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
/** Markdown emphasis and code marks dropped: titles are plain text. */
export const plainText = (s: string) => s.replace(/\*\*|__|`/g, '').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const GIT: Record<string, string> = { commit: 'commit', push: 'push', status: 'review changes', diff: 'review changes', log: 'review history', show: 'review history', add: 'stage files' };

/** What a verify episode did: the checks by name ("Run tests", "Typecheck", "Run lint and typecheck"), else git/gh work. */
function verifyTitle(calls: Step[]): string {
  const runs = calls.map((s) => (s.tool?.command ? verifyNouns(s.tool.command) : [])).filter((n) => n.length > 0);
  const kinds = [...new Set(runs.flat())];
  if (kinds.length === 1) {
    const one = { tests: 'Run tests', lint: 'Lint', typecheck: 'Typecheck', build: 'Build' }[kinds[0] as string] ?? `Run ${kinds[0]}`;
    return runs.length > 1 ? `${one} ×${runs.length}` : one;
  }
  if (kinds.length > 1) return `Run ${series(kinds.slice(0, 3))}${kinds.length > 3 ? ` +${kinds.length - 3} more` : ''}`;
  const git = calls.flatMap((s) => {
    const words = (s.tool?.command ?? '').replace(/^\s*cd \S+ && /, '').trim().split(/\s+/);
    if (words[0] === 'gh') return [words[1] === 'pr' ? (words[2] === 'create' ? 'open the PR' : 'update the PR') : `gh ${words[1] ?? ''}`.trim()];
    const sub = words[0] === 'git' ? words.slice(1).find((w) => !w.startsWith('-')) : undefined;
    return sub ? [GIT[sub] ?? `git ${sub}`] : [];
  });
  return git.length > 0 ? cap(series([...new Set(git)].slice(0, 3))) : 'Verify';
}

/**
 * Deterministic episode titles for the glance (DESIGN §8.2): the user's words for user turns, the files read or edited
 * (basename + "+n more"), checks by name, the delegated task. Never a generic interpreter or pager ("sed", "python3").
 */
function title(kind: Kind, steps: Step[], cwd: string | undefined): string {
  if (kind === 'answer') return 'Answer';
  if (kind === 'discuss') return clip(plainText(steps[0]?.text?.trim().split('\n', 1)[0] ?? '') || 'User turn');
  const calls = steps.filter((s) => workKind(s, cwd) === kind);
  if (kind === 'delegate') {
    const tasks = ranked(calls.map((s) => (s.tool ? s.tool.summary.slice(s.tool.name.length + 1) || s.tool.name : 'subagent')));
    return clip(`Delegate: ${clip(tasks[0] ?? 'subagent', 60)}${more(tasks)}`);
  }
  if (kind === 'verify') return verifyTitle(calls);
  if (kind === 'change') {
    const files = ranked(calls.flatMap((s) => {
      const t = s.tool;
      const fx = t?.command ? shellEffects(t.command, cwd) : undefined;
      return fx ? [...fx.writes, ...fx.deletes, ...fx.reverts] : (t?.files ?? []);
    }).map((f) => relPath(cwd, f)));
    return files[0] ? clip(`Edit ${base(files[0])}`) + more(files) : 'Edit files';
  }
  const files: string[] = [];
  const patterns: string[] = [];
  let web = false;
  for (const s of calls) {
    const t = s.tool;
    if (!t) continue;
    if (t.category === 'read') files.push(...t.files);
    else if (t.category === 'search') patterns.push(t.summary.slice(t.name.length + 1) || t.name);
    else if (t.category === 'web') web = true;
    else if (t.command) {
      const r = shellReads(t.command, cwd);
      files.push(...r.files);
      patterns.push(...r.patterns);
    }
  }
  const read = ranked(files.map((f) => relPath(cwd, f)));
  if (read[0]) return clip(`Read ${base(read[0])}`) + more(read);
  const sought = ranked(patterns);
  if (sought[0]) return `Search “${clip(sought[0], 32)}”${more(sought)}`;
  return web ? 'Search the web' : 'Explore';
}

/** Split one lane's steps into fine-grained episodes. `chat`: no separate answer episode (each turn ends in a reply). */
function splitLane(ls: Step[], cwd: string | undefined, chat: boolean): Draft[] {
  const kinds = ls.map((s) => workKind(s, cwd));
  let lastWork = -1;
  ls.forEach((s, i) => {
    if (s.kind === 'tool-call' || s.kind === 'tool-result' || s.kind === 'user') lastWork = i;
  });
  const answerAt = chat ? -1 : ls.findIndex((s, i) => i > lastWork && s.kind === 'assistant');
  /** The majority work kind of the next KIND_WINDOW tool calls from `i`, up to the next user turn. */
  const dominant = (i: number): Work | undefined => {
    const window: Work[] = [];
    for (let j = i; j < ls.length && window.length < KIND_WINDOW && ls[j]?.kind !== 'user' && j !== answerAt; j++) {
      const k = kinds[j];
      if (k) window.push(k);
    }
    const [k, n = 0] = mostCommon(window) ?? [];
    return n * 2 > KIND_WINDOW ? (k as Work) : undefined;
  };

  const out: { kind: Kind | undefined; start: number }[] = [];
  let running: Kind | undefined;
  let lastFile: string | undefined;
  // Subagents spawned in the current delegate episode, and those not yet returned: a spawn after all have returned
  // starts a new episode (one per sequential delegation); parallel spawns share one.
  let spawned = 0;
  const open = new Set<string | undefined>();
  ls.forEach((s, i) => {
    const k = kinds[i];
    if (s.kind === 'tool-result') open.delete(s.tool?.callId);
    const cur = out[out.length - 1];
    const size = cur ? i - cur.start : 0;
    const file = s.kind === 'tool-call' ? s.tool?.files[0] : undefined;
    let next: { kind: Kind | undefined; pull: boolean } | undefined;
    if (!cur) next = { kind: s.kind === 'user' ? 'discuss' : k, pull: false };
    else if (i === answerAt) next = { kind: 'answer', pull: false };
    else if (s.kind === 'user') next = { kind: 'discuss', pull: false };
    else if (size >= MAX_EPISODE_STEPS) next = { kind: k, pull: false };
    else if (k === 'delegate' && (running !== 'delegate' || (spawned > 0 && open.size === 0))) next = { kind: 'delegate', pull: true };
    else if (s.kind === 'tool-call' && running === 'delegate' && k !== 'delegate') next = { kind: k, pull: true };
    else if (k && k !== running && size >= MIN_EPISODE_STEPS && dominant(i) === k) next = { kind: k, pull: true };
    else if (s.kind === 'tool-call' && size >= FILE_SPLIT_STEPS && file && lastFile && file !== lastFile) next = { kind: k, pull: true };
    if (next) {
      let start = i;
      const floor = next.pull && running !== 'discuss' && cur ? cur.start + 1 : i;
      while (start > floor && (ls[start - 1]?.kind === 'assistant' || ls[start - 1]?.kind === 'thinking')) start--;
      out.push({ kind: next.kind, start });
      running = next.kind;
      spawned = 0;
    }
    if (k === 'delegate') {
      spawned++;
      open.add(s.tool?.callId);
    }
    running ??= k;
    if (file) lastFile = file;
  });

  const drafts: Draft[] = [];
  out.forEach((seg, n) => {
    const steps = ls.slice(seg.start, out[n + 1]?.start ?? ls.length);
    let kind: Kind | undefined = seg.kind === 'discuss' || seg.kind === 'answer' || seg.kind === 'delegate' ? seg.kind : undefined;
    kind ??= mostCommon(steps.map((s) => workKind(s, cwd)).filter((k): k is Work => !!k && k !== 'delegate'))?.[0] as Kind | undefined;
    const prev = drafts[drafts.length - 1];
    if (!kind && prev) prev.steps.push(...steps);
    else drafts.push({ kind: kind ?? 'discuss', steps, title: '' });
  });
  for (const d of drafts) d.title = title(d.kind, d.steps, cwd);
  return drafts;
}

/** Cut points that split `drafts` into `groups` runs of similar size, preferring cuts before user turns. */
function cuts(drafts: Draft[], groups: number): number[] {
  const cum = [0];
  for (const d of drafts) cum.push((cum[cum.length - 1] ?? 0) + d.steps.length);
  const total = cum[cum.length - 1] ?? 0;
  const out: number[] = [];
  let prev = 0;
  for (let g = 1; g < groups; g++) {
    let best = prev + 1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = prev + 1; i <= drafts.length - (groups - g); i++) {
      const score = Math.abs((cum[i] ?? 0) - (total * g) / groups) + (drafts[i]?.kind === 'discuss' ? 0 : total / (2 * groups));
      if (score < bestScore) [best, bestScore] = [i, score];
    }
    out.push(best);
    prev = best;
  }
  return out;
}

/** Episodes for every lane: top-level ones (≤ MAX_TOP_EPISODES per lane), each followed by its children when grouped.
 * `chat`: a chat's last reply stays in its turn; the route's terminus marks it. */
export function buildEpisodes(steps: Step[], lanes: Lane[], cwd?: string, chat = false): Episode[] {
  const out: Episode[] = [];
  const emit = (d: Draft, laneId: string, parentId?: string): Episode => {
    const e: Episode = { id: `e${out.length}`, title: d.title, kind: d.kind, stepIds: d.steps.map((s) => s.id), laneId };
    if (parentId) e.parentId = parentId;
    out.push(e);
    return e;
  };
  for (const lane of lanes) {
    const drafts = splitLane(steps.filter((s) => s.laneId === lane.id), cwd, chat);
    if (drafts.length <= MAX_TOP_EPISODES) {
      for (const d of drafts) emit(d, lane.id);
      continue;
    }
    const answer = drafts[drafts.length - 1]?.kind === 'answer' ? drafts.pop() : undefined;
    const groups = MAX_TOP_EPISODES - (answer ? 1 : 0);
    const bounds = [0, ...cuts(drafts, groups), drafts.length];
    for (let g = 0; g < groups; g++) {
      const members = drafts.slice(bounds[g], bounds[g + 1]);
      const first = members[0] as Draft;
      const parent = emit({ kind: first.kind, title: first.title, steps: members.flatMap((m) => m.steps) }, lane.id);
      if (members.length > 1) for (const m of members) emit(m, lane.id, parent.id);
    }
    if (answer) emit(answer, lane.id);
  }
  return out;
}
