// Workers AI upstream (docs/llm-provider.md §1.4, §5): one chat call for the first token with top-8 logprobs.
import { isThinkingToken, K_FETCH, normalize } from '../../shared/llm/normalize';
import { parseOpenAiLogprobs } from '../../shared/llm/parseOpenAiLogprobs';
import { ProviderError, type TokenChoice } from '../../shared/llm/types';
import type { AiBinding } from '../env';

export const SYSTEM_PROMPT =
  "You continue text. Reply with only the next words that continue the user's text exactly where it stops, with no preamble or quotes.";

/** The `env.AI.run` inputs for a prefix. Keep scripts/smoke-workers-ai.mjs in sync. */
export function workersAiInputs(prefix: string): Record<string, unknown> {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prefix },
    ],
    max_tokens: 1,
    logprobs: true,
    top_logprobs: K_FETCH,
    temperature: 0,
    chat_template_kwargs: { enable_thinking: false },
  };
}

/** The normalized top-K_FETCH next tokens after `prefix`; rejects with `upstream_error` (502). */
export async function workersAiNextTokens(ai: AiBinding, model: string, prefix: string): Promise<TokenChoice[]> {
  let response: unknown;
  try {
    response = await ai.run(model, workersAiInputs(prefix));
  } catch (err) {
    console.error('next-tokens: Workers AI call failed', err);
    throw new ProviderError('upstream_error', 'The model could not be reached. Try again in a moment.');
  }
  const first = parseOpenAiLogprobs(response);
  if (isThinkingToken(first.token) || isThinkingToken(first.top[0]?.token ?? '')) {
    throw new ProviderError('upstream_error', 'The model started thinking instead of continuing the text.');
  }
  const tokens = normalize(first.top, K_FETCH);
  if (tokens.length === 0) throw new ProviderError('upstream_error', 'The model returned only special tokens.');
  return tokens;
}
