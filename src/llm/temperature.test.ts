import { describe, expect, it } from 'vitest';
import { temper } from './temperature';

const ps = [0.4, 0.2, 0.1, 0.05, 0.05];
const r = 0.2;
const total = ({ q, rest }: { q: number[]; rest: number }) => q.reduce((s, x) => s + x, rest);

describe('temper', () => {
  it('is the identity at T = 1', () => expect(temper(ps, r, 1)).toEqual({ q: ps, rest: r }));

  it('puts all mass on rank 0 at T = 0 (ties to the lower rank)', () => {
    expect(temper(ps, r, 0)).toEqual({ q: [1, 0, 0, 0, 0], rest: 0 });
    expect(temper([0.3, 0.3], 0.4, 0).q).toEqual([1, 0]);
  });

  it.each([0.1, 0.5, 1.5, 2])('sums to 1 including the remainder at T = %s', (t) => {
    expect(Math.abs(total(temper(ps, r, t)) - 1)).toBeLessThan(1e-9);
  });

  it('sharpens monotonically as T falls', () => {
    const q0 = [2, 1.5, 1, 0.5, 0.1, 0].map((t) => temper(ps, r, t).q[0]!);
    q0.slice(1).forEach((q, i) => expect(q).toBeGreaterThanOrEqual(q0[i]!));
  });

  it('stays finite for tiny chances at small T', () => {
    const out = temper([0.9, Math.exp(-30)], 0.1 - Math.exp(-30), 0.1);
    expect([...out.q, out.rest].every(Number.isFinite)).toBe(true);
    expect(Math.abs(total(out) - 1)).toBeLessThan(1e-9);
  });
});
