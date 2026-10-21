// Tool name + input -> category, file touches and a one-line summary. Deterministic, source-neutral.
import { EDIT_TEXT_MAX, TEXT_PREVIEW_MAX, type StepTool, type ToolCategory } from '../types';

const CATEGORY: Record<string, ToolCategory> = {
  Read: 'read',
  NotebookRead: 'read',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  ToolSearch: 'search',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Write: 'write',
  Bash: 'run',
  BashOutput: 'run',
  Monitor: 'run',
  KillShell: 'run',
  TaskStop: 'run',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'agent',
  Task: 'agent',
  SendMessage: 'agent',
  TodoWrite: 'plan',
  ExitPlanMode: 'plan',
};

/** Category for a tool name; unknown tools (including MCP tools) are `other`. */
export function toolCategory(name: string): ToolCategory {
  return Object.hasOwn(CATEGORY, name) ? (CATEGORY[name] as ToolCategory) : 'other';
}

function str(input: unknown, key: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const v = (input as Record<string, unknown>)[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function oneLine(s: string, max = 120): string {
  const first = s.split('\n', 1)[0] ?? '';
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

/** FNV-1a, 32 bit, as 8 hex chars: a short, stable fingerprint (not a security hash). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function editHash(input: unknown): StepTool['editHash'] {
  const edits = typeof input === 'object' && input !== null && Array.isArray((input as { edits?: unknown }).edits) ? ((input as { edits: unknown[] }).edits) : [input];
  const before = edits.map((e) => str(e, 'old_string') ?? '');
  const after = edits.map((e) => str(e, 'new_string') ?? '');
  if (before.every((b) => b === '') && after.every((a) => a === '')) return undefined;
  return { before: fingerprint(before.join('\u0000')), after: fingerprint(after.join('\u0000')) };
}

const clip = (t: string) => (t.length > EDIT_TEXT_MAX ? `${t.slice(0, EDIT_TEXT_MAX - 1)}…` : t);

/** The old and new text of an edit call (all edits of a MultiEdit, joined by a blank line), clipped. */
function editText(input: unknown): StepTool['edit'] {
  const edits = typeof input === 'object' && input !== null && Array.isArray((input as { edits?: unknown }).edits) ? ((input as { edits: unknown[] }).edits) : [input];
  const before = edits.map((e) => str(e, 'old_string') ?? '').join('\n\n');
  const after = edits.map((e) => str(e, 'new_string') ?? '').join('\n\n');
  return before.trim() || after.trim() ? { before: clip(before), after: clip(after) } : undefined;
}

/** Describe a tool call: category, files it names, a short summary and (for shell tools) the verbatim command. */
export function describeTool(name: string, input: unknown, callId?: string): StepTool {
  const category = toolCategory(name);
  const filePath = str(input, 'file_path') ?? str(input, 'notebook_path');
  const searchPath = category === 'search' ? str(input, 'path') : undefined;
  const files = filePath ? [filePath] : searchPath ? [searchPath] : [];
  const command = category === 'run' ? str(input, 'command') : undefined;
  const detail =
    filePath ??
    str(input, 'pattern') ??
    str(input, 'description') ??
    (command ? oneLine(command) : undefined) ??
    str(input, 'url') ??
    str(input, 'query') ??
    str(input, 'prompt') ??
    '';
  const tool: StepTool = { name, category, summary: oneLine(detail ? `${name} ${detail}` : name), files };
  if (callId) tool.callId = callId;
  if (command) tool.command = command.slice(0, TEXT_PREVIEW_MAX);
  const hash = category === 'edit' ? editHash(input) : undefined;
  if (hash) tool.editHash = hash;
  const text = category === 'edit' ? editText(input) : undefined;
  if (text) tool.edit = text;
  const pattern = category === 'search' ? str(input, 'pattern') : undefined;
  if (pattern) tool.pattern = pattern.slice(0, TEXT_PREVIEW_MAX);
  return tool;
}
