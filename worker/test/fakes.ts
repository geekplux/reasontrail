// In-memory stand-ins for the Worker bindings (PLAN D3).
import type { TokenChoice } from '../../shared/llm/types';
import type { AiBinding, Ctx, Env, KvBinding, RateLimitBinding } from '../env';

export class FakeKv implements KvBinding {
  readonly store = new Map<string, { value: string; ttl: number | undefined }>();
  failPut = false;
  async get(key: string) {
    return this.store.get(key)?.value ?? null;
  }
  async put(key: string, value: string, options?: { expirationTtl?: number }) {
    if (this.failPut) throw new Error('KV write quota exceeded');
    this.store.set(key, { value, ttl: options?.expirationTtl });
  }
}

/** A fixed-window limiter that never resets (one window per test). */
export class FakeRateLimit implements RateLimitBinding {
  readonly counts = new Map<string, number>();
  constructor(private readonly max: number) {}
  async limit({ key }: { key: string }) {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return { success: n <= this.max };
  }
}

export class FakeAi implements AiBinding {
  readonly calls: Array<{ model: string; inputs: Record<string, unknown> }> = [];
  constructor(private readonly respond: () => unknown) {}
  async run(model: string, inputs: Record<string, unknown>) {
    this.calls.push({ model, inputs });
    return this.respond();
  }
}

/** An OpenAI-shaped completion whose first position is `top[0]` with the given alternatives. */
export function completion(top: readonly TokenChoice[]): unknown {
  const content = top.length ? [{ token: top[0]!.token, logprob: top[0]!.logprob, top_logprobs: top }] : [];
  return { choices: [{ index: 0, message: { role: 'assistant', content: top[0]?.token ?? '' }, logprobs: { content } }] };
}

/** A context whose `waitUntil` promises can be awaited with `settle()`. */
export function fakeCtx(): Ctx & { settle(): Promise<unknown> } {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (p) => void pending.push(p), settle: () => Promise.all(pending) };
}

type FakeEnv = Env & { AI: FakeAi; TG_CACHE: FakeKv; RL_ALL: FakeRateLimit; RL_MISS: FakeRateLimit };

/** Bindings as in wrangler.jsonc: Workers AI upstream, KV, RL_ALL 120 and RL_MISS 20 per window. */
export function fakeEnv(overrides: Partial<Env> = {}): FakeEnv {
  const base = { AI: new FakeAi(() => completion(TOP8)), TG_CACHE: new FakeKv(), RL_ALL: new FakeRateLimit(120), RL_MISS: new FakeRateLimit(20) };
  return { ...base, MODEL_ID: '@cf/zai-org/glm-4.7-flash', UPSTREAM: 'workers-ai', ...overrides } as FakeEnv;
}

export const TOP8: TokenChoice[] = [' looked', ' stepped', ' saw', ' found', ' froze', ' stared', ' felt', ' heard'].map((token, i) => ({
  token,
  logprob: -0.5 - i * 0.4,
}));

/** A request to the endpoint; `body` is JSON-encoded unless it is already a string. */
export function post(body: unknown, init: RequestInit = {}, ip = '203.0.113.7'): Request {
  return new Request('https://garden.test/api/next-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}
