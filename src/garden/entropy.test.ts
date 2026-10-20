import { describe, expect, it } from 'vitest';
import { entropy, entropyBand, formatEntropy } from './entropy';

describe('entropy', () => {
  it('is log2 6 for six equal choices and 0 for a certain one', () => {
    expect(entropy(Array(6).fill(1 / 6))).toBeCloseTo(2.585, 3);
    expect(entropy([1, 0, 0])).toBe(0);
  });

  it.each([
    [0.999, 'low'],
    [1, 'medium'],
    [1.999, 'medium'],
    [2, 'high'],
  ] as const)('bands %s bits as %s', (h, b) => expect(entropyBand(h)).toBe(b));

  it('formats one decimal plus the band', () => expect(formatEntropy(1.44)).toBe('1.4 bits, medium'));
});
