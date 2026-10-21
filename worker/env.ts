// Hand-written Worker bindings (PLAN D13). Minimal structural types so tests can pass plain fakes;
// the real bindings from wrangler.jsonc satisfy them. Every binding is optional because a misconfigured
// deployment must answer with a clear 503 rather than crash.

/** Workers AI binding (`ai.binding = "AI"`). */
export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/** The subset of a KV namespace the cache uses (`TG_CACHE`). */
export interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  AI?: AiBinding;
  TG_CACHE?: KvBinding;
  /** Static assets (`./dist`), served for every non-API path. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Upstream model id, e.g. "@cf/zai-org/glm-4.7-flash". */
  MODEL_ID?: string;
  /** Which upstream answers cache misses; phase 8 supports "workers-ai". */
  UPSTREAM?: string;
}

/** The part of `ExecutionContext` the handler uses. */
export interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}
