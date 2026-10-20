import { describe, expect, it } from 'vitest';
import { buildTree, defaultExpanded, flattenBranches, pathTo, type GardenBranch, type GardenTree } from './buildTree';
import { EMPTY_TEXT, initialScrollLeft, layoutGarden } from './layout';
import { bundle } from './linkPath';
import { COL, GLYPH_EM, HIT_H, LABEL_DX, PAD, ROOT_FORK_X, TOKEN_PX } from './metrics';
import { branchWidth } from './scales';
import type { SampleGarden } from '../samples/types';
import tiny from '../test/fixtures/tiny-garden.json';

const sample = tiny as SampleGarden;
const garden = buildTree(sample, defaultExpanded(sample));
const pos = (t: GardenTree) => new Map(layoutGarden(t).branches.map((b) => [b.branch.key, [b.tipX, b.y] as const]));

/** The garden with five synthetic children (p 0.3 … 0.1, so a remainder too) grown under `key`. */
function grow(key: string): GardenTree {
  const t = structuredClone(garden);
  const b = flattenBranches(t).find((x) => x.key === key)!;
  b.state = 'expanded';
  b.children = [0.3, 0.2, 0.15, 0.1, 0.1].map(
    (p, rank): GardenBranch => ({ ...b, key: `${key}#${rank}`, token: `#${rank}`, p, pathP: b.pathP * p, depth: b.depth + 1, rank, state: 'not-recorded', children: [] }),
  );
  return t;
}

describe('layoutGarden', () => {
  it('lays out the default garden deterministically: root left, depth to the right, siblings 40 px apart', () => {
    expect(layoutGarden(garden)).toEqual(layoutGarden(buildTree(sample, defaultExpanded(sample))));
    const p = pos(garden);
    expect([...p.keys()]).toHaveLength(6);
    expect(p.get(' mat')).toEqual([180, -60]);
    expect(p.get(' sofa')).toEqual([180, -20]);
    expect(p.get(' mat and')).toEqual([360, -120]);
    expect(p.get(' mat by')).toEqual([360, -40]);
    const { remainders } = layoutGarden(garden);
    expect(remainders.map((r) => [r.parentKey, r.tipX, r.y])).toEqual([
      ['', 180, 60],
      [' mat', 360, 0],
    ]);
    expect(remainders[0]!.p).toBeCloseTo(1 - garden.children.reduce((s, b) => s + b.p, 0), 12);
  });

  it.each(flattenBranches(garden).filter((b) => b.state !== 'expanded').map((b) => b.key))(
    'growing %j keeps every column and every ancestor in place',
    (key) => {
      const before = pos(garden);
      const after = pos(grow(key));
      for (const [k, v] of before) expect(after.get(k)?.[0]).toBe(v[0]);
      for (const a of pathTo(garden, key).slice(0, -1)) expect(after.get(a.key)).toEqual(before.get(a.key)); // the seed is fixed at 0,0
      expect(after.get(`${key}#0`)?.[0]).toBe(before.get(key)![0] + COL);
    },
  );

  it.each(garden.children[0]!.children.map((b) => b.key))('growing %j (the next column is free) moves nothing', (key) => {
    const before = pos(garden);
    const after = pos(grow(key));
    for (const [k, v] of before) expect(after.get(k)).toEqual(v);
  });

  it.each(['', ' mat'])('fork %j: children then the remainder leave forkX stacked by bundle(parentY, widths)', (parentKey) => {
    const l = layoutGarden(garden);
    const parent = l.branches.find((b) => b.branch.key === parentKey);
    const [forkX, parentY] = parent ? [parent.forkX, parent.y] : [ROOT_FORK_X, 0];
    const kids = l.branches.filter((b) => (parent ? parent.branch.children : garden.children).includes(b.branch)).sort((a, b) => a.branch.rank - b.branch.rank);
    const rest = l.remainders.find((r) => r.parentKey === parentKey)!;
    const links = [...kids.map((k) => k.link), rest.link];
    const ys = bundle(parentY, [...kids.map((k) => branchWidth(k.branch.p)), branchWidth(rest.p)]);
    links.forEach((d, i) => {
      expect(d.startsWith(`M${forkX},`)).toBe(true);
      expect(Number(/^M[^,]+,([^ ]+) /.exec(d)![1])).toBeCloseTo(ys[i]!, 9);
    });
  });

  it('makes an empty garden wide enough for its message', () => {
    const { viewBox } = layoutGarden({ prompt: 'x', children: [] });
    expect(EMPTY_TEXT).toHaveLength(37);
    expect(viewBox.width).toBeGreaterThanOrEqual(2 * PAD + LABEL_DX + 37 * GLYPH_EM * TOKEN_PX);
  });

  it('gives every branch a hit rect at least 24 px tall that overlaps no other', () => {
    const hits = layoutGarden(grow(' mat and')).branches.map((b) => b.hit);
    for (const [i, a] of hits.entries()) {
      expect(a.height).toBeGreaterThanOrEqual(HIT_H);
      for (const b of hits.slice(i + 1)) {
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('starts mobile scrolled to the deepest open fork on the most likely path', () => {
    expect(initialScrollLeft(garden)).toBe(COL);
    expect(initialScrollLeft(buildTree(sample, new Set()))).toBe(0);
  });
});
