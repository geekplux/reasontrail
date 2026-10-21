// Request validation for POST /api/next-tokens (docs/llm-provider.md §5 limits).
import { K_MAX, ProviderError } from '../shared/llm/types';

export const MAX_BODY_BYTES = 4096;
export const MAX_PREFIX_CHARS = 1000;
export const DEFAULT_K = 5;

// C0/C1 controls except \t and \n, plus lone surrogates (they would hash and display as U+FFFD).
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const BAD_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]|\p{Cs}/u;

export interface NextTokensRequest {
  prefix: string;
  k: number;
}

const invalid = (message: string) => new ProviderError('invalid_input', message);
const tooLong = (message: string) => new ProviderError('prefix_too_long', message);

/** Reads and checks the body; rejects with `invalid_input` (400) or `prefix_too_long` (413). */
export async function parseNextTokensRequest(request: Request): Promise<NextTokensRequest> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) throw invalid('Send a JSON body (Content-Type: application/json).');
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw tooLong(`The request body must be at most ${MAX_BODY_BYTES} bytes.`);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) throw tooLong(`The request body must be at most ${MAX_BODY_BYTES} bytes.`);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw invalid('The request body is not valid JSON.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('The request body must be a JSON object.');
  const { prefix: rawPrefix, k: rawK } = body as { prefix?: unknown; k?: unknown };
  if (typeof rawPrefix !== 'string') throw invalid('`prefix` must be a string.');
  const prefix = rawPrefix.normalize('NFC');
  const chars = [...prefix].length;
  if (chars === 0) throw invalid('`prefix` must not be empty.');
  if (chars > MAX_PREFIX_CHARS) throw tooLong(`\`prefix\` must be at most ${MAX_PREFIX_CHARS} characters.`);
  if (BAD_CHARS.test(prefix)) throw invalid('`prefix` contains control characters.');
  const k = rawK === undefined ? DEFAULT_K : rawK;
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 1 || k > K_MAX) throw invalid(`\`k\` must be an integer from 1 to ${K_MAX}.`);
  return { prefix, k };
}
