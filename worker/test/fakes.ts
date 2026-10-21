// In-memory stand-ins for the Worker bindings (PLAN D3).
import type { TokenChoice } from '../../shared/llm/types';
import type { AiBinding, Ctx, Env, KvBinding } from '../env';

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

export function fakeEnv(overrides: Partial<Env> = {}): Env & { AI: FakeAi; TG_CACHE: FakeKv } {
  return { AI: new FakeAi(() => completion(TOP8)), TG_CACHE: new FakeKv(), MODEL_ID: '@cf/zai-org/glm-4.7-flash', UPSTREAM: 'workers-ai', ...overrides } as Env & {
    AI: FakeAi;
    TG_CACHE: FakeKv;
  };
}

export const TOP8: TokenChoice[] = [' looked', ' stepped', ' saw', ' found', ' froze', ' stared', ' felt', ' heard'].map((token, i) => ({
  token,
  logprob: -0.5 - i * 0.4,
}));

/** A request to the endpoint; `body` is JSON-encoded unless it is already a string. */
export function post(body: unknown, init: RequestInit = {}): Request {
  return new Request('https://garden.test/api/next-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}
