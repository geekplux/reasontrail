// Codex CLI rollouts (PLAN §5.12, D31): ${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl, one
// `{timestamp, type, payload}` line per RolloutItem (session_meta, turn_context, response_item, event_msg, compacted, …).
// Written from the public source (openai/codex, codex-rs/protocol and codex-rs/history), not yet checked against a real
// rollout on this project's machines. Unknown records are counted, never fatal.
import type { SessionAdapter } from '../adapter';
import { countSkipped, readJsonl } from '../jsonl';
import type { NormalizedItem, NormalizedSession, SessionInput, StepStatus } from '../types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Rollout items that carry no step (counted as ignored). */
const IGNORED = new Set([
  'session_meta', 'turn_context', 'inter_agent_communication', 'inter_agent_communication_metadata', 'token_usage_record',
  'world_state', 'retained_context', 'security_risk_score', 'realtime_item',
]);
/** response_item payloads that carry no step. */
const IGNORED_ITEMS = new Set([
  'message', 'additional_tools', 'agent_message', 'tool_search_call', 'tool_search_output', 'image_generation_call', 'compaction',
  'configuration_update', 'compaction_trigger', 'context_compaction', 'ghost_snapshot', 'other',
]);
/** Context Codex injects as user or developer messages (instructions, environment): counted as ignored, not shown. */
const INJECTED = /^\s*(?:<environment_context>|<user_instructions>|<permissions instructions>|<user_shell_command>|# AGENTS\.md instructions)/;

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : (Array.isArray(content) ? content : [])
        .map((p) => (isObj(p) ? (str(p.text) ?? (p.type === 'input_image' ? '[image]' : '')) : ''))
        .filter(Boolean)
        .join('\n');

/** A shell argv as one command line: `bash -lc "<script>"` becomes the script. */
function commandLine(cmd: unknown): string | undefined {
  if (typeof cmd === 'string') return cmd;
  if (!Array.isArray(cmd) || !cmd.every((a) => typeof a === 'string')) return undefined;
  const argv = cmd as string[];
  if (argv.length === 3 && /(?:^|\/)(?:ba|z)?sh$/.test(argv[0] ?? '') && /^-l?c$/.test(argv[1] ?? '')) return argv[2];
  return argv.map((a) => (/[\s"'$]/.test(a) ? `'${a.replaceAll("'", `'\\''`)}'` : a)).join(' ');
}

/** apply_patch text → the first file it touches and the removed and added lines (for the edit fingerprint and diff). */
function patchInput(patch: string): Obj {
  const files = [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => (m[1] ?? '').trim());
  const lines = patch.split('\n');
  const side = (c: string) => lines.filter((l) => l.startsWith(c) && !l.startsWith(`${c}${c}${c}`)).map((l) => l.slice(1)).join('\n');
  const out: Obj = { old_string: side('-'), new_string: side('+') };
  if (files[0]) out.file_path = files[0];
  if (files.length > 1) out.description = `${files.length} files`;
  return out;
}

/** Codex tool arguments, with the keys the shared tool describer reads (command, file_path, query, description). */
function toolInput(name: string, args: unknown): Obj {
  let a: unknown = args;
  if (typeof args === 'string' && name !== 'apply_patch') {
    try {
      a = JSON.parse(args);
    } catch {
      a = { input: args };
    }
  }
  if (name === 'apply_patch') return patchInput(typeof a === 'string' ? a : (str(isObj(a) ? a.input : undefined) ?? ''));
  const o: Obj = isObj(a) ? { ...a } : {};
  const command = commandLine(o.command) ?? str(o.cmd);
  if (command !== undefined) o.command = command;
  if (str(o.path) && name === 'view_image') o.file_path = o.path;
  if (name === 'update_plan' && str(o.explanation)) o.description = o.explanation;
  return o;
}

/** Function output: a plain string, `{content, success}`, or a JSON string `{output, metadata: {exit_code}}`. */
function result(output: unknown): { text: string; status: StepStatus } {
  let text = isObj(output) ? textOf(output.content) : textOf(output);
  let status: StepStatus = isObj(output) && output.success === false ? 'error' : 'ok';
  try {
    const v: unknown = JSON.parse(text);
    if (isObj(v) && str(v.output) !== undefined) {
      text = str(v.output) as string;
      const code = isObj(v.metadata) ? v.metadata.exit_code : undefined;
      if (typeof code === 'number' && code !== 0) status = 'error';
    }
  } catch {
    const code = /^Exit code: (-?\d+)/m.exec(text)?.[1];
    if (code && code !== '0') status = 'error';
  }
  if (/^aborted by user/i.test(text.trim())) status = 'interrupted';
  return { text, status };
}

function responseItems(p: Obj): NormalizedItem[] | undefined {
  const type = str(p.type);
  const callId = str(p.call_id);
  const call = (name: string, input: unknown): NormalizedItem[] => [callId ? { kind: 'tool-call', name, input, callId } : { kind: 'tool-call', name, input }];
  switch (type) {
    case 'message': {
      const text = textOf(p.content);
      if (!text) return [];
      if (p.role === 'assistant') return [{ kind: 'assistant', text }];
      if (p.role === 'user' && !INJECTED.test(text)) return [{ kind: 'user', text }];
      return p.role === 'user' || p.role === 'developer' ? undefined : [{ kind: 'system', text }];
    }
    case 'reasoning': {
      const summary = textOf(p.summary);
      return [{ kind: 'thinking', text: summary || textOf(p.content) }];
    }
    case 'function_call':
    case 'custom_tool_call': {
      const name = str(p.name) ?? 'unknown';
      return call(name, toolInput(name, type === 'function_call' ? p.arguments : p.input));
    }
    case 'local_shell_call':
      return call('local_shell', toolInput('local_shell', isObj(p.action) ? { command: p.action.command } : {}));
    case 'web_search_call':
      return call('web_search', isObj(p.action) ? { query: str(p.action.query) ?? '' } : {});
    case 'function_call_output':
    case 'custom_tool_call_output': {
      const item: NormalizedItem = { kind: 'tool-result', ...result(p.output) };
      if (callId) item.callId = callId;
      return [item];
    }
    default:
      return undefined;
  }
}

/** Parse one Codex rollout file. */
export function parseCodex(input: SessionInput): NormalizedSession {
  const main = input.files.find((f) => f.path.endsWith('.jsonl'));
  const session: NormalizedSession = {
    source: { kind: 'codex', sessionId: '', agent: 'Codex' },
    lanes: [],
    records: [],
    stats: { skippedLines: 0, partialLines: 0, skippedLineNumbers: [], unknownRecords: 0, ignoredRecords: 0 },
  };
  if (!main) return session;
  session.source.file = main.path;
  session.lanes.push({ id: 'main', name: 'Main', file: main.path });
  const parsed = readJsonl(main.text);
  countSkipped(session.stats, main.path, parsed);
  for (const { line, value } of parsed.records) {
    const type = isObj(value) ? str(value.type) : undefined;
    const p = isObj(value) && isObj(value.payload) ? value.payload : undefined;
    if (!type || !p) {
      session.stats.unknownRecords++;
      continue;
    }
    let items: NormalizedItem[] | undefined;
    if (type === 'session_meta') {
      session.source.sessionId ||= str(p.id) ?? '';
      if (str(p.cwd)) session.source.cwd ??= str(p.cwd) as string;
      if (isObj(p.git) && str(p.git.branch)) session.source.gitBranch ??= str(p.git.branch) as string;
    } else if (type === 'turn_context') {
      if (str(p.model)) session.source.model ??= str(p.model) as string;
      if (str(p.cwd)) session.source.cwd ??= str(p.cwd) as string;
    } else if (type === 'response_item') {
      items = responseItems(p);
      if (!items) {
        if (IGNORED_ITEMS.has(str(p.type) ?? '')) session.stats.ignoredRecords++;
        else session.stats.unknownRecords++;
        continue;
      }
    } else if (type === 'event_msg') {
      // Most events repeat response items (user_message, agent_message, agent_reasoning, exec_command_end, …).
      if (p.type === 'turn_aborted') items = [{ kind: 'system', text: `Turn aborted${str(p.reason) ? `: ${str(p.reason)}` : ''}`, status: 'interrupted' }];
      else if (p.type === 'error') items = [{ kind: 'system', text: str(p.message) ?? 'error', status: 'error' }];
      else session.stats.ignoredRecords++;
    } else if (type === 'compacted') items = [{ kind: 'compaction', text: str(p.message) ?? '' }];
    else if (!IGNORED.has(type)) {
      session.stats.unknownRecords++;
      continue;
    }
    if (IGNORED.has(type)) session.stats.ignoredRecords++;
    if (!items || items.length === 0) continue;
    const t = isObj(value) ? str(value.timestamp) : undefined;
    session.records.push({ laneId: 'main', file: main.path, line, items, ...(t ? { t } : {}) });
  }
  session.source.sessionId ||= /([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i.exec(main.path)?.[1] ?? main.path.replace(/^.*\//, '').replace(/\.jsonl$/, '');
  return session;
}

/** Recognises rollout lines: a `type` from the RolloutItem set plus an object `payload`. */
export const codexAdapter: SessionAdapter = {
  id: 'codex',
  label: 'Codex',
  sniff(lines) {
    return lines.some((l) => {
      try {
        const v: unknown = JSON.parse(l);
        return isObj(v) && isObj(v.payload) && ['session_meta', 'turn_context', 'response_item', 'event_msg', 'compacted'].includes(str(v.type) ?? '');
      } catch {
        return false;
      }
    });
  },
  parse: parseCodex,
};
