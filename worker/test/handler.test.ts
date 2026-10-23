import { describe, expect, it, vi } from 'vitest';
import { cacheKey, CACHE_TTL_SEC } from '../cache';
import { handle } from '../handler';
import { SYSTEM_PROMPT } from '../upstream/chat';
import { completion, FakeAi, fakeCtx, fakeEnv, post, TOP8 } from './fakes';

const MODEL = '@cf/zai-org/glm-4.7-flash';

async function call(req: Request, env = fakeEnv()) {
  const ctx = fakeCtx();
  const res = await handle(req, env, ctx);
  await ctx.settle();
  return { res, body: (await res.json()) as Record<string, unknown>, env };
}

const errorCode = (body: Record<string, unknown>) => (body.error as { code: string }).code;

describe('POST /api/next-tokens', () => {
  it('200 on a miss: calls Workers AI once with the documented params and stores the full list in KV', async () => {
    const { res, body, env } = await call(post({ prefix: 'The door opened and', k: 3 }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({ model: MODEL, k: 3, cached: false, tokens: TOP8.slice(0, 3) });
    expect(env.AI.calls).toHaveLength(1);
    expect(env.AI.calls[0]).toEqual({
      model: MODEL,
      inputs: expect.objectContaining({
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: 'The door opened and' }],
        max_tokens: 1, logprobs: true, top_logprobs: 8, temperature: 0, chat_template_kwargs: { enable_thinking: false },
      }),
    });
    const entry = env.TG_CACHE.store.get(await cacheKey(MODEL, 'The door opened and'));
    expect(entry?.ttl).toBe(CACHE_TTL_SEC);
    expect(JSON.parse(entry!.value)).toEqual(TOP8);
  });

  it('200 on a hit: cached:true, AI not called, and a smaller k is sliced from the cached 8', async () => {
    const env = fakeEnv();
    await call(post({ prefix: 'Once upon', k: 8 }), env);
    const { res, body } = await call(post({ prefix: 'Once upon', k: 2 }), env);
    expect(res.status).toBe(200);
    expect(body).toEqual({ model: MODEL, k: 2, cached: true, tokens: TOP8.slice(0, 2) });
    expect(env.AI.calls).toHaveLength(1);
  });

  it('defaults k to 5, keys the cache by a SHA-256 hash and NFC-normalizes the prefix', async () => {
    const env = fakeEnv();
    const { body } = await call(post({ prefix: 'café' }), env);
    expect((body.tokens as unknown[]).length).toBe(5);
    const key = [...env.TG_CACHE.store.keys()].find((k) => k.startsWith('nt:'));
    expect(key).toMatch(/^nt:v1:@cf\/zai-org\/glm-4\.7-flash:[0-9a-f]{64}$/);
    expect(key).toBe(await cacheKey(MODEL, 'café'));
  });

  it('a KV write failure is logged, not surfaced', async () => {
    const env = fakeEnv();
    env.TG_CACHE.failPut = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { res } = await call(post({ prefix: 'Hello' }), env);
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith('cache: write failed', expect.any(Error));
    warn.mockRestore();
  });

  it.each([
    ['empty prefix', { prefix: '' }],
    ['missing prefix', { k: 3 }],
    ['non-string prefix', { prefix: 42 }],
    ['control character', { prefix: 'bell\u0007' }],
    ['lone surrogate', { prefix: 'x\ud800' }],
    ['k = 0', { prefix: 'Hi', k: 0 }],
    ['k = 9', { prefix: 'Hi', k: 9 }],
    ['fractional k', { prefix: 'Hi', k: 2.5 }],
    ['string k', { prefix: 'Hi', k: '3' }],
    ['array body', [1, 2]],
  ])('400 invalid_input: %s', async (_name, payload) => {
    const { res, body, env } = await call(post(payload));
    expect(res.status).toBe(400);
    expect(errorCode(body)).toBe('invalid_input');
    expect(env.AI.calls).toHaveLength(0);
  });

  it('400 for malformed JSON or a non-JSON content type; tab and newline are allowed', async () => {
    expect((await call(post('{"prefix":'))).res.status).toBe(400);
    expect((await call(post({ prefix: 'Hi' }, { headers: { 'content-type': 'text/plain' } }))).res.status).toBe(400);
    expect((await call(post({ prefix: 'line one\n\tline two' }))).res.status).toBe(200);
  });

  it('413 prefix_too_long for more than 1000 characters or a body over 4 KB', async () => {
    expect((await call(post({ prefix: 'a'.repeat(1000) }))).res.status).toBe(200);
    const long = await call(post({ prefix: 'a'.repeat(1001) }));
    expect([long.res.status, errorCode(long.body)]).toEqual([413, 'prefix_too_long']);
    const big = await call(post({ prefix: 'Hi', pad: 'x'.repeat(4100) }));
    expect([big.res.status, errorCode(big.body)]).toEqual([413, 'prefix_too_long']);
  });

  it('405 with Allow: POST for other methods', async () => {
    const { res, body } = await call(new Request('https://garden.test/api/next-tokens'));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(body).toHaveProperty('error.message');
  });

  it.each([
    ['null logprobs', { choices: [{ message: { content: 'x' }, logprobs: null }] }],
    ['empty logprobs', completion([])],
    ['no choices', { response: 'hello' }],
    ['thinking token first', completion([{ token: '<think>', logprob: -0.01 }, ...TOP8])],
    ['only special tokens', completion([{ token: '<|endoftext|>', logprob: -0.1 }, { token: '', logprob: -2 }])],
  ])('502 upstream_error: %s, and nothing is cached', async (_name, response) => {
    const env = fakeEnv({ AI: new FakeAi(() => response) });
    const { res, body } = await call(post({ prefix: 'Hi' }), env);
    expect([res.status, errorCode(body)]).toEqual([502, 'upstream_error']);
    expect(env.TG_CACHE.store.size).toBe(0);
  });

  it('502 when the AI call throws, without leaking the upstream message', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = fakeEnv({ AI: new FakeAi(() => Promise.reject(new Error('secret upstream detail'))) });
    const { res, body } = await call(post({ prefix: 'Hi' }), env);
    expect(res.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain('secret upstream detail');
    err.mockRestore();
  });

  it('503 unavailable when the AI binding is missing or the upstream is not supported', async () => {
    const noAi = await call(post({ prefix: 'Hi' }), { ...fakeEnv(), AI: undefined } as never);
    expect([noAi.res.status, errorCode(noAi.body)]).toEqual([503, 'unavailable']);
    const other = await call(post({ prefix: 'Hi' }), fakeEnv({ UPSTREAM: 'somewhere-else' }));
    expect(other.res.status).toBe(503);
  });

  it('404 for unknown /api paths; other paths go to the static assets', async () => {
    expect((await call(new Request('https://garden.test/api/nope', { method: 'POST' }))).res.status).toBe(404);
    const assets = { fetch: vi.fn<(r: Request) => Promise<Response>>(async () => new Response('<html>', { status: 200 })) };
    const res = await handle(new Request('https://garden.test/garden'), fakeEnv({ ASSETS: assets }), fakeCtx());
    expect([res.status, await res.text()]).toEqual([200, '<html>']);
  });
});
