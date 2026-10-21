// Shared by every chat-completions upstream (docs/llm-provider.md §5): the prompt and request body, the response
// parser, and the call policy (10 s timeout, one retry on 5xx, never on 4xx or a timeout).
import { isThinkingToken, K_FETCH, normalize } from '../../shared/llm/normalize';
import { parseOpenAiLogprobs } from '../../shared/llm/parseOpenAiLogprobs';
import { ProviderError, type TokenChoice } from '../../shared/llm/types';

export const SYSTEM_PROMPT =
  "You continue text. Reply with only the next words that continue the user's text exactly where it stops, with no preamble or quotes.";
export const UPSTREAM_TIMEOUT_MS = 10_000;

/** A model source for cache misses; `model` (part of the cache key) is undefined when it is not configured. */
export interface Upstream {
  readonly model: string | undefined;
  /** The normalized top-K_FETCH next tokens; rejects only with `ProviderError`. */
  nextTokens(prefix: string): Promise<TokenChoice[]>;
}

export const notConfigured = () => new ProviderError('unavailable', 'Live mode is not configured on this server.');

/** The OpenAI-style chat body for a prefix: the first token only, with top-K_FETCH logprobs. */
export function chatBody(prefix: string): Record<string, unknown> {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prefix },
    ],
    max_tokens: 1,
    logprobs: true,
    top_logprobs: K_FETCH,
    temperature: 0,
  };
}

/** Parses `choices[0].logprobs.content[0].top_logprobs`; rejects thinking-first and special-only answers. */
export function tokensFromCompletion(response: unknown): TokenChoice[] {
  const first = parseOpenAiLogprobs(response);
  if (isThinkingToken(first.token) || isThinkingToken(first.top[0]?.token ?? '')) {
    throw new ProviderError('upstream_error', 'The model started thinking instead of continuing the text.');
  }
  const tokens = normalize(first.top, K_FETCH);
  if (tokens.length === 0) throw new ProviderError('upstream_error', 'The model returned only special tokens.');
  return tokens;
}

/** Thrown by an attempt for an answer worth exactly one retry (HTTP 5xx). */
export class RetryableError extends Error {}

/**
 * Runs `attempt` with a fresh timeout signal; retries once on `RetryableError`. Anything other than a
 * `ProviderError` becomes `upstream_error` (502) and is logged, so upstream details never reach the client.
 */
export async function callUpstream<T>(name: string, attempt: (signal: AbortSignal) => Promise<T>, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<T> {
  for (let tries = 1; ; tries++) {
    const signal = AbortSignal.timeout(timeoutMs);
    const timedOut = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    try {
      return await Promise.race([attempt(signal), timedOut]);
    } catch (err) {
      if (err instanceof RetryableError && tries < 2) continue;
      if (err instanceof ProviderError) throw err;
      console.error(`next-tokens: ${name} call failed`, err);
      throw new ProviderError(
        'upstream_error',
        signal.aborted ? 'The model took too long to answer. Try again in a moment.' : 'The model could not be reached. Try again in a moment.',
      );
    }
  }
}
