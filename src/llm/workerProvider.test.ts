import { describe, expect, it, vi } from 'vitest';
import { MAX_BODY_BYTES, MAX_PREFIX_CHARS, tailPrefix } from '../../shared/llm/prefix';
import { ProviderError, type ProviderErrorCode } from '../../shared/llm/types';
import { providerContract } from './providerContract';
import { requestBody, WorkerProvider } from './workerProvider';

const TOKENS = [' a', ' b', ' c', ' d', ' e', ' f', ' g', ' h'].map((token, i) => ({ token, logprob: -0.5 - i * 0.4 }));
const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A fake Worker: echoes the top-k like the real one, honours abort. */
function fakeFetch(reply?: (req: { prefix: string; k: number }) => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const req = JSON.parse(String(init?.body)) as { prefix: string; k: number };
    return reply ? reply(req) : jsonRes({ model: '@cf/test/model', k: req.k, cached: false, tokens: TOKENS.slice(0, req.k) });
  });
}

const make = () => new WorkerProvider({ fetch: fakeFetch() });
providerContract('WorkerProvider (fake fetch)', make, ['The cat', 'The cat sat on the']);

const failWith = async (res: () => Response | Promise<Response>) => {
  const err = await new WorkerProvider({ fetch: fakeFetch(res) }).nextTokens('The cat', 5).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  return err as ProviderError;
};
const envelope = (code: string) => ({ error: { code, message: `server says ${code}` } });

describe('WorkerProvider', () => {
  it('POSTs {prefix, k} to /api/next-tokens and learns the model from the answer', async () => {
    const f = fakeFetch();
    const p = new WorkerProvider({ fetch: f });
    expect(p.model).toBe('@cf/zai-org/glm-4.7-flash');
    expect(await p.nextTokens('The cat', 2)).toEqual(TOKENS.slice(0, 2));
    expect(f).toHaveBeenCalledWith('/api/next-tokens', expect.objectContaining({ method: 'POST', body: '{"prefix":"The cat","k":2}' }));
    expect(p.model).toBe('@cf/test/model');
  });

  it('normalizes the answer: drops bad entries, merges duplicates, sorts, slices', async () => {
    const tokens = [{ token: ' x', logprob: -2 }, { token: '', logprob: -0.1 }, { token: ' y', logprob: -1 }, { token: ' x', logprob: -2 }, { nope: 1 }];
    const out = await new WorkerProvider({ fetch: fakeFetch(() => jsonRes({ model: 'm', tokens })) }).nextTokens('The cat', 5);
    expect(out.map((c) => c.token)).toEqual([' y', ' x']);
    expect(out[1]!.logprob).toBeCloseTo(-2 + Math.log(2), 6);
  });

  it.each<[string, () => Response, ProviderErrorCode]>([
    ['400 envelope', () => jsonRes(envelope('invalid_input'), 400), 'invalid_input'],
    ['413 envelope', () => jsonRes(envelope('prefix_too_long'), 413), 'prefix_too_long'],
    ['503 budget', () => jsonRes(envelope('budget_exhausted'), 503), 'budget_exhausted'],
    ['503 unavailable', () => jsonRes(envelope('unavailable'), 503), 'unavailable'],
    ['502 upstream', () => jsonRes(envelope('upstream_error'), 502), 'upstream_error'],
    ['500 JSON without envelope', () => jsonRes({}, 500), 'upstream_error'],
    ['404 static host', () => new Response('<html>', { status: 404, headers: { 'content-type': 'text/html' } }), 'unavailable'],
    ['405', () => jsonRes(envelope('invalid_input'), 405), 'unavailable'],
    ['200 HTML page', () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }), 'unavailable'],
    ['200 with no usable tokens', () => jsonRes({ model: 'm', tokens: [{ token: '<|eot|>', logprob: -0.1 }] }), 'upstream_error'],
    ['unknown envelope code', () => jsonRes(envelope('session_limit'), 400), 'invalid_input'],
  ])('%s -> %s', async (_name, res, code) => {
    expect((await failWith(res)).code).toBe(code);
  });

  it('carries Retry-After on 429 (60 s when missing)', async () => {
    expect(await failWith(() => jsonRes(envelope('rate_limited'), 429, { 'retry-after': '7' }))).toMatchObject({ code: 'rate_limited', retryAfterSec: 7 });
    expect(await failWith(() => new Response('', { status: 429 }))).toMatchObject({ code: 'rate_limited', retryAfterSec: 60 });
  });

  it('maps a network failure to unavailable, a timeout to upstream_error and a caller abort to aborted', async () => {
    expect((await failWith(() => Promise.reject(new TypeError('Failed to fetch')))).code).toBe('unavailable');
    const hang = (_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const slow = await new WorkerProvider({ fetch: hang, timeoutMs: 5 }).nextTokens('The cat', 5).catch((e: unknown) => e);
    expect(slow).toMatchObject({ code: 'upstream_error' });
    const c = new AbortController();
    const pending = new WorkerProvider({ fetch: hang }).nextTokens('The cat', 5, { signal: c.signal }).catch((e: unknown) => e);
    c.abort();
    expect(await pending).toMatchObject({ code: 'aborted' });
  });

  it('rejects a blank prefix without a request', async () => {
    const f = fakeFetch();
    await expect(new WorkerProvider({ fetch: f }).nextTokens('  ', 5)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('long prefixes', () => {
  const sentence = (i: number) => `Sentence number ${i} is here.`;
  const long = Array.from({ length: 60 }, (_, i) => sentence(i)).join(' ');

  it('keep the last 1000 characters, starting at a sentence', () => {
    const out = tailPrefix(long);
    expect([...out].length).toBeLessThanOrEqual(MAX_PREFIX_CHARS);
    expect(long.endsWith(out)).toBe(true);
    expect(out).toMatch(/^Sentence number \d+ is here\./);
  });

  it('fall back to a word start, then to a hard cut', () => {
    const words = 'word '.repeat(300) + 'end';
    expect(tailPrefix(words)).toMatch(/^word /);
    expect(tailPrefix('x'.repeat(1200))).toBe('x'.repeat(1000));
    expect(tailPrefix('short')).toBe('short');
  });

  it('fit the Worker body limit, with controls replaced and NFC applied', () => {
    const emoji = '🌱'.repeat(1200);
    const body = requestBody(emoji, 5);
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(MAX_BODY_BYTES);
    expect(emoji.endsWith((JSON.parse(body) as { prefix: string }).prefix)).toBe(true);
    expect(JSON.parse(requestBody('a\u0007b é', 3))).toEqual({ prefix: 'a b é', k: 3 });
  });
});
