import { clampK, ProviderError, type LogprobProvider, type TokenChoice } from '../../shared/llm/types';
import type { SampleGarden } from '../samples/types';

/** Serves next tokens from a recorded garden: one lookup per call, no network, no key. */
export class RecordedProvider implements LogprobProvider {
  readonly kind = 'recorded';
  readonly model: string;
  readonly #garden: SampleGarden;

  constructor(garden: SampleGarden) {
    this.#garden = garden;
    this.model = garden.model.name;
  }

  /** Rejects with `not_recorded` when `prefix` does not start with the prompt or its continuation was not recorded. */
  async nextTokens(prefix: string, k: number, opts?: { signal?: AbortSignal }): Promise<TokenChoice[]> {
    if (opts?.signal?.aborted) throw new ProviderError('aborted', 'The request was aborted.');
    const n = clampK(k);
    const { prompt, nodes } = this.#garden;
    const key = prefix.slice(prompt.length);
    const list = prefix.startsWith(prompt) && Object.hasOwn(nodes, key) ? nodes[key] : undefined;
    if (!list) throw new ProviderError('not_recorded', 'This branch is not in the recording.');
    return [...list]
      .sort((a, b) => b.logprob - a.logprob)
      .slice(0, n)
      .map((c) => ({ token: c.token, logprob: c.logprob }));
  }
}
