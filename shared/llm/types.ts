// Provider interface shared by the app, the Worker client and the recorder (docs/llm-provider.md §3, PLAN D4).
// No DOM types here beyond `AbortSignal`, which Workers and Node also provide.

/** One next-token choice. */
export interface TokenChoice {
  /** Decoded token text, verbatim: may start with a space, never empty. */
  token: string;
  /** Natural-log probability, always <= 0. */
  logprob: number;
}

/** Why a provider could not answer; the UI maps each code to one calm, specific state. */
export type ProviderErrorCode =
  /** The recording has no data for this prefix (RecordedProvider only). */
  | 'not_recorded'
  /** Empty prefix, bad characters, or k out of range. */
  | 'invalid_input'
  /** The prefix exceeds the length limit. */
  | 'prefix_too_long'
  /** Too many requests; see `ProviderError.retryAfterSec`. */
  | 'rate_limited'
  /** The daily upstream budget is spent. */
  | 'budget_exhausted'
  /** The model call failed or returned no logprobs. */
  | 'upstream_error'
  /** Live mode is not configured, or the browser is offline. */
  | 'unavailable'
  /** The caller aborted the request through its `AbortSignal`. */
  | 'aborted';

/** The only error type a `LogprobProvider` rejects with. */
export class ProviderError extends Error {
  /** Machine-readable reason. */
  readonly code: ProviderErrorCode;
  /** Seconds to wait before retrying; set for `rate_limited`. */
  readonly retryAfterSec: number | undefined;

  /** @param code machine-readable reason @param message human-readable detail @param retryAfterSec for `rate_limited` */
  constructor(code: ProviderErrorCode, message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Largest k any provider serves; requests are clamped to `[1, K_MAX]`. */
export const K_MAX = 8;

/** Clamps a requested k to `[1, K_MAX]` (fractions round down); non-finite k is `invalid_input`. */
export function clampK(k: number): number {
  if (!Number.isFinite(k)) throw new ProviderError('invalid_input', `k must be a finite number, got ${k}`);
  return Math.min(K_MAX, Math.max(1, Math.floor(k)));
}

/** A source of next-token distributions; its executable spec is `src/llm/providerContract.ts`. */
export interface LogprobProvider {
  /** Where the distributions come from: a committed recording, the Worker, or an in-browser model. */
  readonly kind: 'recorded' | 'worker' | 'browser';
  /** Model id, e.g. "@cf/zai-org/glm-4.7-flash". */
  readonly model: string;
  /**
   * Top-k next tokens after `prefix` (prompt + chosen continuation): sorted by logprob descending,
   * deduplicated by token, length <= k with k clamped to `[1, K_MAX]`, deterministic for the same `(prefix, k)`.
   * Rejects only with `ProviderError`.
   */
  nextTokens(prefix: string, k: number, opts?: { signal?: AbortSignal }): Promise<TokenChoice[]>;
}
