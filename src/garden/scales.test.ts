import { describe, expect, it } from 'vitest';
import { branchWidth, describeBranch, formatPct } from './scales';

describe('branchWidth', () => {
  it('is 1.5 + 18.5·p, clamped to [0, 1]', () => {
    expect(branchWidth(0)).toBe(1.5);
    expect(branchWidth(1)).toBe(20);
    expect(branchWidth(0.5)).toBeCloseTo(10.75, 10);
    expect(branchWidth(-1)).toBe(1.5);
    expect(branchWidth(2)).toBe(20);
  });

  it('strictly increases with p', () => {
    expect(branchWidth(0.0269)).toBeLessThan(branchWidth(0.027));
  });
});

describe('formatPct', () => {
  it('formats with one decimal and a floor label', () => {
    expect(formatPct(0.447)).toBe('44.7%');
    expect(formatPct(0.0892)).toBe('8.9%');
    expect(formatPct(0.0001)).toBe('<0.1%');
    expect(formatPct(0)).toBe('0.0%');
  });
});

describe('describeBranch', () => {
  it('keeps the verbatim token (leading space included) in quotes, then the percentage', () => {
    expect(describeBranch(' looked', 0.0892)).toBe('“ looked” 8.9%');
  });
});
