// Adapter interface, registry and the one-call entry point: files in, SessionGraph out.
import { chatTextAdapter, maybeChatText, parseChatText } from './adapters/chat';
import { chatExportAdapter } from './adapters/chatExports';
import { claudeCodeAdapter } from './adapters/claudeCode';
import { codexAdapter } from './adapters/codex';
import { grokBuildAdapter } from './adapters/grokBuild';
import { buildGraph } from './build/graph';
import { firstLines } from './jsonl';
import type { NormalizedSession, SessionGraph, SessionInput, SourceKind } from './types';

/** Turns one source's raw files into a {@link NormalizedSession}. Must be pure, deterministic and never throw. */
export interface SessionAdapter {
  id: SourceKind;
  /** Human-readable source name. */
  label: string;
  /** True when these first non-blank lines of the main file look like this source. */
  sniff(firstLines: string[]): boolean;
  parse(input: SessionInput): NormalizedSession;
}

/** All adapters, in sniffing order (their record shapes do not overlap; plain-text chats last). */
export const adapters: readonly SessionAdapter[] = [claudeCodeAdapter, grokBuildAdapter, codexAdapter, chatExportAdapter, chatTextAdapter];

/** The adapter whose `sniff` accepts these lines, if any. */
export function sniff(lines: string[]): SessionAdapter | undefined {
  return adapters.find((a) => a.sniff(lines));
}

/** Sniff the main `.jsonl` and run its adapter. Returns `undefined` when no adapter recognises the input. */
export function normalizeSession(input: SessionInput): NormalizedSession | undefined {
  const main = input.files.find((f) => f.path.endsWith('.jsonl')) ?? input.files[0];
  const adapter = main ? sniff(firstLines(main.text)) : undefined;
  return adapter?.parse(input);
}

/** Sniff the main `.jsonl`, parse and build the graph. Returns `undefined` when no adapter recognises the input. */
export function parseSession(input: SessionInput): SessionGraph | undefined {
  const session = normalizeSession(input);
  return session ? buildGraph(session) : undefined;
}

/** As {@link parseSession}, but text that no adapter recognises and that is not JSON is read as a pasted chat (turns
 * assumed to alternate, with a note on the map). For the website's paste box and dropped `.txt` files. */
export function parseChat(input: SessionInput): SessionGraph | undefined {
  const text = input.files[0]?.text ?? '';
  return parseSession(input) ?? (maybeChatText(text) ? buildGraph(parseChatText(input)) : undefined);
}
