// Official chat exports (PLAN phase 23, T2): ChatGPT's `conversations.json` (a `mapping` tree per conversation, the
// shown branch ending at `current_node`) and Claude's `conversations.json` (`chat_messages`, optionally chained by
// `parent_message_uuid`). Formats as of 2026-10; read tolerantly, unknown parts counted. An export holds many
// conversations: `readChatExport` lists them and `chatFile` turns the picked one into a small JSONL file (line 1: the
// conversation's own fields; then one verbatim message per line, current branch in order, each earlier version of a
// message just before it), which `chatExportAdapter` maps. So provenance and "Show raw" point at real records.
import type { SessionAdapter } from '../adapter';
import { countSkipped, readJsonl } from '../jsonl';
import type { NormalizedItem, NormalizedSession, SessionInput, SourceFile } from '../types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const iso = (v: unknown): string | undefined => {
  const ms = typeof v === 'number' ? v * 1000 : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};

export type ChatExportKind = 'chatgpt' | 'claude';
/** One conversation in the picker. */
export interface ChatSummary {
  id: string;
  title: string;
  /** ISO time of the last update, when known. */
  updated?: string;
  /** Your messages on the shown branch. */
  turns: number;
}
export interface ChatExport {
  kind: ChatExportKind;
  conversations: Obj[];
}

/** Cheap check before a full parse: JSON that mentions a ChatGPT `mapping` or Claude `chat_messages` early on. */
export function looksLikeChatExport(text: string): boolean {
  const head = text.slice(0, 256 * 1024);
  return /^\s*[[{]/.test(head) && /"(?:mapping|chat_messages)"\s*:/.test(head);
}

/** The export's conversations, or `undefined` when the text is not a ChatGPT or Claude export. */
export function readChatExport(text: string): ChatExport | undefined {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return undefined;
  }
  const list = (Array.isArray(v) ? v : [v]).filter(isObj);
  if (list.some((c) => isObj(c.mapping))) return { kind: 'chatgpt', conversations: list.filter((c) => isObj(c.mapping)) };
  if (list.some((c) => Array.isArray(c.chat_messages))) return { kind: 'claude', conversations: list.filter((c) => Array.isArray(c.chat_messages)) };
  return undefined;
}

const idOf = (c: Obj, i: number) => str(c.conversation_id) ?? str(c.id) ?? str(c.uuid) ?? `conversation-${i + 1}`;

/** ChatGPT: the shown branch, root first (from `current_node`, else the last child at each fork). */
function chatgptBranch(c: Obj): Obj[] {
  const mapping = c.mapping as Obj;
  const node = (id: unknown) => (typeof id === 'string' && isObj(mapping[id]) ? (mapping[id] as Obj) : undefined);
  let leaf = node(c.current_node);
  if (!leaf) {
    leaf = Object.values(mapping).find((n) => isObj(n) && !node(n.parent)) as Obj | undefined;
    for (let next = leaf; next; next = node((next.children as unknown[] | undefined)?.at(-1))) leaf = next;
  }
  const out: Obj[] = [];
  const seen = new Set<unknown>();
  for (let n = leaf; n && !seen.has(n.id); n = node(n.parent)) {
    seen.add(n.id);
    out.unshift(n);
  }
  return out;
}

/** Claude: messages on the shown branch (chained by `parent_message_uuid` when present, else in order). */
function claudeBranch(c: Obj): Obj[] {
  const msgs = (c.chat_messages as unknown[]).filter(isObj);
  if (!msgs.some((m) => str(m.parent_message_uuid))) return msgs;
  const byId = new Map(msgs.map((m) => [str(m.uuid), m]));
  const out: Obj[] = [];
  for (let m = byId.get(str(c.current_leaf_message_uuid)) ?? msgs.at(-1); m && !out.includes(m); m = byId.get(str(m.parent_message_uuid))) out.unshift(m);
  return out;
}

function isUser(kind: ChatExportKind, m: Obj): boolean {
  if (kind === 'claude') return m.sender === 'human';
  const msg = isObj(m.message) ? m.message : undefined;
  return !!msg && isObj(msg.author) && msg.author.role === 'user' && !(isObj(msg.metadata) && msg.metadata.is_visually_hidden_from_conversation);
}

/** The picker's list, in export order. */
export function listChats(exp: ChatExport): ChatSummary[] {
  return exp.conversations.map((c, i) => {
    const branch = exp.kind === 'chatgpt' ? chatgptBranch(c) : claudeBranch(c);
    const s: ChatSummary = { id: idOf(c, i), title: (str(c.title) ?? str(c.name) ?? '').trim() || 'Untitled chat', turns: branch.filter((m) => isUser(exp.kind, m)).length };
    const updated = iso(c.update_time ?? c.updated_at ?? c.create_time ?? c.created_at);
    if (updated) s.updated = updated;
    return s;
  });
}

/** The picked conversation as a JSONL file named `<export name>/<id>.jsonl`, or `undefined` for an unknown id. */
export function chatFile(exp: ChatExport, id: string, exportName: string): SourceFile | undefined {
  const i = exp.conversations.findIndex((c, n) => idOf(c, n) === id);
  const c = exp.conversations[i];
  if (!c) return undefined;
  const head: Obj = { tg_chat_export: exp.kind };
  for (const [k, v] of Object.entries(c)) if (k !== 'mapping' && k !== 'chat_messages' && typeof v !== 'object') head[k] = v;
  head.id = id;
  const lines = [JSON.stringify(head)];
  const emitted = new Set<unknown>();
  const emit = (m: Obj) => {
    if (emitted.has(m)) return;
    emitted.add(m);
    lines.push(JSON.stringify(m));
  };
  if (exp.kind === 'chatgpt') {
    const mapping = c.mapping as Obj;
    for (const n of chatgptBranch(c)) {
      if (!isObj(n.message)) continue;
      const parent = isObj(mapping[str(n.parent) ?? '']) ? (mapping[str(n.parent) ?? ''] as Obj) : undefined;
      for (const sib of Array.isArray(parent?.children) ? parent.children : []) {
        const s = mapping[str(sib) ?? ''];
        if (isObj(s) && s !== n && isObj(s.message)) emit({ ...s, children: [] });
      }
      emit(n);
    }
  } else {
    const msgs = (c.chat_messages as unknown[]).filter(isObj);
    for (const m of claudeBranch(c)) {
      const p = str(m.parent_message_uuid);
      if (p) for (const s of msgs) if (s !== m && str(s.parent_message_uuid) === p) emit(s);
      emit(m);
    }
  }
  return { path: `${exportName}/${id}.jsonl`, text: `${lines.join('\n')}\n` };
}

/** ChatGPT content parts that carry no step: tool traffic, context, recaps ("Thought for 12 s"). */
const CHATGPT_IGNORED = new Set(['reasoning_recap', 'code', 'execution_output', 'tether_browsing_display', 'tether_quote', 'user_editable_context', 'model_editable_context', 'system_error', 'sonic_webpage', 'computer_output']);

function partsText(parts: unknown): string {
  return (Array.isArray(parts) ? parts : [])
    .map((p) => (typeof p === 'string' ? p : isObj(p) ? (str(p.text) ?? (/image/.test(str(p.content_type) ?? '') ? '[image]' : '[attachment]')) : ''))
    .join('\n')
    .trim();
}

/** One ChatGPT node: its items, or `null` for a known record that shows nothing, or `undefined` when unknown. */
function chatgptItems(m: Obj): NormalizedItem[] | null | undefined {
  const role = isObj(m.author) ? m.author.role : undefined;
  const content = isObj(m.content) ? m.content : {};
  const type = str(content.content_type);
  const hidden = isObj(m.metadata) && !!m.metadata.is_visually_hidden_from_conversation;
  if (hidden || role === 'system' || role === 'tool' || CHATGPT_IGNORED.has(type ?? '')) return null;
  if (type === 'thoughts') {
    const text = (Array.isArray(content.thoughts) ? content.thoughts : []).filter(isObj).map((t) => [str(t.summary), str(t.content)].filter(Boolean).join('\n')).join('\n\n');
    return [{ kind: 'thinking', text }];
  }
  if (type !== 'text' && type !== 'multimodal_text') return undefined;
  if (role === 'assistant' && str(m.recipient) && m.recipient !== 'all') return null; // a call to a tool
  const text = partsText(content.parts);
  if (!text) return null;
  return role === 'user' ? [{ kind: 'user', text }] : role === 'assistant' ? [{ kind: 'assistant', text }] : undefined;
}

/** One Claude message: thinking blocks and text, in order. */
function claudeItems(m: Obj): NormalizedItem[] | null | undefined {
  const kind = m.sender === 'human' ? 'user' : m.sender === 'assistant' ? 'assistant' : undefined;
  if (!kind) return undefined;
  const items: NormalizedItem[] = [];
  const parts = Array.isArray(m.content) ? m.content.filter(isObj) : [];
  for (const p of parts) {
    if (p.type === 'thinking') items.push({ kind: 'thinking', text: str(p.thinking) ?? '' });
    else if (p.type === 'text' && str(p.text)?.trim()) items.push({ kind, text: (str(p.text) as string).trim() });
  }
  if (parts.length === 0 && str(m.text)?.trim()) items.push({ kind, text: (str(m.text) as string).trim() });
  return items.length > 0 ? items : null;
}

/** Map a file written by {@link chatFile}. Earlier versions of a message become forks (shown as detected patterns). */
export function parseChatExport(input: SessionInput): NormalizedSession {
  const main = input.files.find((f) => f.path.endsWith('.jsonl')) ?? input.files[0];
  const session: NormalizedSession = {
    source: { kind: 'chat', sessionId: '', agent: 'Chat' },
    lanes: [],
    records: [],
    stats: { skippedLines: 0, partialLines: 0, skippedLineNumbers: [], unknownRecords: 0, ignoredRecords: 0 },
  };
  if (!main) return session;
  session.source.file = main.path;
  session.lanes.push({ id: 'main', name: 'Main', file: main.path });
  const parsed = readJsonl(main.text);
  countSkipped(session.stats, main.path, parsed);
  const recs = parsed.records.filter((r) => isObj(r.value)) as { line: number; value: Obj }[];
  session.stats.unknownRecords += parsed.records.length - recs.length;
  // The shown branch: the last message and its ancestors. Messages off it are earlier versions, placed without a time
  // so they sort just before the version that replaced them.
  const parentOf = (v: Obj) => str(v.parent) ?? str(v.parent_message_uuid);
  const idOfRec = (v: Obj) => str(v.uuid) ?? (isObj(v.message) ? str(v.id) : undefined);
  const byId = new Map(recs.map((r) => [idOfRec(r.value), r.value]));
  const shown = new Set<string>();
  const last = [...recs].reverse().find((r) => idOfRec(r.value) && !r.value.tg_chat_export)?.value;
  for (let v = last; v && !shown.has(idOfRec(v) ?? ''); v = byId.get(parentOf(v))) shown.add(idOfRec(v) ?? '');
  for (const { line, value: v } of recs) {
    const kind = str(v.tg_chat_export);
    if (kind) {
      session.stats.ignoredRecords++;
      session.source.sessionId ||= str(v.id) ?? '';
      session.source.agent = kind === 'chatgpt' ? 'ChatGPT' : 'Claude';
      const title = str(v.title) ?? str(v.name);
      if (title?.trim()) session.title ??= title.trim();
      const model = str(v.default_model_slug) ?? str(v.model);
      if (model) session.source.model = model;
      continue;
    }
    const chatgpt = isObj(v.message) && str(v.id) !== undefined;
    const items = chatgpt ? chatgptItems(v.message as Obj) : str(v.uuid) && 'sender' in v ? claudeItems(v) : undefined;
    if (items === undefined) {
      session.stats.unknownRecords++;
      continue;
    }
    const uuid = idOfRec(v);
    const t = shown.has(uuid ?? '') ? iso(chatgpt ? (v.message as Obj).create_time : v.created_at) : undefined;
    if (!items) session.stats.ignoredRecords++;
    const parentUuid = parentOf(v);
    session.records.push({ laneId: 'main', file: main.path, line, items: items ?? [], ...(uuid ? { uuid } : {}), ...(parentUuid ? { parentUuid } : {}), ...(t ? { t } : {}) });
  }
  session.source.sessionId ||= main.path.replace(/^.*\//, '').replace(/\.jsonl$/, '');
  return session;
}

/** Recognises a {@link chatFile} by its first line. */
export const chatExportAdapter: SessionAdapter = {
  id: 'chat',
  label: 'Chat export',
  sniff: (lines) => lines.some((l) => /^\{"tg_chat_export":"(?:chatgpt|claude)"/.test(l)),
  parse: parseChatExport,
};
