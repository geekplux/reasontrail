// Request validation for POST /api/next-tokens (docs/llm-provider.md §5 limits).
import { BAD_CHARS, MAX_BODY_BYTES, MAX_PREFIX_CHARS } from '../shared/llm/prefix';
import { K_MAX, ProviderError } from '../shared/llm/types';

export { BAD_CHARS, MAX_BODY_BYTES, MAX_PREFIX_CHARS };
export const DEFAULT_K = 5;

export interface NextTokensRequest {
  prefix: string;
  k: number;
}

export const invalid = (message: string) => new ProviderError('invalid_input', message);
const tooLong = (message: string) => new ProviderError('prefix_too_long', message);

/** Reads a JSON object body of at most `maxBytes`; rejects with `invalid_input` (400) or `tooLarge` (413). */
export async function readJsonObject(request: Request, maxBytes: number, tooLarge: (message: string) => ProviderError): Promise<Record<string, unknown>> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) throw invalid('Send a JSON body (Content-Type: application/json).');
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw tooLarge(`The request body must be at most ${maxBytes} bytes.`);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw tooLarge(`The request body must be at most ${maxBytes} bytes.`);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw invalid('The request body is not valid JSON.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('The request body must be a JSON object.');
  return body as Record<string, unknown>;
}

/** Reads and checks the body; rejects with `invalid_input` (400) or `prefix_too_long` (413). */
export async function parseNextTokensRequest(request: Request): Promise<NextTokensRequest> {
  const body = await readJsonObject(request, MAX_BODY_BYTES, tooLong);
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
