import { describe, expect, it } from 'vitest';
import { buildTree } from './buildTree';
import { treeKeyAction, visibleItems } from './keyboard';

// Root: a (open: a1, a2), b (recorded, closed), c (not recorded).
const lp = Math.log(0.3);
const tree = buildTree(
  { prompt: 'P', nodes: { '': [{ token: 'a', logprob: lp }, { token: 'b', logprob: lp }, { token: 'c', logprob: lp }], a: [{ token: '1', logprob: lp }, { token: '2', logprob: lp }], b: [] } },
  new Set(['a']),
);
const items = visibleItems(tree);

describe('visibleItems', () => {
  it('lists visible branches depth-first with parent and set size', () => {
    expect(items.map((x) => [x.branch.key, x.parentKey, x.setSize])).toEqual([
      ['a', null, 3],
      ['a1', 'a', 2],
      ['a2', 'a', 2],
      ['b', null, 3],
      ['c', null, 3],
    ]);
  });
});

describe('treeKeyAction', () => {
  const F = (key: string) => ({ type: 'focus', key });
  const A = (key: string) => ({ type: 'activate', key });
  it.each([
    ['a', 'ArrowDown', F('a1')], ['a2', 'ArrowDown', F('b')], ['c', 'ArrowDown', null], ['b', 'ArrowUp', F('a2')], ['a', 'ArrowUp', null],
    ['b', 'Home', F('a')], ['a', 'End', F('c')], ['a', 'ArrowRight', F('a1')], ['b', 'ArrowRight', A('b')], ['c', 'ArrowRight', null],
    ['a', 'ArrowLeft', A('a')], ['a2', 'ArrowLeft', F('a')], ['b', 'ArrowLeft', null], ['c', 'Enter', A('c')], ['a', ' ', A('a')],
    ['a', 'x', null], ['gone', 'ArrowDown', null],
  ])('%s + %j -> %j', (focused, key, action) => {
    expect(treeKeyAction(items, focused, key)).toEqual(action);
  });
});
