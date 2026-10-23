// The intake's contract (PLAN phase 19, V1, V5): what the page and the parse worker say to each other, and the limits.
import type { ChatSummary } from '../../shared/session/adapters/chatExports';
import type { SessionGraph } from '../../shared/session/types';

/** V5: the browser maps files up to 50 MB; the CLI has no limit. */
export const MAX_BYTES = 50 * 1024 * 1024;
/** DESIGN §12: the progress bar is shown only for files over 2 MB (smaller ones finish before it would be read). */
export const PROGRESS_MIN_BYTES = 2 * 1024 * 1024;
/** If the worker cannot start, files under 1 MB are parsed on the main thread instead (PLAN phase 19, risks). */
export const MAIN_THREAD_MAX = 1024 * 1024;

/** `share-link` is the page's own (T3): a pasted share link is never fetched. */
export type IntakeError = 'unsupported' | 'empty' | 'unreadable' | 'too-large' | 'worker' | 'share-link';
/** `pick`: the file is a chat export holding several conversations; parse it again with one of their ids. */
export type IntakeResult = { ok: true; graph: SessionGraph } | { ok: false; error: IntakeError } | { ok: 'pick'; chats: ChatSummary[] };

/** Page → worker. `id` ties replies to their job. Cancelling ends the worker, so there is no cancel message. */
export type ToWorker = { type: 'parse'; id: number; file: File; pick?: string | undefined };

/** Worker → page. `progress` is sent at most once per read chunk; `lines` of `total` lines read so far. */
export type FromWorker =
  | { type: 'progress'; id: number; lines: number; total: number }
  | { type: 'done'; id: number; result: IntakeResult };

/** The size in whole MB, as the over-50-MB message says it. */
export const megabytes = (bytes: number) => Math.ceil(bytes / (1024 * 1024));

/** The progress text: "1,234 of 5,678 lines" while reading, then "Building the map…" while the read file is parsed. */
export const progressText = (lines: number, total: number) =>
  total > 0 && lines >= total ? 'Building the map…' : `${lines.toLocaleString('en')} of ${total.toLocaleString('en')} lines`;
