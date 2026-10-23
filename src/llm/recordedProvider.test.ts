import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../shared/llm/types';
import type { SampleGarden } from '../samples/types';
import tiny from '../test/fixtures/tiny-garden.json';
import { providerContract } from './providerContract';
import { RecordedProvider } from './recordedProvider';

const garden = tiny as SampleGarden;
const make = () => new RecordedProvider(garden);

providerContract('RecordedProvider', make, Object.keys(garden.nodes).map((key) => garden.prompt + key));

describe('RecordedProvider', () => {
  it('reports its kind and the recorded model', () => {
    expect(make()).toMatchObject({ kind: 'recorded', model: 'hand-written' });
  });

  it('looks up the continuation after the prompt and slices to k', async () => {
    expect(await make().nextTokens(`${garden.prompt} mat and`, 2)).toEqual([
      { token: ' purred', logprob: -0.92 },
      { token: ' slept', logprob: -1.2 },
    ]);
  });

  it.each([' roof', ' mat.', 'constructor', ' mat and purred.'].map((k) => garden.prompt + k).concat(['The dog', '']))(
    'rejects %j with ProviderError("not_recorded")',
    async (prefix) => {
      const err = await make().nextTokens(prefix, 3).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err).toMatchObject({ name: 'ProviderError', code: 'not_recorded' });
    },
  );

  it('returns copies, so callers cannot mutate the recording', async () => {
    const out = await make().nextTokens(garden.prompt, 1);
    out[0]!.logprob = 0;
    expect(garden.nodes['']![0]!.logprob).toBe(-1.05);
  });
});
