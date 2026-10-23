import { describe, expect, it, vi } from 'vitest';
import { ProviderError, type LogprobProvider, type TokenChoice } from '../../shared/llm/types';
import { CachedProvider, LIVE_K, LIVE_MAX_DEPTH } from '../llm/cachedProvider';
import { providerContract } from '../llm/providerContract';
import type { SampleGarden } from '../samples/types';
import tiny from '../test/fixtures/tiny-garden.json';
import { LensProvider } from './lensProvider';

const garden = tiny as SampleGarden;
const TOKENS: TokenChoice[] = [' x', ' y', ' z', ' w', ' v'].map((token, i) => ({ token, logprob: -0.4 - i * 0.5 }));

function fakeLive(fail?: ProviderError) {
  const calls: { prefix: string; k: number }[] = [];
  const inner: LogprobProvider = {
    kind: 'worker',
    model: 'fake-live',
    async nextTokens(prefix, k) {
      calls.push({ prefix, k });
      if (fail) throw fail;
      return TOKENS.slice(0, k);
    },
  };
  const cached = new CachedProvider(inner);
  return { calls, source: () => cached };
}

providerContract('LensProvider(recorded)', () => new LensProvider(garden.prompt, garden, {}, fakeLive().source), [garden.prompt, `${garden.prompt} mat`]);

describe('LensProvider', () => {
  it('answers recorded prefixes with no live call, and refuses the rest until the opt-in', async () => {
    const { calls, source } = fakeLive();
    const p = new LensProvider(garden.prompt, garden, {}, source);
    expect((await p.nextTokens(garden.prompt, 3)).map((c) => c.token)).toEqual([' mat', ' sofa', ' roof']);
    await expect(p.nextTokens(`${garden.prompt} roof`, 3)).rejects.toMatchObject({ code: 'not_recorded' });
    expect(calls).toEqual([]);
    expect(p.kind).toBe('recorded');
    expect(p.model).toBe(garden.model.name);
  });

  it('grows live after the opt-in, asks for LIVE_K and serves repeats from the cache', async () => {
    const { calls, source } = fakeLive();
    const p = new LensProvider(garden.prompt, garden, { isLive: () => true }, source);
    const prefix = `${garden.prompt} roof`;
    expect(await p.nextTokens(prefix, 3)).toEqual(TOKENS.slice(0, 3));
    expect(await p.nextTokens(prefix, 5)).toEqual(TOKENS);
    expect(calls).toEqual([{ prefix, k: LIVE_K }]);
    expect(await p.nextTokens(garden.prompt, 3)).toHaveLength(3); // still recorded
    expect(calls).toHaveLength(1);
    expect(p.kind).toBe('worker');
    expect(p.callsLeft).toBe(149);
  });

  it('works with no recording at all', async () => {
    const { calls, source } = fakeLive();
    const p = new LensProvider('Only live', null, {}, source);
    await expect(p.nextTokens('Only live', 5)).rejects.toMatchObject({ code: 'not_recorded' });
    p.goLive();
    expect(await p.nextTokens('Only live', 5)).toEqual(TOKENS);
    expect(calls).toHaveLength(1);
    expect(p.model).toBe('fake-live');
  });

  it(`stops ${LIVE_MAX_DEPTH} tokens past the prompt`, async () => {
    const { calls, source } = fakeLive();
    const p = new LensProvider('Deep', null, { isLive: () => true }, source);
    let prefix = 'Deep';
    for (let d = 0; d < LIVE_MAX_DEPTH; d++) prefix += (await p.nextTokens(prefix, 5))[0]!.token;
    await expect(p.nextTokens(prefix, 5)).rejects.toMatchObject({ code: 'not_recorded' });
    expect(calls).toHaveLength(LIVE_MAX_DEPTH);
    expect([LensProvider.canGrowLive(LIVE_MAX_DEPTH - 1), LensProvider.canGrowLive(LIVE_MAX_DEPTH)]).toEqual([true, false]);
  });

  it('reports each live call: a failure with its error, an answer or a stop with null', async () => {
    const onSettled = vi.fn<(err: ProviderError | null) => void>();
    const { source } = fakeLive(new ProviderError('unavailable', 'no worker'));
    const p = new LensProvider('Fails', null, { onSettled, isLive: () => true }, source);
    await expect(p.nextTokens('Fails', 5)).rejects.toMatchObject({ code: 'unavailable' });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0]![0]).toMatchObject({ code: 'unavailable' });
    const stopped = new AbortController();
    stopped.abort();
    await expect(p.nextTokens('Fails again', 5, { signal: stopped.signal })).rejects.toMatchObject({ code: 'aborted' });
    expect(onSettled).toHaveBeenLastCalledWith(null);
    const ok = new LensProvider('Works', null, { onSettled, isLive: () => true }, fakeLive().source);
    await ok.nextTokens('Works', 5);
    expect(onSettled).toHaveBeenLastCalledWith(null);
    expect(onSettled).toHaveBeenCalledTimes(3);
  });
});
