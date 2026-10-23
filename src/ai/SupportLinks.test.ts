import { describe, expect, it } from 'vitest';
import { supportArcs, type Arc } from './SupportLinks';

/** Height of the quadratic arc (control at the midpoint, 2h above the route) at horizontal position `x`. */
const at = (c: Arc, x: number) => {
  const u = (x - c.x1) / (c.x2 - c.x1);
  return u <= 0 || u >= 1 ? 0 : 4 * c.h * u * (1 - u);
};

describe('supportArcs', () => {
  const x = new Map([['a', 0], ['b', 40], ['c', 90], ['d', 300], ['e', 700], ['f', -200], ['g', -20]]);

  it('scales heights by span: the longest arc is 12 px, the others in proportion', () => {
    const arcs = supportArcs(x, [{ from: 'a', to: ['b', 'e', 'nope', 'a'] }]);
    expect(arcs.map((c) => [c.id, c.h])).toEqual([['a>b', (12 * 40) / 700], ['a>e', 12]]);
  });

  it('never crosses arcs from one origin (on either side)', () => {
    const arcs = supportArcs(x, [{ from: 'a', to: ['b', 'c', 'd', 'e', 'f', 'g'] }]);
    for (const p of arcs) {
      for (const q of arcs) {
        if (p === q || Math.sign(p.x2 - p.x1) !== Math.sign(q.x2 - q.x1)) continue;
        const [inner, outer] = Math.abs(p.x2 - p.x1) < Math.abs(q.x2 - q.x1) ? [p, q] : [q, p];
        for (let k = 1; k < 100; k++) {
          const xs = inner.x1 + ((inner.x2 - inner.x1) * k) / 100;
          expect(at(outer, xs)).toBeGreaterThan(at(inner, xs));
        }
      }
    }
  });

  it('gives a lone arc at least 3 px and drops pairs without a waypoint', () => {
    expect(supportArcs(x, [{ from: 'a', to: ['b'] }])[0]?.h).toBe(12);
    expect(supportArcs(x, [{ from: 'zz', to: ['b'] }])).toEqual([]);
  });
});
