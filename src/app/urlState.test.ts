import { describe, expect, it } from 'vitest';
import { readUrlState, writeUrlState } from './urlState';

describe('urlState', () => {
  it.each([
    ['', null, [], true],
    ['?sample=tiny&path=0.0.0', 'tiny', [0, 0, 0], true],
    ['?path=1.x.2', null, [1], false],
    ['?path=-1', null, [], false],
    ['?path=', null, [], true],
    ['?t=0.7&seed=4&path=2', null, [2], true],
  ])('reads %j', (search, sample, path, valid) => {
    expect(readUrlState(search)).toEqual({ sample, path, valid });
  });

  it.each([
    ['', { sample: 'tiny', path: [0, 0, 0] }, '?sample=tiny&path=0.0.0'],
    ['?sample=tiny&path=1', { sample: null, path: [] }, ''],
    ['?t=0.7&path=1', { sample: null, path: [2, 0] }, '?t=0.7&path=2.0'],
  ])('writes into %j, keeping unknown params', (search, state, out) => {
    expect(writeUrlState(search, state)).toBe(out);
    const back = readUrlState(out);
    expect({ sample: back.sample, path: back.path }).toEqual(state);
  });
});
