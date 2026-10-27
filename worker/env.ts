// Hand-written Worker bindings. Minimal structural types so tests can pass plain fakes;
// the real bindings from wrangler.jsonc satisfy them. Every binding is optional because a misconfigured
// deployment must answer with a clear 503 rather than crash.

/** Workers AI binding (`ai.binding = "AI"`). */
export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
}

/** The subset of a KV namespace the cache uses (`TG_CACHE`). */
export interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** A Workers Rate Limiting binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  AI?: AiBinding;
  TG_CACHE?: KvBinding;
  /** Static assets (`./dist`), served for every non-API path. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Upstream model id, e.g. "@cf/zai-org/glm-4.7-flash". */
  MODEL_ID?: string;
  /** Which upstream answers cache misses: "workers-ai" (default) or "openai-compatible". */
  UPSTREAM?: string;
  /** Per-IP limit on every /api request (120 per 60 s). */
  RL_ALL?: RateLimitBinding;
  /** Per-IP limit checked only before an upstream call (20 per 60 s). */
  RL_MISS?: RateLimitBinding;
  /** Upstream calls allowed per UTC day across all users (default 1000). */
  DAILY_UPSTREAM_CAP?: string;
  /** For UPSTREAM=openai-compatible: base URL (e.g. "https://api.openai.com/v1"), model and secret key. */
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_API_KEY?: string;
}

/** The part of `ExecutionContext` the handler uses. */
export interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}
