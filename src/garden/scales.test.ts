import { describe, expect, it } from 'vitest';
import { band, branchWidth, dashArray, describeBranch, formatPct, formatToken, formatValue, wsRuns } from './scales';

describe('scales', () => {
  it.each([
    [0, 1.5],
    [0.05, 2.425],
    [0.25, 6.125],
    [0.75, 15.375],
    [1, 20],
    [-1, 1.5],
    [2, 20],
  ])('branchWidth(%f) = %f px', (p, w) => expect(branchWidth(p)).toBeCloseTo(w, 10));

  it.each([
    [0.0999, 'lo'],
    [0.1, 'mid'],
    [0.3999, 'mid'],
    [0.4, 'hi'],
  ] as const)('band(%f) = %s', (p, b) => expect(band(p)).toBe(b));

  it.each([
    [0.447, '44.7%'],
    [0.0892, '8.9%'],
    [0.0001, '<0.1%'],
    [0, '0.0%'],
  ])('formatPct(%f) = %s', (p, s) => expect(formatPct(p)).toBe(s));

  it('adds the path chance below the first fork', () => {
    expect(formatValue({ p: 0.447, pathP: 0.447, depth: 1 })).toBe('44.7%');
    expect(formatValue({ p: 0.301, pathP: 0.0269, depth: 2 })).toBe('30.1% · path 2.7%');
  });

  it.each([
    [' looked', '·looked'],
    ['\n', '↵'],
    ['\tx y', '⇥x·y'],
    ['abcdefghijklmno', 'abcdefghijk…'],
    ['abcdefghijkl', 'abcdefghijkl'],
  ])('formatToken(%j) = %s', (t, s) => expect(formatToken(t)).toBe(s));

  it('splits whitespace glyphs into their own runs', () => {
    expect(wsRuns('·the↵↵x')).toEqual([
      { text: '·', ws: true },
      { text: 'the', ws: false },
      { text: '↵↵', ws: true },
      { text: 'x', ws: false },
    ]);
  });

  it('describes a branch with the verbatim token', () => {
    expect(describeBranch(' looked', 0.0892)).toBe('“ looked” 8.9%');
  });
});

describe('dashArray', () => {
  it.each([
    ['not-recorded', 1.5, '4 3'],
    ['other', 8, '6 4'],
    ['not-recorded', 20, '10 7.5'],
    ['other', 16, '12 8'],
  ] as const)('%s at %s px is %s', (kind, w, dash) => expect(dashArray(kind, w)).toBe(dash));

  it('stretches the gap so a stroke of known length ends on a whole dash', () => {
    const [dash, gap] = dashArray('other', 16, 150).split(' ').map(Number) as [number, number];
    expect(dash).toBe(12);
    const periods = (150 - dash) / (dash + gap);
    expect(Math.abs(periods - Math.round(periods))).toBeLessThan(0.01);
  });
});
