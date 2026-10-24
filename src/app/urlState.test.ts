import { describe, expect, it } from 'vitest';
import { lensSearch, linkSearch, mapSearch, readSiteState, readUrlState, writeUrlState, writeView } from './urlState';

describe('urlState', () => {
  it.each([
    ['', null, [], 1, null, true],
    ['?sample=tiny&path=0.0.0', 'tiny', [0, 0, 0], 1, null, true],
    ['?path=1.x.2', null, [1], 1, null, false],
    ['?path=-1', null, [], 1, null, false],
    ['?path=', null, [], 1, null, true],
    ['?t=0.7&seed=4&path=2', null, [2], 0.7, 4, true],
    ['?t=9&seed=0', null, [], 2, null, true],
    ['?t=-1&seed=12345', null, [], 0, null, true],
    ['?t=abc&seed=x', null, [], 1, null, true],
    ['?t=1.26&seed=9999', null, [], 1.3, 9999, true],
  ])('reads %j', (search, sample, path, t, seed, valid) => {
    expect(readUrlState(search)).toEqual({ sample, path, t, seed, valid });
  });

  it.each([
    ['', { sample: 'tiny', path: [0, 0, 0], t: 1, seed: null }, '?sample=tiny&path=0.0.0'],
    ['?sample=tiny&path=1&t=2&seed=3', { sample: null, path: [], t: 1, seed: null }, ''],
    ['?prompt=x&path=1', { sample: null, path: [2, 0], t: 1.5, seed: 7 }, '?prompt=x&path=2.0&t=1.5&seed=7'],
  ])('writes into %j, keeping unknown params', (search, state, out) => {
    expect(writeUrlState(search, state)).toBe(out);
    const { valid: _, ...back } = readUrlState(out);
    expect(back).toEqual({ ...state, sample: state.sample });
  });
});

describe('site state (phase 16)', () => {
  it('opens the map by default, the garden for garden links, and reads the session and view', () => {
    expect(readSiteState('')).toEqual({ garden: false, lens: false, session: null, view: 'map' });
    expect(readSiteState('?sample=robot&path=1')).toMatchObject({ garden: true });
    expect(readSiteState('?sample=')).toMatchObject({ garden: true });
    expect(readSiteState('?session=planner-pivot&view=outline')).toEqual({ garden: false, lens: false, session: 'planner-pivot', view: 'outline' });
    expect(writeView('?session=x', 'outline')).toBe('?session=x&view=outline');
    expect(writeView('?view=outline', 'map')).toBe('');
    expect(readSiteState('?view=open').view).toBe('open');
    expect(readSiteState('?view=install&session=x')).toEqual({ garden: false, lens: false, session: 'x', view: 'install' });
    expect(readSiteState('?view=nope').view).toBe('map');
    expect(writeView('?session=x&view=outline', 'open')).toBe('?session=x&view=open');
  });
});

describe('lens links (phase 22)', () => {
  it('opens a recorded sentence as a garden link and a live one as lens=live, keeping the map selection', () => {
    const map = '?session=planner-pivot&step=s12';
    expect(lensSearch(map, 'lens-planner-pivot-1')).toBe('?session=planner-pivot&step=s12&sample=lens-planner-pivot-1');
    expect(lensSearch(map, null)).toBe('?session=planner-pivot&step=s12&lens=live');
    expect(readSiteState(lensSearch(map, null))).toMatchObject({ garden: false, lens: true, session: 'planner-pivot' });
    expect(mapSearch('?session=planner-pivot&step=s12&sample=lens-planner-pivot-1&path=0.1&t=0.5&seed=3')).toBe(map);
    expect(mapSearch('?lens=live&path=0')).toBe('');
    expect(lensSearch('?sample=cat&path=1', 'lens-x')).toBe('?sample=lens-x');
  });
});

describe('same-page links (phase 29)', () => {
  it('keeps the selected sample for a home section link on the home, and opens the home from other pages', () => {
    expect(linkSearch('./#install', '?session=planner-pivot')).toBe('?session=planner-pivot');
    expect(linkSearch('./#install', '')).toBe('');
    expect(linkSearch('./#install', '?view=how')).toBe('');
    expect(linkSearch('./#install', '?session=x&view=install')).toBe('');
    expect(linkSearch('./#install', '?sample=cat&path=1')).toBe('');
    expect(linkSearch('./', '?session=planner-pivot')).toBe('');
    expect(linkSearch('?view=how', '?session=planner-pivot')).toBe('?view=how');
  });
});
