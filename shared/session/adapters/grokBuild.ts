// Grok Build sessions (PLAN §5.12, D30): ~/.grok/sessions/<url-encoded cwd>/<id>/updates.jsonl, an ACP
// `session/update` stream, plus summary.json (title, model) and subagents/<child id>/meta.json. Child sessions are
// read from subagents/<child id>/updates.jsonl or from <child id>/updates.jsonl next to the parent.
// No published stability guarantee (checked against Grok Build 1.0.34): unknown updates are counted, never fatal.
import type { SessionAdapter } from '../adapter';
import { countSkipped, readJsonl } from '../jsonl';
import type { NormalizedItem, NormalizedLane, NormalizedRecord, NormalizedSession, SessionInput, SourceFile, StepStatus } from '../types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Updates that never become steps (counted as ignored). */
const IGNORED = new Set([
  'turn_completed', 'hook_execution', 'retry_state', 'task_backgrounded', 'task_completed', 'available_commands_update',
  'current_mode_update', 'config_option_update', 'session_info_update', 'usage_update',
]);
const CHUNK: Record<string, 'user' | 'assistant' | 'thinking'> = { user_message_chunk: 'user', agent_message_chunk: 'assistant', agent_thought_chunk: 'thinking' };
const UPDATES = /(?:^|\/)updates\.jsonl$/;
const SESSION_DIR = /([^/]+)\/updates\.jsonl$/;
/** ACP's extension field. */
const META = '_meta';

function parseJson(file: SourceFile | undefined): Obj {
  try {
    const v: unknown = file ? JSON.parse(file.text) : undefined;
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}

const contentText = (c: unknown): string => (isObj(c) ? (str(c.text) ?? (c.type === 'image' ? '[image]' : '')) : '');

/** Grok's tool inputs, with the keys the shared tool describer reads (file_path, path, command, pattern). */
function toolInput(raw: unknown): Obj {
  const r = isObj(raw) ? raw : {};
  const out: Obj = { ...r };
  if (str(r.target_file) && !str(r.file_path)) out.file_path = r.target_file;
  if (str(r.target_directory) && !str(r.path)) out.path = r.target_directory;
  return out;
}

function resultText(u: Obj): string {
  const parts = Array.isArray(u.content) ? u.content : [];
  const text = parts
    .map((p) => (isObj(p) && p.type === 'content' ? contentText(p.content) : isObj(p) && p.type === 'diff' ? `Edited ${str(p.path) ?? ''}` : ''))
    .filter(Boolean)
    .join('\n');
  if (text) return text;
  const o = isObj(u.rawOutput) ? u.rawOutput : {};
  for (const v of [o.output_for_prompt, o.output, o.stdout, o.Result]) if (str(v)) return str(v) as string;
  const variant = Object.keys(o).find((k) => k !== 'type');
  return variant ?? str(u.status) ?? '';
}

function resultStatus(u: Obj): StepStatus {
  const o = isObj(u.rawOutput) ? u.rawOutput : {};
  if (u.status === 'failed') return 'error';
  if (u.status !== 'completed') return 'interrupted';
  const shell = 'command' in o && typeof o.exit_code === 'number';
  return (shell && o.exit_code !== 0) || o.timed_out === true ? 'error' : 'ok';
}

const toolName = (u: Obj): string => {
  const meta = isObj(u[META]) && isObj(u[META]['x.ai/tool']) ? u[META]['x.ai/tool'] : {};
  return str(meta.name) ?? str(u.title) ?? 'unknown';
};

function planText(entries: unknown): string {
  const list = Array.isArray(entries) ? entries.filter(isObj) : [];
  const mark = (s: unknown) => (s === 'completed' ? '[x]' : s === 'in_progress' ? '[>]' : '[ ]');
  return [`Plan: ${list.filter((e) => e.status === 'completed').length}/${list.length} done`, ...list.map((e) => `${mark(e.status)} ${str(e.content) ?? ''}`)].join('\n');
}

/** Parse one Grok Build session: the main updates.jsonl, summary.json, and any subagent sessions with their meta.json. */
export function parseGrokBuild(input: SessionInput): NormalizedSession {
  const logs = input.files.filter((f) => UPDATES.test(f.path));
  const metaOf = (id: string) => input.files.find((f) => f.path.endsWith(`subagents/${id}/meta.json`));
  const childId = (f: SourceFile) => {
    const id = SESSION_DIR.exec(f.path)?.[1];
    return id && (f.path.includes('/subagents/') || metaOf(id)) ? id : undefined;
  };
  const main = logs.find((f) => !childId(f)) ?? logs[0];
  const session: NormalizedSession = {
    source: { kind: 'grok-build', sessionId: '', agent: 'Grok Build' },
    lanes: [],
    records: [],
    stats: { skippedLines: 0, partialLines: 0, skippedLineNumbers: [], unknownRecords: 0, ignoredRecords: 0 },
  };
  if (!main) return session;
  session.source.file = main.path;
  const dir = main.path.replace(/updates\.jsonl$/, '');
  const summary = parseJson(input.files.find((f) => f.path === `${dir}summary.json`));
  const info = isObj(summary.info) ? summary.info : {};
  const title = str(summary.generated_title) ?? str(summary.session_summary)?.split('\n', 1)[0];
  if (title) session.title = title;
  if (str(summary.current_model_id)) session.source.model = str(summary.current_model_id) as string;
  if (str(info.cwd)) session.source.cwd = str(info.cwd) as string;
  session.source.sessionId = str(info.id) ?? SESSION_DIR.exec(main.path)?.[1] ?? '';

  const files: [SourceFile, NormalizedLane][] = [[main, { id: 'main', name: 'Main', file: main.path }]];
  for (const f of logs.filter((l) => l !== main).sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const id = childId(f) ?? f.path;
    const meta = parseJson(metaOf(id));
    const lane: NormalizedLane = { id, name: str(meta.description) ?? str(meta.subagent_type) ?? str(meta.agent_type) ?? id, file: f.path };
    const type = str(meta.subagent_type) ?? str(meta.agent_type);
    if (type) lane.agentType = type;
    const spawn = str(meta.tool_call_id) ?? str(meta.toolCallId) ?? str(meta.parent_tool_call_id);
    if (spawn) lane.spawnCallId = spawn;
    files.push([f, lane]);
  }
  /** Agent calls whose result names a child session id, for lanes whose meta.json has no tool call id. */
  const spawnedBy = new Map<string, string>();

  for (const [file, lane] of files) {
    session.lanes.push(lane);
    const parsed = readJsonl(file.text);
    countSkipped(session.stats, file.path, parsed);
    const calls = new Map<string, Extract<NormalizedItem, { kind: 'tool-call' }>>();
    let open: { kind: string; item: { text: string } } | undefined; // the chunk message being merged
    let lastCall: string | undefined; // name of the latest tool call in this lane
    const push = (line: number, t: string | undefined, items: NormalizedItem[]) => {
      const rec: NormalizedRecord = { laneId: lane.id, file: file.path, line, items };
      if (t) rec.t = t;
      session.records.push(rec);
    };
    for (const { line, value } of parsed.records) {
      const params = isObj(value) && str(value.method)?.endsWith('session/update') && isObj(value.params) ? value.params : undefined;
      const u = params && isObj(params.update) ? params.update : undefined;
      const kind = u ? str(u.sessionUpdate) : undefined;
      if (!u || !kind) {
        session.stats.unknownRecords++;
        continue;
      }
      const ts = isObj(value) && typeof value.timestamp === 'number' ? value.timestamp : undefined;
      const t = ts === undefined ? undefined : new Date(ts < 1e12 ? ts * 1000 : ts).toISOString();
      if (lane.id === 'main' && !session.source.model && isObj(u[META]) && str(u[META].modelId)) session.source.model = str(u[META].modelId) as string;
      const chunk = CHUNK[kind];
      if (chunk) {
        const text = contentText(u.content);
        if (open?.kind === chunk) open.item.text += text;
        else {
          const item = { kind: chunk, text };
          push(line, t, [item]);
          open = { kind: chunk, item };
        }
        continue;
      }
      open = undefined;
      if (kind !== 'plan' && !kind.startsWith('tool_call')) lastCall = undefined;
      const id = str(u.toolCallId);
      if (kind === 'tool_call' || kind === 'tool_call_update') {
        let call = id ? calls.get(id) : undefined;
        const items: NormalizedItem[] = [];
        if (!call) {
          call = { kind: 'tool-call', name: toolName(u), input: toolInput(u.rawInput) };
          if (id) call.callId = id;
          if (id) calls.set(id, call);
          items.push(call);
          lastCall = call.name;
        } else if (isObj(u.rawInput) && Object.keys(u.rawInput).length) call.input = toolInput({ ...(call.input as Obj), ...u.rawInput });
        if (u.status === 'completed' || u.status === 'failed' || u.status === 'cancelled') {
          const res: NormalizedItem = { kind: 'tool-result', text: resultText(u), status: resultStatus(u) };
          if (id) res.callId = id;
          items.push(res);
          if (id && (call.name === 'spawn_subagent' || call.name === 'task')) {
            const out = JSON.stringify(u.rawOutput ?? '');
            for (const [, l] of files) if (l.id !== 'main' && !l.spawnCallId && out.includes(l.id)) spawnedBy.set(l.id, id);
          }
        }
        if (items.length) push(line, t, items);
      } else if (kind === 'plan') {
        // A plan right after todo_write repeats that call; on its own (plan mode) it is a step.
        if (lastCall === 'todo_write') session.stats.ignoredRecords++;
        else push(line, t, [{ kind: 'system', text: planText(u.entries) }]);
      } else if (kind === 'turn_completed' && u.stop_reason === 'cancelled') {
        push(line, t, [{ kind: 'system', text: 'Turn cancelled', status: 'interrupted' }]);
      } else if (IGNORED.has(kind)) session.stats.ignoredRecords++;
      else session.stats.unknownRecords++;
    }
  }
  for (const lane of session.lanes) if (!lane.spawnCallId && spawnedBy.has(lane.id)) lane.spawnCallId = spawnedBy.get(lane.id) as string;
  return session;
}

/** Recognises ACP `session/update` records (`method` + `params.update.sessionUpdate`). */
export const grokBuildAdapter: SessionAdapter = {
  id: 'grok-build',
  label: 'Grok Build',
  sniff(lines) {
    return lines.some((l) => {
      try {
        const v: unknown = JSON.parse(l);
        return isObj(v) && !!str(v.method)?.endsWith('session/update') && isObj(v.params) && isObj(v.params.update) && typeof v.params.update.sessionUpdate === 'string';
      } catch {
        return false;
      }
    });
  },
  parse: parseGrokBuild,
};
