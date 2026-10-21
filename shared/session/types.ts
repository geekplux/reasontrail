// The step-graph model (PLAN §5.10, D22). DOM-free and Node-free: runs in the app, a Web Worker, the CLI and the Worker.

/** Bump on any breaking change to {@link SessionGraph}. */
export const SCHEMA_VERSION = 1;
/** Cap on `SessionStats.skippedLineNumbers`. */
export const SKIPPED_LINES_MAX = 50;

/** Where a session came from. */
export type SourceKind = 'claude-code' | 'codex' | 'grok-build' | 'chat';

/** What a tool does, independent of its name. */
export type ToolCategory = 'read' | 'search' | 'edit' | 'write' | 'run' | 'web' | 'agent' | 'plan' | 'other';

/** Outcome of a step that can fail. */
export type StepStatus = 'ok' | 'error' | 'interrupted';

/** One raw input file (a transcript, a subagent transcript or its `.meta.json`). */
export interface SourceFile {
  /** Path as the caller knows it; copied into every step's provenance. */
  path: string;
  /** Full file text. */
  text: string;
}

/** Everything an adapter needs for one session. The first `.jsonl` that is not a subagent file is the main transcript. */
export interface SessionInput {
  files: SourceFile[];
}

/** Provenance: the raw record a step came from. Mandatory on every step. */
export interface Provenance {
  file: string;
  /** 1-based line number in `file`. */
  line: number;
  uuid?: string;
}

/** Tool details on `tool-call` and `tool-result` steps. */
export interface StepTool {
  name: string;
  category: ToolCategory;
  /** One short line, e.g. "Read src/app.ts". */
  summary: string;
  /** Files the call names (read, edited, written or searched). Shell writes are detected later (phase 12). */
  files: string[];
  callId?: string;
  /** Full shell command (≤ 2000 chars) for `run` tools, kept verbatim for later analysis. */
  command?: string;
  /** Set on results whose full output was saved to a side file (e.g. `tool-results/x.txt`) and not inlined. */
  persistedOutput?: string;
  /** Edit tools only: short hashes of the replaced and the new text, so reverts can be found without storing the text. */
  editHash?: { before: string; after: string };
  /** Edit tools only, on the call: the replaced and the new text (each at most {@link EDIT_TEXT_MAX} chars), for the
   * detail panel's line diff. Several edits of one call are joined by a blank line. */
  edit?: { before: string; after: string };
  /** Search tools: the pattern searched for. */
  pattern?: string;
}

/** Cap on each side of {@link StepTool.edit}. */
export const EDIT_TEXT_MAX = 1500;

export type StepKind = 'user' | 'assistant' | 'thinking' | 'tool-call' | 'tool-result' | 'system' | 'compaction';

/** One thing that happened, in time order. */
export interface Step {
  /** Stable id: `s<seq>`. */
  id: string;
  /** Index in {@link SessionGraph.steps}. */
  seq: number;
  /** ISO timestamp, when the record had one. */
  t?: string;
  laneId: string;
  kind: StepKind;
  /** Preview, at most {@link TEXT_PREVIEW_MAX} chars. */
  text?: string;
  /** `false` when the source kept only a signature (empty thinking). */
  textStored?: false;
  tool?: StepTool;
  status?: StepStatus;
  raw: Provenance;
  /** The verbatim raw record (at most {@link RAW_TEXT_MAX} chars, redacted in shared copies), on the first step of
   * each record only. Set by `attachRaw` (shared/session/raw.ts); absent when the source text was not available. */
  rawText?: string;
}

/** Cap on {@link Step.rawText}. */
export const RAW_TEXT_MAX = 4096;

/** Preview length cap for {@link Step.text} and {@link StepTool.command}. */
export const TEXT_PREVIEW_MAX = 2000;

/**
 * Typed link between two steps, always `from` the earlier step `to` the later one.
 * `next`: conversation order; `result-of`: call → its result; `spawned`: agent call → first subagent step;
 * `forks`: branch point → first step of an alternative branch (rewind or edited prompt);
 * `retry-of` / `reverts`: phase 12; `supports`: AI overlay only.
 */
export interface Edge {
  from: string;
  to: string;
  kind: 'next' | 'result-of' | 'spawned' | 'retry-of' | 'reverts' | 'forks' | 'supports';
}

/** A swimlane: `main` plus one per subagent. */
export interface Lane {
  id: string;
  name: string;
  agentType?: string;
  /** Step id of the tool call that spawned this lane. */
  spawnedBy?: string;
  status?: StepStatus;
  /** Transcript file of this lane. */
  file: string;
}

/**
 * Deterministic segment of steps (PLAN §5.11). A lane has at most `MAX_TOP_EPISODES` top-level episodes; when its
 * fine-grained episodes are more, they are grouped and each keeps `parentId` pointing at its top-level group.
 */
export interface Episode {
  id: string;
  title: string;
  kind: 'explore' | 'change' | 'verify' | 'delegate' | 'answer' | 'discuss';
  stepIds: string[];
  laneId: string;
  /** Set on fine-grained episodes folded into a top-level group. */
  parentId?: string;
}

/** A pattern found by a rule (PLAN §5.11, D23), never by AI. `stepIds` are the evidence, in step order. */
export interface Trouble {
  id: string;
  kind: 'error-streak' | 'retry' | 'revert' | 'rewind' | 'interrupt' | 'churn';
  label: 'detected pattern';
  stepIds: string[];
  count: number;
  /** Something later succeeded: the same command passed, work resumed, or a later verification passed. */
  resolved: boolean;
  summary: string;
  /** Provenance of the first evidence step. */
  raw: Provenance;
}

/** What the session produced (phase 12). Paths are relative to `source.cwd` when inside it. */
export interface Outcome {
  files: { path: string; edits: number; created: boolean }[];
  /** Files left out of `files` because their net change was reverted. */
  revertedFiles?: number;
  lastVerification?: { stepId: string; command: string; ok: boolean };
  answerStepId?: string;
}

/** Parse statistics. Nothing is dropped silently. */
export interface SessionStats {
  steps: number;
  /** Malformed lines plus a partial last line. */
  skippedLines: number;
  /** A last line cut off mid-write (0 or 1 per file). */
  partialLines: number;
  /** Where the skipped lines are, in file order, at most `SKIPPED_LINES_MAX` (deterministic). */
  skippedLineNumbers: Provenance[];
  /** Records of a type the adapter does not know. */
  unknownRecords: number;
  /** Known bookkeeping records that carry no step (counted, not shown). */
  ignoredRecords: number;
  durationMs?: number;
}

/** The one model every view, the CLI and the samples share. */
export interface SessionGraph {
  schemaVersion: typeof SCHEMA_VERSION;
  source: {
    kind: SourceKind;
    sessionId: string;
    file?: string;
    agent?: string;
    model?: string;
    cwd?: string;
    gitBranch?: string;
    startedAt?: string;
    endedAt?: string;
  };
  /** Custom title, or the first user request's first line (≤ 120 chars). */
  title: string;
  lanes: Lane[];
  steps: Step[];
  edges: Edge[];
  episodes: Episode[];
  trouble: Trouble[];
  outcome: Outcome;
  stats: SessionStats;
  /** Samples only (M2). */
  expect?: { task: string; files: string[]; trouble: number; final: 'ok' | 'error' | 'unknown' };
}

/** AI labels never live in the graph; they are a separate overlay keyed by step id. */
export interface LabelOverlay {
  model: string;
  createdAt: string;
  labels: { stepId: string; label: string; confidence: number }[];
  links: { claimStepId: string; supportStepIds: string[] }[];
}

/** One normalized item inside a raw record; adapters emit these, `build/steps.ts` turns them into steps. */
export type NormalizedItem =
  | { kind: 'user' | 'assistant' | 'compaction'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'system'; text: string; status?: StepStatus }
  | { kind: 'tool-call'; name: string; input: unknown; callId?: string }
  | { kind: 'tool-result'; callId?: string; text: string; status: StepStatus; persistedOutput?: string };

/** One raw record, normalized. Records chain through `uuid` / `parentUuid` when the source has them. */
export interface NormalizedRecord {
  laneId: string;
  file: string;
  line: number;
  uuid?: string;
  parentUuid?: string;
  t?: string;
  items: NormalizedItem[];
}

/** A lane as the adapter sees it; `spawnCallId` is resolved to a step id by `buildGraph`. */
export interface NormalizedLane {
  id: string;
  name: string;
  file: string;
  agentType?: string;
  spawnCallId?: string;
}

/** Adapter output: source-neutral, ready for {@link SessionGraph} building. */
export interface NormalizedSession {
  source: SessionGraph['source'];
  title?: string;
  lanes: NormalizedLane[];
  /** Records of all lanes, in file order per lane. Chained records without content keep `items: []`. */
  records: NormalizedRecord[];
  stats: Omit<SessionStats, 'steps' | 'durationMs'>;
}
