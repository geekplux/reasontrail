import { describe, expect, it } from 'vitest';
import fixture from '../../worker/test/fixtures/glm-response.json';
import { parseOpenAiLogprobs } from './parseOpenAiLogprobs';

describe('parseOpenAiLogprobs', () => {
  it('reads the first position of a glm-4.7-flash response (published schema)', () => {
    const first = parseOpenAiLogprobs(fixture);
    expect(first.token).toBe(' looked');
    expect(first.top).toHaveLength(8);
    expect(first.top[0]).toEqual({ token: ' looked', logprob: -0.9162907 });
    expect(first.top[7]).toEqual({ token: ' heard', logprob: -3.912023 });
    expect(Object.keys(first.top[1]!)).toEqual(['token', 'logprob']);
  });

  it.each([
    ['not an object', null],
    ['no choices', { choices: [] }],
    ['null logprobs', { choices: [{ logprobs: null }] }],
    ['empty content', { choices: [{ logprobs: { content: [] } }] }],
    ['no top_logprobs', { choices: [{ logprobs: { content: [{ token: 'a', logprob: -1 }] } }] }],
    ['malformed entries only', { choices: [{ logprobs: { content: [{ token: 'a', logprob: -1, top_logprobs: [{ token: 1 }] }] } }] }],
  ])('rejects with upstream_error: %s', (_name, response) => {
    expect(() => parseOpenAiLogprobs(response)).toThrow(expect.objectContaining({ name: 'ProviderError', code: 'upstream_error' }));
  });
});
