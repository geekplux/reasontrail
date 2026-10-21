// Adapter interface, registry and the one-call entry point: files in, SessionGraph out.
import { claudeCodeAdapter } from './adapters/claudeCode';
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

/** All adapters, in sniffing order. Codex, Grok Build and chat join in later phases. */
export const adapters: readonly SessionAdapter[] = [claudeCodeAdapter];

/** The adapter whose `sniff` accepts these lines, if any. */
export function sniff(lines: string[]): SessionAdapter | undefined {
  return adapters.find((a) => a.sniff(lines));
}

/** Sniff the main `.jsonl`, parse and build the graph. Returns `undefined` when no adapter recognises the input. */
export function parseSession(input: SessionInput): SessionGraph | undefined {
  const main = input.files.find((f) => f.path.endsWith('.jsonl')) ?? input.files[0];
  const adapter = main ? sniff(firstLines(main.text)) : undefined;
  return adapter ? buildGraph(adapter.parse(input)) : undefined;
}
