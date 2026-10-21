// Workers AI upstream (docs/llm-provider.md §1.4, §5): one chat call for the first token with top-8 logprobs.
import type { AiBinding } from '../env';
import { callUpstream, chatBody, notConfigured, tokensFromCompletion, type Upstream } from './chat';

/** The `env.AI.run` inputs for a prefix. Keep scripts/smoke-workers-ai.mjs in sync. */
export function workersAiInputs(prefix: string): Record<string, unknown> {
  return { ...chatBody(prefix), chat_template_kwargs: { enable_thinking: false } };
}

/**
 * `env.AI.run(model, …)`; 503 `unavailable` without the binding or a model. A thrown binding error has no HTTP
 * status, so it is not retried (a retry could double the spend on a deterministic failure).
 */
export function workersAiUpstream(ai: AiBinding | undefined, model: string | undefined, timeoutMs?: number): Upstream {
  return {
    model,
    async nextTokens(prefix) {
      if (!ai || !model) throw notConfigured();
      return tokensFromCompletion(await callUpstream('Workers AI', (signal) => ai.run(model, workersAiInputs(prefix), { signal }), timeoutMs));
    },
  };
}
