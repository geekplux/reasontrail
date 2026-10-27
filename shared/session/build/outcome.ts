// File history (Edit/Write tools and shell writes) and the session outcome.
import type { Outcome, Step } from '../types';
import { isVerification, resolvePath, shellEffects, verifyCommand } from './shell';

/** One change to a file, in step order. `revert` puts the file back; `restores` names the edit step an Edit undid. */
export interface FileEvent {
  path: string;
  step: Step;
  type: 'write' | 'delete' | 'revert';
  created?: boolean;
  /** A recursive delete of a path with no extension: most likely a folder, never a file changed on its own. */
  folder?: boolean;
  restores?: Step;
}

/** A verification run (tests, build, lint, typecheck) and whether its result was ok. */
export interface Verification {
  step: Step;
  ok: boolean;
}

/** Results by the call id they answer. */
export function resultsByCall(steps: Step[]): Map<string, Step> {
  const out = new Map<string, Step>();
  for (const s of steps) if (s.kind === 'tool-result' && s.tool?.callId) out.set(s.tool.callId, s);
  return out;
}

const resultOf = (results: Map<string, Step>, call: Step) => (call.tool?.callId ? results.get(call.tool.callId) : undefined);

/** Scratch paths that are never a session's outcome: `/tmp` outside the project, and `node_modules`. */
export const isScratch = (path: string, cwd?: string) => (path.startsWith('/tmp/') && !(cwd && path.startsWith(`${cwd}/`))) || /(^|\/)node_modules(\/|$)/.test(path);

/** Build output and scratch directories, relative or absolute, that never count as files changed (`.tmp/`, `tmp/`, `/tmp`, `node_modules/`, `dist/`, `.wrangler/`). */
export const isScratchOutput = (path: string) => /(^|\/)(\.tmp|tmp|node_modules|dist|\.wrangler)(\/|$)/.test(path);

/** Every file change in the session, from Edit/Write tools and from shell commands (best effort). Scratch paths are skipped. */
export function fileHistory(steps: Step[], cwd?: string): FileEvent[] {
  const results = resultsByCall(steps);
  const events: FileEvent[] = [];
  const edits = new Map<string, Step[]>();
  const touched: string[] = [];
  const add = (e: FileEvent) => {
    if (isScratch(e.path, cwd)) return;
    if (e.type !== 'revert' && !touched.includes(e.path)) touched.push(e.path);
    events.push(e);
  };
  for (const step of steps) {
    const t = step.tool;
    if (step.kind !== 'tool-call' || !t) continue;
    const res = resultOf(results, step);
    if (res?.status === 'error') continue;
    if ((t.category === 'edit' || t.category === 'write') && t.files[0]) {
      const path = resolvePath(cwd, t.files[0]);
      const prior = edits.get(path) ?? [];
      const restores = t.editHash ? prior.find((p) => p.tool?.editHash?.before === t.editHash?.after) : undefined;
      const e: FileEvent = { path, step, type: 'write' };
      if (t.category === 'write' && res?.text?.startsWith('File created')) e.created = true;
      if (restores) e.restores = restores;
      add(e);
      edits.set(path, [...prior, step]);
    } else if (t.category === 'run' && t.command) {
      const fx = shellEffects(t.command, cwd);
      for (const path of fx.writes) add({ path, step, type: 'write' });
      for (const path of fx.deletes) add({ path, step, type: 'delete', ...(fx.dirs.includes(path) ? { folder: true } : {}) });
      const back = fx.revertAll ? [...touched] : touched.filter((p) => fx.reverts.some((r) => p === r || p.endsWith(`/${r}`)));
      for (const path of back) add({ path, step, type: 'revert' });
    }
  }
  return events;
}

/** Verification runs in step order. */
export function verifications(steps: Step[]): Verification[] {
  const results = resultsByCall(steps);
  return steps
    .filter((s) => s.kind === 'tool-call' && s.tool?.category === 'run' && s.tool.command && isVerification(s.tool.command))
    .map((step) => ({ step, ok: resultOf(results, step)?.status === 'ok' }));
}

/** `p` relative to `cwd` when inside it. */
export function relPath(cwd: string | undefined, p: string): string {
  return cwd && p.startsWith(`${cwd}/`) ? p.slice(cwd.length + 1) : p;
}

/** The files a session's outcome and its trouble count: everything in the history except scratch or build output (see
 * `isScratchOutput`), files created or freshly written by the session and then deleted (scratch files), and folders
 * (paths only ever removed by a recursive `rm`). */
export function countedPaths(history: FileEvent[], cwd?: string): Set<string> {
  const seen = new Map<string, { fresh: boolean; created: boolean; last: FileEvent['type']; folder: boolean }>();
  for (const e of history) {
    if (isScratchOutput(relPath(cwd, e.path))) continue;
    // `fresh`: first written by a non-Edit tool (Edit needs an existing file).
    const f = seen.get(e.path) ?? { fresh: e.type === 'write' && e.step.tool?.category !== 'edit', created: false, last: e.type, folder: true };
    if (e.created && !seen.has(e.path)) f.created = true;
    if (!e.folder) f.folder = false;
    f.last = e.type;
    seen.set(e.path, f);
  }
  return new Set([...seen].filter(([, f]) => !f.folder && !((f.fresh || f.created) && f.last === 'delete')).map(([path]) => path));
}

/** Files changed (minus net-reverted files and the paths `countedPaths` drops), the last verification and the answer step. */
export function buildOutcome(steps: Step[], history: FileEvent[], checks: Verification[], mainLane: string, cwd?: string): Outcome {
  const counted = countedPaths(history, cwd);
  const files = new Map<string, { edits: number; live: number; created: boolean; reverted: boolean }>();
  for (const e of history) {
    if (!counted.has(e.path)) continue;
    const f = files.get(e.path) ?? { edits: 0, live: 0, created: false, reverted: false };
    if (e.type === 'revert') f.live = 0;
    else if (e.restores) f.live = Math.max(0, f.live - 1);
    else f.live++;
    if (e.type === 'revert' || e.restores) f.reverted = true;
    if (e.type !== 'revert') f.edits++;
    if (e.created && f.edits === 1) f.created = true;
    files.set(e.path, f);
  }
  const netReverted = [...files].filter(([, f]) => f.reverted && f.live === 0).map(([path]) => path);
  const outcome: Outcome = {
    files: [...files]
      .filter(([path]) => !netReverted.includes(path))
      .map(([path, f]) => ({ path: relPath(cwd, path), edits: f.edits, created: f.created }))
      .sort((a, b) => b.edits - a.edits || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  if (netReverted.length > 0) outcome.revertedFiles = netReverted.length;
  const last = checks[checks.length - 1];
  if (last) outcome.lastVerification = { stepId: last.step.id, command: verifyCommand(last.step.tool?.command ?? '').slice(0, 200), ok: last.ok };
  // The answer: the last main-lane assistant text, unless the main lane made a tool call after it (then none was recorded).
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i] as Step;
    if (s.laneId !== mainLane) continue;
    if (s.kind === 'tool-call') break;
    if (s.kind === 'assistant' && s.text) {
      outcome.answerStepId = s.id;
      break;
    }
  }
  return outcome;
}
