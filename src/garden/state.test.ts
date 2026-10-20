import { describe, expect, it } from 'vitest';
import { RecordedProvider } from '../llm/recordedProvider';
import type { SampleGarden } from '../samples/types';
import tiny from '../test/fixtures/tiny-garden.json';
import { buildTree, pathTo } from './buildTree';
import { gardenReducer, initialGardenState, openPath, type GardenAction, type GardenState } from './state';

const garden = tiny as SampleGarden;
const provider = new RecordedProvider(garden);
const run = (actions: GardenAction[], from: GardenState = initialGardenState) => actions.reduce(gardenReducer, from);
const choices = [{ token: ' x', logprob: -0.1 }];

describe('gardenReducer', () => {
  it.each<[string, GardenAction[], string[], string | null]>([
    ['expand with an answer opens and caches it', [{ type: 'expand', key: ' a', choices }], [' a'], null],
    ['expand without a cached answer does nothing', [{ type: 'expand', key: ' a' }], [], null],
    ['collapse closes', [{ type: 'expand', key: ' a', choices }, { type: 'collapse', key: ' a' }], [], null],
    ['toggle re-opens from the cache', [{ type: 'expand', key: ' a', choices }, { type: 'toggle', key: ' a' }, { type: 'toggle', key: ' a' }], [' a'], null],
    ['select sets the single selection', [{ type: 'select', key: ' a' }, { type: 'select', key: ' b' }], [], ' b'],
    ['openPath merges, opens only cached keys and selects', [{ type: 'openPath', nodes: { ' a': choices }, expand: [' a', ' b'], select: ' b' }], [' a'], ' b'],
  ])('%s', (_, actions, expanded, selected) => {
    const s = run(actions);
    expect([...s.expanded]).toEqual(expanded);
    expect(s.selectedKey).toBe(selected);
  });

  it('records a status and clears it when the branch opens', () => {
    const s = run([{ type: 'status', key: ' a', status: 'loading' }]);
    expect(s.status).toEqual({ ' a': 'loading' });
    expect(run([{ type: 'expand', key: ' a', choices }], s).status).toEqual({});
  });
});

describe('openPath through the provider', () => {
  it.each<[number[], string | null, string[], boolean]>([
    [[], null, [' mat'], true], // D11: the most probable child opens by default
    [[0, 0, 0], ' mat and purred', [' mat', ' mat and', ' mat and purred'], true], // depth-3 round trip
    [[2], ' roof', [' mat'], true], // an unrecorded leaf can be selected, not opened
    [[9, 9], null, [' mat'], false],
    [[0, 2, 0], ' mat by', [' mat'], false], // " mat by" is not recorded: stop there
  ])('%j selects %j', async (ranks, select, expand, complete) => {
    const r = await openPath(provider, garden.prompt, garden.k, ranks);
    expect(r).toMatchObject({ select, expand, complete });
    const s = run([{ type: 'openPath', ...r }]);
    const tree = buildTree({ prompt: garden.prompt, nodes: s.nodes }, s.expanded, (key) => Object.hasOwn(garden.nodes, key));
    const shown = select === null ? [] : pathTo(tree, select).map((b) => b.rank); // the selection is visible, along the path
    expect(shown).toEqual(ranks.slice(0, shown.length));
    expect(shown.length === ranks.length).toBe(complete);
  });
});
