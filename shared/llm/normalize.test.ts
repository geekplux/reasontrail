import { describe, expect, it } from 'vitest';
import { isThinkingToken, logSumExp, normalize } from './normalize';

describe('normalize', () => {
  it('merges duplicate tokens with log-sum-exp, then sorts by logprob', () => {
    const out = normalize([
      { token: ' a', logprob: Math.log(0.2) },
      { token: ' b', logprob: Math.log(0.3) },
      { token: ' a', logprob: Math.log(0.2) },
    ]);
    expect(out.map((c) => c.token)).toEqual([' a', ' b']);
    expect(out[0]!.logprob).toBeCloseTo(Math.log(0.4), 12);
  });

  it('drops empty, special, thinking and undecodable tokens and non-finite logprobs; keeps leading spaces', () => {
    const raw = ['', '<|endoftext|>', '<think>', '</s>', '[gMASK]', '�', ' ok', 'x', ' nan'].map((token, i) => ({
      token,
      logprob: token === ' nan' ? Number.NaN : -i,
    }));
    expect(normalize(raw).map((c) => c.token)).toEqual([' ok', 'x']);
  });

  it('clamps tiny positive logprobs to 0, slices to k and breaks ties by token', () => {
    const out = normalize([{ token: 'b', logprob: -1 }, { token: 'a', logprob: -1 }, { token: 'z', logprob: 1e-9 }], 2);
    expect(out).toEqual([{ token: 'z', logprob: 0 }, { token: 'a', logprob: -1 }]);
  });

  it('logSumExp is stable for very small values', () => {
    expect(logSumExp(-1000, -1000)).toBeCloseTo(-1000 + Math.LN2, 9);
    expect(isThinkingToken(' <think> ')).toBe(true);
    expect(isThinkingToken(' think')).toBe(false);
  });
});
