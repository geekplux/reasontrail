// Live next tokens from the Worker's POST /api/next-tokens (docs/llm-provider.md §5). Wrap it in `CachedProvider`;
// on its own it makes one request per call.
import { normalize } from '../../shared/llm/normalize';
import { BAD_CHARS, tailPrefix } from '../../shared/llm/prefix';
import { clampK, ProviderError, type LogprobProvider, type ProviderErrorCode, type TokenChoice } from '../../shared/llm/types';

/** The website's endpoint (same origin as the page). */
export const NEXT_TOKENS_ENDPOINT = '/api/next-tokens';
/** The Worker's own upstream timeout is 10 s with one retry. */
export const NEXT_TOKENS_TIMEOUT_MS = 25_000;
/** Shown until the first answer names the model (wrangler.jsonc `MODEL_ID`). */
export const DEFAULT_LIVE_MODEL = '@cf/zai-org/glm-4.7-flash';

export interface WorkerProviderOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const CODES: readonly ProviderErrorCode[] = ['invalid_input', 'prefix_too_long', 'rate_limited', 'budget_exhausted', 'upstream_error', 'unavailable'];
const BAD_CHARS_ALL = new RegExp(BAD_CHARS.source, 'gu');

/**
 * The request body for `prefix`: NFC, control characters turned into spaces, and at most the last 1000 characters,
 * cut at a sentence or word start. 1000 code points of at most 4 UTF-8 bytes each always fit the 4 KB body limit.
 */
export function requestBody(prefix: string, k: number): string {
  return JSON.stringify({ prefix: tailPrefix(prefix.normalize('NFC').replace(BAD_CHARS_ALL, ' ')), k });
}

/** One POST per call, mapped onto the provider contract. Rejects only with `ProviderError`. */
export class WorkerProvider implements LogprobProvider {
  readonly kind = 'worker';
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  #model = DEFAULT_LIVE_MODEL;

  constructor(opts: WorkerProviderOptions = {}) {
    this.#endpoint = opts.endpoint ?? NEXT_TOKENS_ENDPOINT;
    this.#fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#timeoutMs = opts.timeoutMs ?? NEXT_TOKENS_TIMEOUT_MS;
  }

  /** The model the Worker last answered with. */
  get model(): string {
    return this.#model;
  }

  async nextTokens(prefix: string, k: number, opts?: { signal?: AbortSignal }): Promise<TokenChoice[]> {
    const n = clampK(k);
    if (opts?.signal?.aborted) throw new ProviderError('aborted', 'Stopped.');
    if (!prefix.trim()) throw new ProviderError('invalid_input', 'There is no text to continue.');
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let res: Response;
    let body: unknown;
    try {
      res = await this.#fetch(this.#endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: requestBody(prefix, n), signal });
      body = (res.headers.get('content-type') ?? '').includes('application/json') ? await res.json() : undefined;
    } catch {
      if (opts?.signal?.aborted) throw new ProviderError('aborted', 'Stopped.');
      if (timeout.aborted) throw new ProviderError('upstream_error', 'The model took too long to answer.');
      throw new ProviderError('unavailable', 'The live endpoint could not be reached.');
    }
    if (!res.ok) throw errorFor(res, body);
    const { model, tokens } = (body ?? {}) as { model?: unknown; tokens?: unknown };
    // A 200 that is not the API's JSON is a static host's page: there is no Worker behind this site.
    if (!Array.isArray(tokens)) throw new ProviderError('unavailable', 'The live endpoint did not answer with tokens.');
    const out = normalize(tokens.filter(isChoice).map((c) => ({ token: c.token, logprob: c.logprob })), n);
    if (out.length === 0) throw new ProviderError('upstream_error', 'The model answered without usable tokens.');
    if (typeof model === 'string' && model) this.#model = model;
    return out;
  }
}

function errorFor(res: Response, body: unknown): ProviderError {
  const envelope = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  const known = CODES.includes(envelope?.code as ProviderErrorCode) ? (envelope?.code as ProviderErrorCode) : undefined;
  const code: ProviderErrorCode =
    res.status === 404 || res.status === 405
      ? 'unavailable'
      : (known ??
        (res.status === 429 ? 'rate_limited' : res.status === 413 ? 'prefix_too_long' : res.status === 400 ? 'invalid_input' : res.status >= 500 && body !== undefined ? 'upstream_error' : 'unavailable'));
  const retry = Number(res.headers.get('retry-after'));
  const message = typeof envelope?.message === 'string' && envelope.message ? envelope.message : `HTTP ${res.status}`;
  return new ProviderError(code, message, code === 'rate_limited' ? (retry > 0 ? retry : 60) : undefined);
}

function isChoice(c: unknown): c is TokenChoice {
  return typeof c === 'object' && c !== null && typeof (c as TokenChoice).token === 'string' && typeof (c as TokenChoice).logprob === 'number';
}
