import { describe, expect, it } from 'vitest';
import { bundle, linkLength, linkPath } from './linkPath';
import { GAP } from './metrics';

describe('bundle', () => {
  it('centres the strokes on the parent row', () => {
    expect(bundle(0, [20])).toEqual([0]);
    expect(bundle(10, [4, 2])).toEqual([8.5, 12.5]);
  });

  it.each([[[4, 2]], [[15.375, 6.125, 2.425, 1.5, 1.5, 9]]])('stacks %j in order, GAP apart', (widths) => {
    const ys = bundle(0, widths);
    const top = ys[0]! - widths[0]! / 2;
    const bottom = ys.at(-1)! + widths.at(-1)! / 2;
    expect(bottom - top).toBeCloseTo(widths.reduce((s, w) => s + w, 0) + (widths.length - 1) * GAP, 6);
    expect(top + bottom).toBeCloseTo(0, 6);
    ys.slice(1).forEach((y, i) => expect(y - widths[i + 1]! / 2 - (ys[i]! + widths[i]! / 2)).toBeCloseTo(GAP, 6));
  });
});

describe('linkPath', () => {
  it('starts at the fork, runs a stem, then curves to 4 px before the tip', () => {
    expect(linkPath(100, -3, 180, 40)).toBe('M100,-3 H108 C142,-3 142,40 176,40');
  });
});

describe('linkLength', () => {
  it('is the straight run for a level link and grows with the drop', () => {
    expect(linkLength(10, 5, 180, 5)).toBeCloseTo(180 - 4 - 10, 6);
    expect(linkLength(10, 5, 180, 85)).toBeGreaterThan(Math.hypot(166 - 8, 80) + 8);
  });
});
