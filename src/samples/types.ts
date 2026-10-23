import type { TokenChoice } from '../../shared/llm/types';

/** Where a recorded garden's distributions came from. */
export interface SampleModel {
  provider: string;
  name: string;
  dtype?: string;
  note?: string;
}

/**
 * A recorded garden (schemaVersion 1, docs/llm-provider.md §4).
 * `nodes` is a flat map keyed by the continuation text after the prompt ("" = root);
 * each value is the top-k at that point, sorted by logprob descending.
 */
export interface SampleGarden {
  schemaVersion: 1;
  id: string;
  title: string;
  prompt: string;
  model: SampleModel;
  recordedAt: string;
  k: number;
  nodes: Record<string, TokenChoice[]>;
}
