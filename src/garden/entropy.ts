export type EntropyBand = 'low' | 'medium' | 'high';

/** Entropy in bits of a distribution (the tempered top-k plus the remainder); 0·log 0 = 0. */
export function entropy(qs: readonly number[]): number {
  return qs.reduce((h, q) => (q > 0 ? h - q * Math.log2(q) : h), 0);
}

/** Uncertainty bands (docs/viz/garden.md §10.2): low < 1 bit <= medium < 2 bits <= high. */
export const entropyBand = (h: number): EntropyBand => (h < 1 ? 'low' : h < 2 ? 'medium' : 'high');

/** "1.4 bits, medium". */
export const formatEntropy = (h: number) => `${h.toFixed(1)} bits, ${entropyBand(h)}`;
