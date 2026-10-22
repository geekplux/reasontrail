import { describe, expect, it, vi } from 'vitest';
import { ProviderError, type LogprobProvider, type TokenChoice } from '../../shared/llm/types';
import type { SampleGarden } from '../samples/types';
import tiny from '../test/fixtures/tiny-garden.json';
import { CachedProvider, LIVE_K, LIVE_MAX_CALLS, LIVE_MAX_DEPTH, liveProvider } from './cachedProvider';
import { providerMessage } from './messages';
import { providerContract } from './providerContract';
import { RecordedProvider } from './recordedProvider';

const garden = tiny as SampleGarden;
providerContract('CachedProvider(RecordedProvider)', () => new CachedProvider(new RecordedProvider(garden)), [garden.prompt, `${garden.prompt} mat`]);

const TOKENS: TokenChoice[] = [' a', ' b', ' c', ' d', ' e', ' f', ' g', ' h'].map((token, i) => ({ token, logprob: -0.5 - i * 0.4 }));

/** A counting inner provider; `gate` holds answers until released. */
function counting(opts: { gate?: Promise<void>; fail?: boolean; size?: number } = {}) {
  const calls: { prefix: string; k: number; signal: AbortSignal | undefined }[] = [];
  const inner: LogprobProvider = {
    kind: 'worker',
    model: 'fake',
    async nextTokens(prefix, k, o) {
      calls.push({ prefix, k, signal: o?.signal });
      await opts.gate;
      if (o?.signal?.aborted) throw new ProviderError('aborted', 'Stopped.');
      if (opts.fail) throw new ProviderError('upstream_error', 'boom');
      return TOKENS.slice(0, Math.min(k, opts.size ?? 8));
    },
  };
  return { inner, calls };
}

describe('CachedProvider', () => {
  it('exports the live caps', () => {
    expect([LIVE_K, LIVE_MAX_DEPTH, LIVE_MAX_CALLS]).toEqual([5, 12, 150]);
    expect(liveProvider()).toBe(liveProvider());
    expect(liveProvider()).toMatchObject({ kind: 'worker', callsLeft: 150 });
  });

  it('repeats and smaller k are free; a larger k fetches again', async () => {
    const { inner, calls } = counting();
    const p = new CachedProvider(inner);
    expect(await p.nextTokens('x', 5)).toHaveLength(5);
    expect(await p.nextTokens('x', 5)).toHaveLength(5);
    expect(await p.nextTokens('x', 2)).toEqual(TOKENS.slice(0, 2));
    expect(p.has('x', 3)).toBe(true);
    expect(p.has('x', 8)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(await p.nextTokens('x', 8)).toHaveLength(8);
    expect(await p.nextTokens('x', 6)).toHaveLength(6);
    expect(calls.map((c) => c.k)).toEqual([5, 8]);
    expect(p.calls).toBe(2);
  });

  it('a short answer is the whole distribution and serves any k', async () => {
    const { inner, calls } = counting({ size: 2 });
    const p = new CachedProvider(inner);
    await p.nextTokens('x', 5);
    expect(await p.nextTokens('x', 8)).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it('shares one call between concurrent requests for a prefix', async () => {
    let release!: () => void;
    const { inner, calls } = counting({ gate: new Promise<void>((r) => (release = r)) });
    const p = new CachedProvider(inner);
    const a = p.nextTokens('x', 5);
    const b = p.nextTokens('x', 3);
    release();
    expect(await a).toHaveLength(5);
    expect(await b).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it('one waiter aborting leaves the call for the other; the last one cancels it', async () => {
    let release!: () => void;
    const { inner, calls } = counting({ gate: new Promise<void>((r) => (release = r)) });
    const p = new CachedProvider(inner);
    const c1 = new AbortController();
    const a = p.nextTokens('x', 5, { signal: c1.signal }).catch((e: unknown) => e);
    const b = p.nextTokens('x', 5);
    c1.abort();
    expect(await a).toMatchObject({ code: 'aborted' });
    expect(calls[0]!.signal!.aborted).toBe(false);
    release();
    expect(await b).toHaveLength(5);

    const c2 = new AbortController();
    const c = p.nextTokens('y', 5, { signal: c2.signal }).catch((e: unknown) => e);
    c2.abort();
    expect(await c).toMatchObject({ code: 'aborted' });
    expect(calls[1]!.signal!.aborted).toBe(true);
    expect(await p.nextTokens('y', 5)).toHaveLength(5); // a fresh call, not the cancelled one
    expect(calls).toHaveLength(3);
  });

  it('does not cache failures', async () => {
    const { inner, calls } = counting({ fail: true });
    const p = new CachedProvider(inner);
    await expect(p.nextTokens('x', 5)).rejects.toMatchObject({ code: 'upstream_error' });
    await expect(p.nextTokens('x', 5)).rejects.toMatchObject({ code: 'upstream_error' });
    expect(calls).toHaveLength(2);
  });

  it('turns a non-ProviderError from the inner provider into upstream_error', async () => {
    const inner: LogprobProvider = { kind: 'worker', model: 'm', nextTokens: vi.fn<LogprobProvider['nextTokens']>(() => Promise.reject(new Error('raw'))) };
    await expect(new CachedProvider(inner).nextTokens('x', 5)).rejects.toMatchObject({ name: 'ProviderError', code: 'upstream_error' });
  });

  it('stops at the session cap with session_limit; cached prefixes keep working', async () => {
    const { inner, calls } = counting();
    const p = new CachedProvider(inner, { maxCalls: 2 });
    await p.nextTokens('a', 5);
    await p.nextTokens('b', 5);
    expect(p.callsLeft).toBe(0);
    await expect(p.nextTokens('c', 5)).rejects.toMatchObject({ code: 'session_limit' });
    expect(await p.nextTokens('a', 3)).toHaveLength(3);
    expect(calls).toHaveLength(2);
  });
});

describe('providerMessage', () => {
  it('has one calm line for every code', () => {
    const codes = ['not_recorded', 'invalid_input', 'prefix_too_long', 'input_too_large', 'rate_limited', 'budget_exhausted', 'session_limit', 'upstream_error', 'unavailable', 'aborted'] as const;
    for (const code of codes) expect(providerMessage(code)).toMatch(/^[A-Z].*\.$/);
    expect(providerMessage('rate_limited', 7)).toContain('7 s');
    expect(providerMessage('session_limit')).toContain('150');
    expect(codes.map((c) => providerMessage(c)).join(' ')).not.toMatch(/!|error|fail/i);
  });
});
