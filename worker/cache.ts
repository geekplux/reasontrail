// Per-prefix KV cache (docs/llm-provider.md §6): key `nt:v1:<MODEL_ID>:<sha256hex(prefix)>`, value = the full
// K_FETCH list, 30-day TTL. Bump CACHE_VERSION when the system prompt or the parser changes.
import type { TokenChoice } from '../shared/llm/types';
import type { Ctx, KvBinding } from './env';

export const CACHE_VERSION = 'v1';
export const CACHE_TTL_SEC = 30 * 24 * 60 * 60;

/** Lower-case hex SHA-256 of the UTF-8 text. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The KV key for a prefix; the raw text never appears in the key. */
export async function cacheKey(modelId: string, prefix: string): Promise<string> {
  return `nt:${CACHE_VERSION}:${modelId}:${await sha256Hex(prefix)}`;
}

const isChoice = (v: unknown): v is TokenChoice =>
  typeof v === 'object' && v !== null && typeof (v as TokenChoice).token === 'string' && typeof (v as TokenChoice).logprob === 'number';

/** The cached JSON value accepted by `check` (which may clean it), or null on a miss; a read failure or a corrupt
 * entry is logged and treated as a miss. */
export async function readJson<T>(kv: KvBinding | undefined, key: string, check: (v: unknown) => T | null): Promise<T | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (raw === null) return null;
    const value = check(JSON.parse(raw));
    if (value !== null) return value;
    console.warn('cache: ignoring malformed entry', key);
  } catch (err) {
    console.warn('cache: read failed', err);
  }
  return null;
}

/** Stores a JSON value after the response is sent; a write failure is logged, never surfaced. */
export function writeJson(kv: KvBinding | undefined, key: string, value: unknown, ctx: Ctx): void {
  if (!kv) return;
  ctx.waitUntil(kv.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_SEC }).catch((err: unknown) => console.warn('cache: write failed', err)));
}

/** The cached token list, or null on a miss. */
export const readCache = (kv: KvBinding | undefined, key: string): Promise<TokenChoice[] | null> =>
  readJson(kv, key, (v) => (Array.isArray(v) && v.length > 0 && v.every(isChoice) ? v : null));

/** Stores the full token list. */
export const writeCache = (kv: KvBinding | undefined, key: string, tokens: readonly TokenChoice[], ctx: Ctx): void => writeJson(kv, key, tokens, ctx);
