// Trouble patterns: six rules, each a "detected pattern" with evidence steps. Thresholds: ./constants.
import type { Edge, Episode, Step, Trouble } from '../types';
import { CHURN_MIN_EDITS, ERROR_STREAK_MIN, RETRY_WINDOW } from './constants';
import { type FileEvent, type Verification, countedPaths, relPath, resultsByCall } from './outcome';
import { commandKey } from './shell';

type Draft = Omit<Trouble, 'id' | 'label' | 'raw'>;
const ORDER: Trouble['kind'][] = ['error-streak', 'retry', 'revert', 'rewind', 'interrupt', 'churn'];
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "The same call": the normalized command for shell tools, else the tool name and its file or summary. */
export function callKey(call: Step | undefined): string {
  const t = call?.tool;
  if (!t) return '';
  return t.command ? `${t.name} ${commandKey(t.command)}` : `${t.name} ${t.files[0] ?? t.summary}`;
}

/** Run every rule. Returns the patterns (ordered by first evidence step) and the `retry-of` / `reverts` edges. */
export function findTrouble(steps: Step[], edges: Edge[], episodes: Episode[], history: FileEvent[], checks: Verification[], cwd?: string): { trouble: Trouble[]; edges: Edge[] } {
  const results = resultsByCall(steps);
  const callOf = new Map<string, Step>();
  for (const s of steps) if (s.kind === 'tool-call' && s.tool?.callId) callOf.set(s.tool.callId, s);
  const call = (result: Step) => (result.tool?.callId ? callOf.get(result.tool.callId) : undefined);
  const verifiedAfter = (seq: number) => checks.some((c) => c.ok && c.step.seq > seq);
  const lanes = new Map<string, Step[]>();
  const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => (m.get(k) ?? m.set(k, []).get(k))?.push(v);
  for (const s of steps) push(lanes, s.laneId, s);
  const found: Draft[] = [];
  const newEdges: Edge[] = [];

  for (const ls of lanes.values()) {
    // error-streak: ≥ ERROR_STREAK_MIN consecutive failed tool results; resolved when the last failed command later succeeds.
    const res = ls.filter((s) => s.kind === 'tool-result');
    for (let i = 0; i < res.length; ) {
      let j = i;
      while (res[j]?.status === 'error') j++;
      if (j - i >= ERROR_STREAK_MIN) {
        const failed = res.slice(i, j);
        const key = callKey(call(failed[failed.length - 1] as Step));
        const fix = res.slice(j).find((r) => r.status === 'ok' && callKey(call(r)) === key);
        const runs = failed.every((f) => f.tool?.category === 'run');
        const summary = `Error streak: ${failed.length} failed ${runs ? 'runs' : 'calls'}${fix ? ', then passed' : ''}`;
        found.push({ kind: 'error-streak', stepIds: [...failed, ...(fix ? [fix] : [])].map((s) => s.id), count: failed.length, resolved: !!fix, summary });
      }
      i = Math.max(j, i + 1);
    }

    // retry: the same call again within RETRY_WINDOW lane steps after a failure; chains count as one pattern.
    const pos = new Map(ls.map((s, i) => [s.id, i]));
    const seen = new Set<string>();
    for (const first of ls) {
      if (first.kind !== 'tool-call' || seen.has(first.id)) continue;
      const chain = [first];
      for (let c = first; ; ) {
        const r = c.tool?.callId ? results.get(c.tool.callId) : undefined;
        if (r?.status !== 'error') break;
        const at = pos.get(r.id) ?? 0;
        const again = ls.slice(at + 1, at + 1 + RETRY_WINDOW).find((s) => s.kind === 'tool-call' && callKey(s) === callKey(c));
        if (!again) break;
        newEdges.push({ from: c.id, to: again.id, kind: 'retry-of' });
        chain.push(again);
        seen.add(again.id);
        c = again;
      }
      if (chain.length < 2) continue;
      const last = chain[chain.length - 1] as Step;
      const ok = (last.tool?.callId ? results.get(last.tool.callId) : undefined)?.status === 'ok';
      const times = chain.length - 1 === 1 ? 'once' : `×${chain.length - 1}`;
      const summary = `Retried ${first.tool?.name ?? 'a call'} ${times}${ok ? ', then passed' : ''}`;
      found.push({ kind: 'retry', stepIds: chain.map((s) => s.id), count: chain.length - 1, resolved: ok, summary });
    }

    // interrupt: a user interruption (plus the user's next message), or a user message right after a failed result.
    let prev: Step | undefined;
    let lastUser = -1;
    for (let i = 0; i < ls.length; i++) {
      const s = ls[i] as Step;
      const failed = prev?.kind === 'tool-result' && prev.status === 'error' ? prev : undefined;
      const corrects = s.kind === 'user' && !!failed;
      if (s.kind !== 'thinking' && s.kind !== 'system') prev = s;
      if (s.status !== 'interrupted' && !corrects) {
        if (s.kind === 'user') lastUser = i;
        continue;
      }
      const evidence = corrects && failed ? [failed, s] : [s];
      if (!corrects) while (ls[i + 1]?.status === 'interrupted') evidence.push(ls[++i] as Step);
      const after = ls.slice(i + 1).find((n) => n.kind !== 'system' && n.kind !== 'thinking');
      if (!corrects && after?.kind === 'user') evidence.push(after);
      const calls = ls.slice(lastUser + 1, i).filter((p) => p.kind === 'tool-call').length;
      const resumed = ls.slice(i + 1).some((n) => n.kind === 'assistant' || n.kind === 'tool-call');
      const summary = corrects ? `User corrected course after a failed ${failed?.tool?.name ?? 'call'}` : `Interrupted after ${plural(calls, 'call')}`;
      found.push({ kind: 'interrupt', stepIds: evidence.map((e) => e.id), count: 1, resolved: resumed, summary });
      if (corrects) lastUser = i;
      else if (after?.kind === 'user') {
        i = ls.indexOf(after, i);
        prev = after;
        lastUser = i;
      }
    }
  }

  // revert: an Edit that restores an earlier edit's old text, or a git checkout/restore/reset of a touched file.
  const byStep = new Map<Step, FileEvent[]>();
  for (const e of history) if (e.type === 'revert' || e.restores) push(byStep, e.step, e);
  for (const [step, evs] of byStep) {
    const undone = evs.map((e) => e.restores ?? history.filter((h) => h.path === e.path && h.type !== 'revert' && h.step.seq < step.seq).pop()?.step);
    const prior = [...new Set(undone.filter((u): u is Step => !!u))].sort((a, b) => a.seq - b.seq);
    for (const p of prior) newEdges.push({ from: p.id, to: step.id, kind: 'reverts' });
    const what = evs[0]?.restores ? `edit of ${base(evs[0].path)}` : `${step.tool?.command ? commandKey(step.tool.command).split(' ').slice(0, 2).join(' ') : 'revert'} of ${plural(evs.length, 'file')}`;
    found.push({ kind: 'revert', stepIds: [...prior, step].map((s) => s.id), count: evs.length, resolved: verifiedAfter(step.seq), summary: `Revert: ${what}` });
  }

  // rewind: a fork in the record chain; the steps between the branch point and the new branch were abandoned.
  const bySeq = (id: string) => steps[Number(id.slice(1))] as Step;
  for (const e of edges.filter((x) => x.kind === 'forks')) {
    const from = bySeq(e.from);
    const to = bySeq(e.to);
    const abandoned = (lanes.get(from.laneId) ?? []).filter((s) => s.seq > from.seq && s.seq < to.seq);
    if (abandoned.length === 0) continue;
    found.push({ kind: 'rewind', stepIds: [...abandoned, to].map((s) => s.id), count: abandoned.length, resolved: true, summary: `Rewound: ${plural(abandoned.length, 'step')} abandoned` });
  }

  // churn: ≥ CHURN_MIN_EDITS changes to one file within one (fine-grained) episode.
  const parents = new Set(episodes.map((e) => e.parentId));
  const counted = countedPaths(history, cwd);
  for (const ep of episodes.filter((e) => !parents.has(e.id))) {
    const ids = new Set(ep.stepIds);
    const perFile = new Map<string, Step[]>();
    for (const h of history) if (h.type !== 'revert' && ids.has(h.step.id) && counted.has(h.path)) push(perFile, h.path, h.step);
    for (const [path, edits] of perFile) {
      if (edits.length < CHURN_MIN_EDITS) continue;
      const last = edits[edits.length - 1] as Step;
      const summary = `Churn: ${relPath(cwd, path)} edited ${edits.length}× in one episode`;
      found.push({ kind: 'churn', stepIds: edits.map((s) => s.id), count: edits.length, resolved: verifiedAfter(last.seq), summary });
    }
  }

  const first = (d: Draft) => Number(d.stepIds[0]?.slice(1) ?? 0);
  found.sort((a, b) => first(a) - first(b) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const trouble = found.map((d, i): Trouble => ({ id: `t${i}`, kind: d.kind, label: 'detected pattern', stepIds: d.stepIds, count: d.count, resolved: d.resolved, summary: d.summary, raw: { ...bySeq(d.stepIds[0] ?? 's0').raw } }));
  return { trouble, edges: newEdges };
}
