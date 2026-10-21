// Tool name + input -> category, file touches and a one-line summary. Deterministic, source-neutral.
import { TEXT_PREVIEW_MAX, type StepTool, type ToolCategory } from '../types';

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
  return tool;
}
