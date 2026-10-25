// What the session card says before the list (v7 §12, §13.2): the meta line under the title and the outcome box's rows
// and final answer. Pure derivations from a SessionGraph, so the website and (later) the local viewer say the same.
import type { SessionGraph } from '../../shared/session/types';
import { laneStatus } from '../map/layout';
import { SOURCE_LABEL, duration, times } from '../map/outline';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One piece of a line of text: plain, or code (set in mono). */
export interface Run { text: string; code?: boolean }

/** Inline `code` spans as code runs; `**bold**` markers are dropped. */
export function runs(text: string): Run[] {
  return text.replace(/\*\*/g, '').split('`').flatMap((t, i) => (t ? [i % 2 ? { text: t, code: true } : { text: t }] : []));
}

/** One item of the meta line: a bold number and its unit ("47 min" "total"), plain text, or code (the branch). */
export type MetaItem = { key: string; strong: string; rest: string } | { key: string; text: string; code?: boolean };

/** The meta line (§12): the agent, then wall time, subagents and tool calls (zero counts left out), then the branch. A
 * chat with a tag (its source, such as "Pasted chat") leaves out "Chat", which the tag already says. */
export function sessionMeta(g: SessionGraph, branch = g.source.gitBranch, tagged = false): MetaItem[] {
  const items: MetaItem[] = g.source.kind === 'chat' && tagged ? [] : [{ key: 'agent', text: SOURCE_LABEL[g.source.kind] }];
  const wall = g.stats.durationMs ?? times(g.steps)?.wall;
  if (wall !== undefined) items.push({ key: 'time', strong: duration(wall), rest: 'total' });
  const count = (key: string, n: number, one: string) => n > 0 && items.push({ key, strong: String(n), rest: plural(n, one).replace(/^\d+ /, '') });
  count('subagents', g.lanes.length - 1, 'subagent');
  count('calls', g.steps.filter((s) => s.kind === 'tool-call').length, 'tool call');
  if (branch) items.push({ key: 'branch', text: branch, code: true });
  return items;
}

/** A row of the outcome box: the status picks the icon (✓ blue, ⚠ orange, a file for changes), never colour alone. */
export interface OutcomeRow { key: 'check' | 'trouble' | 'files'; icon: 'ok' | 'alert' | 'files' | 'unknown'; lead: string; detail: Run[] }

/** Minutes from the session start to a step: "47 min". */
function at(g: SessionGraph, stepId: string): string | undefined {
  const t = g.steps.find((s) => s.id === stepId)?.t;
  const ms = t && g.source.startedAt ? Date.parse(t) - Date.parse(g.source.startedAt) : Number.NaN;
  return Number.isFinite(ms) ? duration(ms) : undefined;
}

/** How the check row names the subagent that ran it: "re-verify" for "Re-verify phase 12" (the title has the phase). */
const laneWord = (name: string) => name.replace(/\s+phase\s+\d+$/i, '').replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLowerCase());

/** A commit hash in a `git commit` (`[main cceb2d5] …`) or `git log --oneline` (`cceb2d5 …`) output. */
const HASH = /(?:^|\n)(?:\[[^\]\s]+ (?:\(root-commit\) )?([0-9a-f]{7,40})\]|([0-9a-f]{7,40}) )/;

/** The last commit made after the failed lanes ended and before the check that passed, when its hash was recorded. */
function fixCommit(g: SessionGraph, failedLanes: string[], passedAt: string): string | undefined {
  const seq = new Map(g.steps.map((s) => [s.id, s.seq]));
  const after = Math.max(...g.steps.filter((s) => failedLanes.includes(s.laneId)).map((s) => s.seq));
  const before = seq.get(passedAt) ?? -1;
  const calls = new Set(g.steps.filter((s) => s.kind === 'tool-call' && /\bgit commit\b/.test(s.tool?.command ?? '')).map((s) => s.tool?.callId));
  let hash: string | undefined;
  for (const r of g.steps) {
    if (r.kind !== 'tool-result' || r.status !== 'ok' || r.seq <= after || r.seq >= before || !calls.has(r.tool?.callId)) continue;
    const m = HASH.exec(r.text ?? '');
    if (m) hash = m[1] ?? m[2];
  }
  return hash;
}

/** The outcome box (§4.5): the final check, the trouble and the files changed. A chat runs no checks and changes no
 * files, so it keeps only the rows that say something: its trouble, if any (rule 2). */
export function outcomeRows(g: SessionGraph): OutcomeRow[] {
  if (g.source.kind === 'chat') return agentOutcome(g).filter((r) => r.key === 'trouble' && r.icon === 'alert');
  return agentOutcome(g);
}

function agentOutcome(g: SessionGraph): OutcomeRow[] {
  const rows: OutcomeRow[] = [];
  const main = g.lanes[0]?.id;
  const v = g.outcome.lastVerification;
  if (v) {
    const lane = g.lanes.find((l) => l.id === g.steps.find((s) => s.id === v.stepId)?.laneId);
    const when = at(g, v.stepId);
    rows.push({
      key: 'check',
      icon: v.ok ? 'ok' : 'alert',
      lead: `${v.ok ? 'Passed' : 'Failed'}${lane && lane.id !== main ? ` on ${laneWord(lane.name)}` : ''}`,
      detail: [{ text: v.command, code: true }, { text: ` ${v.ok ? 'passed' : 'failed'}${when ? ` at ${when}` : ''}` }],
    });
  } else rows.push({ key: 'check', icon: 'unknown', lead: 'No check run found', detail: [{ text: 'No test, build, lint or typecheck run' }] });

  const failed = g.lanes.filter((l) => l.id !== main).map((l) => ({ l, s: laneStatus(g, l) })).filter((x) => x.s.status === 'error');
  if (g.trouble.length > 0) {
    const resolved = g.trouble.filter((t) => t.resolved).length;
    rows.push({ key: 'trouble', icon: 'alert', lead: plural(g.trouble.length, 'trouble spot'), detail: [{ text: `${resolved} resolved` }] });
  } else if (failed.length > 0) {
    const said = failed.map((x) => `${x.l.name} ${x.s.word === 'changes requested' ? 'asked for changes' : 'failed'}`).join(', ');
    const fix = v?.ok ? fixCommit(g, failed.map((x) => x.l.id), v.stepId) : undefined;
    rows.push({ key: 'trouble', icon: 'alert', lead: plural(failed.length, 'failed review'), detail: fix ? [{ text: `${said}, fixed in ` }, { text: fix, code: true }] : [{ text: said }] });
  } else rows.push({ key: 'trouble', icon: 'ok', lead: 'No trouble detected', detail: [] });

  const files = g.outcome.files;
  const first = files[0];
  rows.push({
    key: 'files',
    icon: 'files',
    lead: `${plural(files.length, 'file')} changed`,
    detail: !first ? [] : files.length === 1 ? [{ text: first.path, code: true }, { text: `, ${plural(first.edits, 'edit')}` }] : [{ text: first.path, code: true }, { text: ` and ${files.length - 1} more` }],
  });
  return rows;
}

/** The final answer: the recorded answer step, else the session's last report. `excerpt` is its opening paragraphs, up
 * to the first table, list, heading or code block, joined as sentences. */
export function finalAnswer(g: SessionGraph): { full: string; excerpt: string } | undefined {
  const byId = g.outcome.answerStepId ? g.steps.find((s) => s.id === g.outcome.answerStepId) : undefined;
  const step = byId?.text ? byId : [...g.steps].reverse().find((s) => s.kind === 'assistant' && s.text?.trim());
  const full = step?.text?.trim();
  if (!full) return undefined;
  const paras: string[] = [];
  for (const p of full.split(/\n\s*\n/)) {
    if (/^\s*(\||#|```|[-*] |\d+\. )/.test(p)) break;
    paras.push(p.replace(/\s*\n\s*/g, ' ').trim());
  }
  const excerpt = paras.map((p) => (/[.!?:]$/.test(p) ? p : `${p}.`)).join(' ') || full;
  return { full, excerpt };
}
