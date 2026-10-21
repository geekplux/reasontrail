// Per-prefix KV cache (docs/llm-provider.md §6): key `nt:v1:<MODEL_ID>:<sha256hex(prefix)>`, value = the full
// K_FETCH list, 30-day TTL. Bump CACHE_VERSION when the system prompt or the parser changes.
import type { TokenChoice } from '../shared/llm/types';
import type { Ctx, KvBinding } from './env';

export const CACHE_VERSION = 'v1';
export const CACHE_TTL_SEC = 30 * 24 * 60 * 60;

/** The KV key for a prefix; the raw text never appears in the key. */
export async function cacheKey(modelId: string, prefix: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prefix));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `nt:${CACHE_VERSION}:${modelId}:${hex}`;
}

const isChoice = (v: unknown): v is TokenChoice =>
  typeof v === 'object' && v !== null && typeof (v as TokenChoice).token === 'string' && typeof (v as TokenChoice).logprob === 'number';

/** The cached list, or null on a miss; a read failure or a corrupt entry is logged and treated as a miss. */
export async function readCache(kv: KvBinding | undefined, key: string): Promise<TokenChoice[] | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isChoice)) return parsed;
    console.warn('next-tokens: ignoring malformed cache entry', key);
  } catch (err) {
    console.warn('next-tokens: cache read failed', err);
  }
  return null;
}

/** Stores the full list after the response is sent; a write failure is logged, never surfaced. */
export function writeCache(kv: KvBinding | undefined, key: string, tokens: readonly TokenChoice[], ctx: Ctx): void {
  if (!kv) return;
  ctx.waitUntil(
    kv.put(key, JSON.stringify(tokens), { expirationTtl: CACHE_TTL_SEC }).catch((err: unknown) => console.warn('next-tokens: cache write failed', err)),
  );
}
