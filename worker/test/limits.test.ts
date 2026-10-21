import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../shared/llm/types';
import { BUDGET_TTL_SEC, budgetKey, dailyCap } from '../budget';
import type { Env } from '../env';
import { handle } from '../handler';
import { openAiCompatibleUpstream } from '../upstream/openaiCompatible';
import { workersAiUpstream } from '../upstream/workersAi';
import { completion, FakeAi, fakeCtx, fakeEnv, FakeRateLimit, post, TOP8 } from './fakes';

async function call(req: Request, env: Env) {
  const ctx = fakeCtx();
  const res = await handle(req, env, ctx);
  await ctx.settle();
  return { res, body: (await res.json()) as { error?: { code: string } } };
}
const today = budgetKey(new Date());
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

describe('rate limits (AC1)', () => {
  it('the 21st miss from one IP in a window is 429 with Retry-After: 60; other IPs and cache hits still pass', async () => {
    const env = fakeEnv();
    for (let i = 0; i < 20; i++) expect((await call(post({ prefix: `p${i}` }), env)).res.status).toBe(200);
    const { res, body } = await call(post({ prefix: 'p20' }), env);
    expect([res.status, res.headers.get('retry-after'), body.error?.code]).toEqual([429, '60', 'rate_limited']);
    expect(env.AI.calls).toHaveLength(20);
    expect((await call(post({ prefix: 'p3' }), env)).res.status).toBe(200); // hit: RL_MISS not consulted
    expect((await call(post({ prefix: 'p20' }, {}, '198.51.100.1'), env)).res.status).toBe(200);
  });

  it('RL_ALL limits every request, hits included', async () => {
    const env = fakeEnv({ RL_ALL: new FakeRateLimit(2) });
    await call(post({ prefix: 'Hi' }), env);
    expect((await call(post({ prefix: 'Hi' }), env)).res.status).toBe(200);
    expect((await call(post({ prefix: 'Hi' }), env)).res.status).toBe(429);
    expect(env.RL_MISS.counts.get('203.0.113.7')).toBe(1);
  });

  it('a failing limiter lets the request through', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = fakeEnv({ RL_ALL: { limit: () => Promise.reject(new Error('down')) } });
    expect((await call(post({ prefix: 'Hi' }), env)).res.status).toBe(200);
  });
});

describe('daily budget (AC2)', () => {
  it('counts misses only, stores budget:<UTC date> with a 2-day TTL, and is 503 budget_exhausted at the cap', async () => {
    const env = fakeEnv({ DAILY_UPSTREAM_CAP: '2' });
    await call(post({ prefix: 'a' }), env);
    await call(post({ prefix: 'a' }), env); // hit
    await call(post({ prefix: 'b' }), env);
    expect(env.TG_CACHE.store.get(today)).toEqual({ value: '2', ttl: BUDGET_TTL_SEC });
    const { res, body } = await call(post({ prefix: 'c' }), env);
    expect([res.status, body.error?.code]).toEqual([503, 'budget_exhausted']);
    expect(env.AI.calls).toHaveLength(2);
    expect((await call(post({ prefix: 'a' }), env)).res.status).toBe(200);
    expect(env.TG_CACHE.store.get(today)?.value).toBe('2');
  });

  it('a failed upstream call does not count', async () => {
    quiet();
    const env = fakeEnv({ AI: new FakeAi(() => Promise.reject(new Error('x'))) });
    expect((await call(post({ prefix: 'a' }), env)).res.status).toBe(502);
    expect(env.TG_CACHE.store.has(today)).toBe(false);
  });

  it('keys by UTC date and parses the cap', () => {
    expect(budgetKey(new Date('2026-10-20T23:30:00-05:00'))).toBe('budget:2026-10-21');
    expect([dailyCap(undefined), dailyCap('250'), dailyCap('0'), dailyCap(''), dailyCap('ten')]).toEqual([1000, 250, 0, 1000, 1000]);
  });
});

const OPENAI = { UPSTREAM: 'openai-compatible', OPENAI_BASE_URL: 'https://llm.test/v1/', OPENAI_MODEL: 'small-model', OPENAI_API_KEY: 'test-key' };
const reply = (status: number, body: unknown = completion(TOP8)) => new Response(JSON.stringify(body), { status });

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<FetchFn>(async () => responses.shift() ?? reply(200));
  vi.stubGlobal('fetch', fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe('openai-compatible upstream (AC3, AC4)', () => {
  it.each(['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'])('503 unavailable without %s, and no fetch', async (missing) => {
    const fetch = mockFetch();
    const { res, body } = await call(post({ prefix: 'Hi' }), fakeEnv({ ...OPENAI, [missing]: undefined }));
    expect([res.status, body.error?.code]).toEqual([503, 'unavailable']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs the chat body with a bearer key and parses into the same response as Workers AI', async () => {
    const fetch = mockFetch(reply(200));
    const env = fakeEnv(OPENAI);
    const { res, body } = await call(post({ prefix: 'The door opened and', k: 3 }), env);
    expect([res.status, body]).toEqual([200, { model: 'small-model', k: 3, cached: false, tokens: TOP8.slice(0, 3) }]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://llm.test/v1/chat/completions');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'small-model', max_tokens: 1, logprobs: true, top_logprobs: 8, temperature: 0 });
    expect(env.AI.calls).toHaveLength(0);
  });

  it('retries a 5xx once', async () => {
    const fetch = mockFetch(reply(503), reply(200));
    expect((await call(post({ prefix: 'Hi' }), fakeEnv(OPENAI))).res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('two 5xx give 502 upstream_error; a 4xx is not retried', async () => {
    quiet();
    const twice = mockFetch(reply(500), reply(502), reply(200));
    expect((await call(post({ prefix: 'Hi' }), fakeEnv(OPENAI))).body.error?.code).toBe('upstream_error');
    expect(twice).toHaveBeenCalledTimes(2);
    const once = mockFetch(reply(401), reply(200));
    expect((await call(post({ prefix: 'Hi' }), fakeEnv(OPENAI))).res.status).toBe(502);
    expect(once).toHaveBeenCalledTimes(1);
  });

  it('a timeout is upstream_error, for both upstreams, and is not retried', async () => {
    quiet();
    const hang = vi.fn<FetchFn>((_url, init) => new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))));
    vi.stubGlobal('fetch', hang);
    const openai = openAiCompatibleUpstream({ baseUrl: 'https://llm.test/v1', apiKey: 'k', model: 'm' }, 20);
    await expect(openai.nextTokens('Hi')).rejects.toMatchObject({ code: 'upstream_error', message: expect.stringContaining('too long') });
    expect(hang).toHaveBeenCalledTimes(1);
    const ai = workersAiUpstream(new FakeAi(() => new Promise(() => {})), 'm', 20);
    await expect(ai.nextTokens('Hi')).rejects.toBeInstanceOf(ProviderError);
  });
});
