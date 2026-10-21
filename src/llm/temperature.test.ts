import { describe, expect, it } from 'vitest';
import lighthouse from '../samples/lighthouse.json';
import { temper, temperChoices } from './temperature';

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

  describe('remainder as hidden tokens (spec §10.1, §10.5 AC1)', () => {
    const ts = Array.from({ length: 20 }, (_, i) => (i + 1) / 10);

    it('(a) q_r is non-decreasing in T, below r for T < 1 and above it for T > 1', () => {
      const qr = ts.map((t) => temper(ps, r, t).rest);
      qr.slice(1).forEach((q, i) => expect(q).toBeGreaterThanOrEqual(qr[i]! - 1e-12));
      expect(ts.filter((t, i) => (t < 1 ? qr[i]! > r : t > 1 && qr[i]! < r))).toEqual([]);
      expect(qr[9]).toBe(r); // T = 1
    });

    it('(b) regression: a large remainder does not take over at low T', () => {
      const out = temper([0.2, 0.1, 0.05, 0.03, 0.02], 0.6, 0.2); // n = 30 hidden tokens of 0.02
      expect(out.rest).toBeLessThan(0.01);
      expect(out.q[0]).toBeGreaterThan(0.95);
      const root = (t: number) => temperChoices(lighthouse.nodes[''], t).rest;
      expect(root(0.2)).toBeLessThan(0.9995);
      expect(root(0.2)).toBeLessThanOrEqual(root(1));
      expect(root(1.8)).toBeGreaterThan(root(1));
    });

    it('(c) is continuous down to greedy', () => {
      const [a, b] = [temper([0.2, 0.1, 0.05, 0.03, 0.02], 0.6, 0.05), temper([0.2, 0.1, 0.05, 0.03, 0.02], 0.6, 0)];
      [...a.q, a.rest].forEach((x, i) => expect(Math.abs(x - ([...b.q, b.rest][i] ?? 0))).toBeLessThan(1e-5));
    });

    it('(d) an exact-integer r / p_min adds no extra hidden token', () => {
      const out = temper([0.5, 0.25], 0.25, 2); // n = 1: three tokens 0.5, 0.25, 0.25
      const w = [0.5, 0.25, 0.25].map(Math.sqrt);
      const z = w.reduce((s, x) => s + x, 0);
      [...out.q, out.rest].forEach((x, i) => expect(x).toBeCloseTo(w[i]! / z, 12));
    });

    it.each([0.1, 0.5, 1, 1.5, 2])('(e) r = 0 keeps q_r = 0 at T = %s', (t) => expect(temper([0.6, 0.4], 0, t).rest).toBe(0));
  });
});
