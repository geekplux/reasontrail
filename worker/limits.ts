// Per-IP rate limits (docs/llm-provider.md §6): RL_ALL on every request, RL_MISS only before an upstream call.
import { ProviderError } from '../shared/llm/types';
import type { RateLimitBinding } from './env';

export const RETRY_AFTER_SEC = 60;

/** The rate-limit key: the client IP Cloudflare reports (absent only outside Cloudflare, e.g. in tests). */
export const clientKey = (request: Request): string => request.headers.get('cf-connecting-ip') ?? 'unknown';

/** Rejects with 429 `rate_limited` (Retry-After: 60) over the limit; a missing or failing binding lets the request through. */
export async function enforceLimit(limiter: RateLimitBinding | undefined, key: string): Promise<void> {
  if (!limiter) return;
  let success = true;
  try {
    ({ success } = await limiter.limit({ key }));
  } catch (err) {
    console.warn('next-tokens: rate limiter failed', err);
  }
  if (!success) throw new ProviderError('rate_limited', 'Too many requests. Wait a minute, then try again.', RETRY_AFTER_SEC);
}
