// The JSON envelope for every /api response (docs/llm-provider.md §5).
import { ProviderError, type ProviderErrorCode } from '../shared/llm/types';

const STATUS: Record<ProviderErrorCode, number> = {
  invalid_input: 400,
  prefix_too_long: 413,
  rate_limited: 429,
  budget_exhausted: 503,
  unavailable: 503,
  upstream_error: 502,
  not_recorded: 500,
  aborted: 499,
};

const BASE_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

/** A JSON response with the API's standard headers. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

/** `{error: {code, message}}` with the status for `code` (or an explicit one, e.g. 404/405). */
export function errorResponse(code: ProviderErrorCode, message: string, status = STATUS[code], headers: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, headers);
}

/** Maps anything thrown inside the handler to a response; only `ProviderError` messages reach the client. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ProviderError) {
    const retry = err.retryAfterSec === undefined ? {} : { 'retry-after': String(err.retryAfterSec) };
    return errorResponse(err.code, err.message, STATUS[err.code], retry);
  }
  console.error('next-tokens: unexpected error', err);
  return errorResponse('upstream_error', 'Something went wrong while growing this branch.', 500);
}
