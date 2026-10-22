// Trouble in chats (PLAN phase 23, DESIGN §13.8): only `interrupt` patterns, each a "detected pattern" found by rule:
// an answer regenerated or a prompt edited and sent again (a fork in the message chain), and a user correction right
// after a reply ("no", "that's wrong", "actually…"). The coding rules (error streaks, retries, reverts, churn) do not apply.
import type { Edge, Step, Trouble } from '../types';

/** The start of a reply that pushes back on the previous answer. */
export const CORRECTION = /^\s*(?:no\b|nope\b|wrong\b|incorrect\b|not quite\b|not what i\b|actually\b|wait\b|that'?s (?:wrong|not|incorrect)|that is (?:wrong|not|incorrect)|this is (?:wrong|not)|you(?:'re| are) wrong|it (?:doesn'?t|does not|still) |still (?:wrong|not|broken)|i (?:said|meant|asked)\b)/i;

const clip = (s: string, max = 48) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** The chat patterns, ordered by their first evidence step. */
export function chatTrouble(steps: Step[], edges: Edge[]): Trouble[] {
  const found: Omit<Trouble, 'id' | 'label' | 'raw'>[] = [];
  const answeredAfter = (seq: number) => steps.some((s) => s.seq > seq && s.kind === 'assistant');
  // Forks from one step: every later version replaced the one before it; the steps in between were set aside.
  const forks = new Map<string, string[]>();
  for (const e of edges) if (e.kind === 'forks') (forks.get(e.from) ?? forks.set(e.from, []).get(e.from))?.push(e.to);
  for (const [from, tos] of forks) {
    const start = Number(from.slice(1));
    // The fork's target is the new version's first step (thinking, for an answer that thought first).
    const to = steps[Number((tos[tos.length - 1] as string).slice(1))] as Step;
    const kind = to.kind === 'user' ? 'user' : 'assistant';
    const last = steps.find((s) => s.seq >= to.seq && s.kind === kind) ?? to;
    const evidence = steps.filter((s) => s.seq > start && s.seq <= last.seq && s.kind === kind);
    const versions = tos.length + 1;
    const summary = kind === 'user' ? `Prompt edited and sent again (${versions} versions)` : `Answer regenerated (${versions} versions)`;
    found.push({ kind: 'interrupt', stepIds: evidence.map((s) => s.id), count: tos.length, resolved: last.kind === 'assistant' || answeredAfter(last.seq), summary });
  }
  let prev: Step | undefined;
  for (const s of steps) {
    if (s.kind === 'user' && prev?.kind === 'assistant' && CORRECTION.test(s.text ?? '')) {
      const words = (s.text ?? '').trim().split('\n', 1)[0] ?? '';
      found.push({ kind: 'interrupt', stepIds: [prev.id, s.id], count: 1, resolved: answeredAfter(s.seq), summary: `User correction: “${clip(words)}”` });
    }
    if (s.kind !== 'thinking' && s.kind !== 'system') prev = s;
  }
  const first = (d: { stepIds: string[] }) => Number(d.stepIds[0]?.slice(1) ?? 0);
  found.sort((a, b) => first(a) - first(b));
  return found.map((d, i) => ({ id: `t${i}`, label: 'detected pattern', ...d, raw: { ...(steps[first(d)] as Step).raw } }));
}
