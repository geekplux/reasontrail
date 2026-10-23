import { describe, expect, it } from 'vitest';
import { K_MAX, ProviderError, type LogprobProvider } from '../../shared/llm/types';

/**
 * The executable spec for every `LogprobProvider` (docs/llm-provider.md §3). Call it from a test file:
 * `providerContract('RecordedProvider', () => new RecordedProvider(garden), [prompt, prompt + ' mat'])`.
 * `prefixes` must be ones the provider can answer without error.
 */
export function providerContract(name: string, make: () => LogprobProvider, prefixes: readonly string[]): void {
  describe(`${name} meets the provider contract`, () => {
    it('has a kind and a model id', () => {
      const p = make();
      expect(['recorded', 'worker', 'browser']).toContain(p.kind);
      expect(p.model).not.toBe('');
    });

    it.each(prefixes)('%j: at most k unique, non-empty tokens, logprob <= 0, sorted desc', async (prefix) => {
      const p = make();
      for (let k = 1; k <= K_MAX; k++) {
        const out = await p.nextTokens(prefix, k);
        expect(out.length).toBeGreaterThanOrEqual(1);
        expect(out.length).toBeLessThanOrEqual(k);
        expect(new Set(out.map((c) => c.token)).size).toBe(out.length);
        for (const c of out) {
          expect(c.token).not.toBe('');
          expect(Number.isFinite(c.logprob) && c.logprob <= 0).toBe(true);
        }
        expect(out.map((c) => c.logprob)).toEqual(out.map((c) => c.logprob).sort((a, b) => b - a));
      }
    });

    it.each(prefixes)(`%j: deterministic, and k is clamped to [1, ${K_MAX}]`, async (prefix) => {
      const p = make();
      expect(await p.nextTokens(prefix, 3)).toEqual(await make().nextTokens(prefix, 3));
      const one = await p.nextTokens(prefix, 1);
      expect(await p.nextTokens(prefix, 0)).toEqual(one);
      expect(await p.nextTokens(prefix, -5)).toEqual(one);
      expect(await p.nextTokens(prefix, K_MAX + 92)).toEqual(await p.nextTokens(prefix, K_MAX));
    });

    it('rejects with ProviderError("aborted") for an aborted signal', async () => {
      const c = new AbortController();
      c.abort();
      const err = await make().nextTokens(prefixes[0]!, 3, { signal: c.signal }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('aborted');
    });
  });
}
