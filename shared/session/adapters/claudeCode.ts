// Claude Code transcripts: ~/.claude/projects/<cwd>/<sessionId>.jsonl plus <sessionId>/subagents/agent-*.jsonl (+ .meta.json).
// Undocumented format, read tolerantly: unknown record types are counted, never fatal.
import type { SessionAdapter } from '../adapter';
import { readJsonl } from '../jsonl';
import type { NormalizedItem, NormalizedLane, NormalizedRecord, NormalizedSession, SessionInput, SourceFile, StepStatus } from '../types';

/** Bookkeeping records that never become steps (counted as ignored). */
const IGNORED = new Set([
  'api-request', 'api-request-blob', 'api-request-shape', 'attachment', 'atis-latch', 'cost-state', 'mode',
  'queue-operation', 'custom-title', 'agent-name', 'pr-link', 'last-prompt', 'summary', 'file-history-snapshot',
]);
const SUBAGENT_FILE = /(?:^|\/)subagents\/(agent-[^/]+)\.jsonl$/;
const INTERRUPT = /^\[Request interrupted by user[^\]]*\]$/;
const PERSISTED = /<persisted-output>[\s\S]*?(tool-results\/[^\s<>"']+)/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p) => (isObj(p) && p.type === 'text' ? (str(p.text) ?? '') : isObj(p) && p.type === 'image' ? '[image]' : ''))
    .filter(Boolean)
    .join('\n');
}

function userItems(rec: Obj, msg: Obj): NormalizedItem[] {
  const content = msg.content;
  const parts = Array.isArray(content) ? content : [];
  const results = parts.filter((p): p is Obj => isObj(p) && p.type === 'tool_result');
  if (results.length > 0) {
    const tur = isObj(rec.toolUseResult) ? rec.toolUseResult : undefined;
    return results.map((p) => {
      const text = textOf(p.content);
      const interrupted = tur?.interrupted === true || INTERRUPT.test(text.trim());
      const status: StepStatus = interrupted ? 'interrupted' : p.is_error === true ? 'error' : 'ok';
      const item: NormalizedItem = { kind: 'tool-result', text, status };
      const callId = str(p.tool_use_id);
      if (callId) item.callId = callId;
      const persisted = PERSISTED.exec(text)?.[1];
      if (persisted) item.persistedOutput = persisted;
      return item;
    });
  }
  const text = textOf(content);
  if (rec.isCompactSummary === true) return [{ kind: 'compaction', text }];
  if (INTERRUPT.test(text.trim())) return [{ kind: 'system', text, status: 'interrupted' }];
  if (rec.isMeta === true) return [{ kind: 'system', text }];
  return text ? [{ kind: 'user', text }] : [];
}

function assistantItems(msg: Obj): NormalizedItem[] {
  const parts = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: textOf(msg.content) }];
  const items: NormalizedItem[] = [];
  for (const p of parts) {
    if (!isObj(p)) continue;
    if (p.type === 'text' && str(p.text)) items.push({ kind: 'assistant', text: str(p.text) ?? '' });
    else if (p.type === 'thinking' || p.type === 'redacted_thinking') items.push({ kind: 'thinking', text: str(p.thinking) ?? '' });
    else if (p.type === 'tool_use') {
      const item: NormalizedItem = { kind: 'tool-call', name: str(p.name) ?? 'unknown', input: p.input };
      const id = str(p.id);
      if (id) item.callId = id;
      items.push(item);
    }
  }
  return items;
}

function parseMeta(file: SourceFile | undefined): Obj {
  if (!file) return {};
  try {
    const v: unknown = JSON.parse(file.text);
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}

/** Parse one Claude Code session (main transcript + any subagent transcripts and their meta files). */
export function parseClaudeCode(input: SessionInput): NormalizedSession {
  const jsonl = input.files.filter((f) => f.path.endsWith('.jsonl'));
  const main = jsonl.find((f) => !SUBAGENT_FILE.test(f.path)) ?? jsonl[0];
  const subs = jsonl.filter((f) => f !== main).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const metaFor = (f: SourceFile) => input.files.find((m) => m.path === f.path.replace(/\.jsonl$/, '.meta.json'));

  const session: NormalizedSession = {
    source: { kind: 'claude-code', sessionId: '', agent: 'Claude Code' },
    lanes: [],
    records: [],
    stats: { skippedLines: 0, partialLines: 0, unknownRecords: 0, ignoredRecords: 0 },
  };
  if (!main) return session;
  session.source.file = main.path;
  let customTitle: string | undefined;

  const files: [SourceFile, NormalizedLane][] = [[main, { id: 'main', name: 'Main', file: main.path }]];
  for (const f of subs) {
    const meta = parseMeta(metaFor(f));
    const agentId = SUBAGENT_FILE.exec(f.path)?.[1] ?? f.path;
    const lane: NormalizedLane = { id: agentId, name: str(meta.description) ?? str(meta.agentType) ?? agentId, file: f.path };
    if (str(meta.agentType)) lane.agentType = str(meta.agentType) as string;
    if (str(meta.toolUseId)) lane.spawnCallId = str(meta.toolUseId) as string;
    files.push([f, lane]);
  }

  for (const [file, lane] of files) {
    session.lanes.push(lane);
    const { records, malformed, partial } = readJsonl(file.text);
    session.stats.skippedLines += malformed + partial;
    session.stats.partialLines += partial;
    for (const { line, value } of records) {
      const type = isObj(value) ? str(value.type) : undefined;
      if (!isObj(value) || !type) {
        session.stats.unknownRecords++;
        continue;
      }
      const msg = isObj(value.message) ? value.message : undefined;
      let items: NormalizedItem[] | undefined;
      if (type === 'user' && msg) items = userItems(value, msg);
      else if (type === 'assistant' && msg) items = assistantItems(msg);
      else if (type === 'system') {
        const level = str(value.level);
        const text = str(value.content) ?? [str(value.subtype), level].filter(Boolean).join(' ');
        items = [level === 'error' ? { kind: 'system', text, status: 'error' } : { kind: 'system', text }];
      } else if (IGNORED.has(type)) {
        session.stats.ignoredRecords++;
        if (type === 'custom-title' && lane.id === 'main') customTitle = str(value.customTitle) ?? customTitle;
      } else session.stats.unknownRecords++;

      if (lane.id === 'main') {
        session.source.sessionId ||= str(value.sessionId) ?? '';
        if (str(value.cwd)) session.source.cwd ??= str(value.cwd) as string;
        if (str(value.gitBranch)) session.source.gitBranch ??= str(value.gitBranch) as string;
        if (msg && str(msg.model) && msg.model !== '<synthetic>') session.source.model ??= str(msg.model) as string;
      }
      const uuid = str(value.uuid);
      if (!items && !uuid) continue;
      const rec: NormalizedRecord = { laneId: lane.id, file: file.path, line, items: items ?? [] };
      if (uuid) rec.uuid = uuid;
      if (str(value.parentUuid)) rec.parentUuid = str(value.parentUuid) as string;
      if (str(value.timestamp)) rec.t = str(value.timestamp) as string;
      session.records.push(rec);
    }
  }
  if (customTitle) session.title = customTitle;
  session.source.sessionId ||= main.path.replace(/^.*\//, '').replace(/\.jsonl$/, '');
  return session;
}

/** Recognises Claude Code records by their shape (`type` + `sessionId`, or `uuid` + `parentUuid`). */
export const claudeCodeAdapter: SessionAdapter = {
  id: 'claude-code',
  label: 'Claude Code',
  sniff(lines) {
    return lines.some((l) => {
      try {
        const v: unknown = JSON.parse(l);
        return isObj(v) && typeof v.type === 'string' && (typeof v.sessionId === 'string' || 'parentUuid' in v);
      } catch {
        return false;
      }
    });
  },
  parse: parseClaudeCode,
};
