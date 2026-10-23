// The client half of the optional AI pass (PLAN phase 21, V3, X3, X5): what will be sent, the sequential POSTs to
// `/api/structure`, and calm messages for every failure. Shared by the website's `useStructure` and the CLI's `--ai`.
// Nothing here runs until the caller has the user's consent.
import { ProviderError, type ProviderErrorCode } from './llm/types';
import { mergeOverlay, sanitizeResult, type StructureRequest, type StructureResponse } from './session/structure';
import type { LabelOverlay } from './session/types';

/** The website's endpoint (same origin as the page). */
export const STRUCTURE_ENDPOINT = '/api/structure';
/** One batch may take the Worker's 60 s upstream timeout plus a retry margin. */
export const BATCH_TIMEOUT_MS = 75_000;

/** What the consent dialog and the CLI print before anything is sent (V3). */
export interface StructureSummary {
  /** Redacted step summaries to send. */
  steps: number;
  /** POSTs to make: ⌈steps / 200⌉, at most 5. */
  batches: number;
  /** Characters of summary text in all batches. */
  characters: number;
  endpoint: string;
  /** What the endpoint keeps. */
  caching: string;
}

export const CACHING_NOTE =
  'Answers (labels and step ids, never your text) are cached per batch, so sending again costs nothing.';

export function summarize(batches: readonly StructureRequest[], endpoint: string): StructureSummary {
  let characters = 0;
  for (const b of batches) for (const s of b.steps) characters += [...s.text].length;
  return { steps: batches.reduce((n, b) => n + b.steps.length, 0), batches: batches.length, characters, endpoint, caching: CACHING_NOTE };
}

/** The F11-style message for a failed pass; the map is always still usable. */
export function structureMessage(code: ProviderErrorCode, retryAfterSec?: number): string {
  switch (code) {
    case 'unavailable':
      return "AI labels aren't available here; the map still works.";
    case 'rate_limited':
      return `Too many requests right now. Try again in ${retryAfterSec ?? 60} s; the map still works.`;
    case 'budget_exhausted':
      return "Today's budget for AI labels is used up. Try again tomorrow; the map still works.";
    case 'input_too_large':
    case 'invalid_input':
    case 'prefix_too_long':
      return "This session couldn't be sent as it is, so no labels were added; the map still works.";
    case 'aborted':
      return 'Stopped. No labels were added.';
    default:
      return "The model couldn't label this session. Try again; the map still works.";
  }
}

const CODES: readonly ProviderErrorCode[] = ['invalid_input', 'prefix_too_long', 'input_too_large', 'rate_limited', 'budget_exhausted', 'upstream_error', 'unavailable'];

/** The `{error: {code}}` envelope's code, if the body is one. */
function envelopeCode(body: unknown): ProviderErrorCode | undefined {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return CODES.includes(code as ProviderErrorCode) ? (code as ProviderErrorCode) : undefined;
}

export interface PostOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * One POST. Rejects only with `ProviderError`. A network error, a 404/405, or a reply that is not the API's JSON
 * (a static host's HTML page) is `unavailable`: there is no Worker behind this site. The answer is checked against
 * the batch's ids again, so a label or link can only name a step that was sent.
 */
export async function postBatch(endpoint: string, batch: StructureRequest, opts: PostOptions = {}): Promise<StructureResponse> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? BATCH_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let res: Response;
  let body: unknown;
  try {
    res = await doFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch), signal });
    body = (res.headers.get('content-type') ?? '').includes('application/json') ? await res.json() : undefined;
  } catch {
    if (opts.signal?.aborted) throw new ProviderError('aborted', 'Stopped.');
    if (timeout.aborted) throw new ProviderError('upstream_error', 'The endpoint took too long to answer.');
    throw new ProviderError('unavailable', 'The endpoint could not be reached.');
  }
  if (!res.ok) {
    const code =
      res.status === 404 || res.status === 405
        ? 'unavailable'
        : (envelopeCode(body) ?? (res.status === 429 ? 'rate_limited' : res.status >= 500 && body !== undefined ? 'upstream_error' : 'unavailable'));
    const retry = Number(res.headers.get('retry-after'));
    throw new ProviderError(code, `HTTP ${res.status}`, code === 'rate_limited' && retry > 0 ? retry : undefined);
  }
  const model = (body as { model?: unknown } | undefined)?.model;
  const result = sanitizeResult(body, new Set(batch.steps.map((s) => s.id)));
  if (body === undefined || typeof model !== 'string' || model === '') throw new ProviderError('unavailable', 'The endpoint did not answer with labels.');
  if (!result) throw new ProviderError('upstream_error', "The endpoint's answer did not match the schema.");
  return { model, cached: (body as { cached?: unknown }).cached === true, ...result };
}

export interface SendOptions extends PostOptions {
  /** Called before each POST with the 1-based batch number. */
  onProgress?: (k: number, n: number) => void;
}

/** Sends the batches one after another and merges the answers into one overlay; stops at the first failure. */
export async function sendBatches(endpoint: string, batches: readonly StructureRequest[], opts: SendOptions = {}): Promise<LabelOverlay> {
  let overlay: LabelOverlay | undefined;
  for (const [i, batch] of batches.entries()) {
    opts.onProgress?.(i + 1, batches.length);
    overlay = mergeOverlay(overlay, await postBatch(endpoint, batch, opts));
  }
  if (!overlay) throw new ProviderError('invalid_input', 'There is nothing to send.');
  return overlay;
}
