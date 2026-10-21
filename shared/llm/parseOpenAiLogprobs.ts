// Parses the OpenAI-shaped chat completion that both Workers AI (glm-4.7-flash) and OpenAI-compatible servers return:
// `choices[0].logprobs.content[0] = {token, logprob, top_logprobs: [{token, logprob}]}` (docs/llm-provider.md §1.2).
import { ProviderError, type TokenChoice } from './types';

/** The first generated position: the token the model emitted and its raw top-k alternatives (not yet normalized). */
export interface FirstPosition {
  token: string;
  logprob: number;
  top: TokenChoice[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const toChoice = (v: unknown): TokenChoice | null =>
  isRecord(v) && typeof v.token === 'string' && typeof v.logprob === 'number' ? { token: v.token, logprob: v.logprob } : null;

/** Extracts the first position or rejects with `upstream_error` when logprobs are missing, null or empty. */
export function parseOpenAiLogprobs(response: unknown): FirstPosition {
  const fail = (why: string): never => {
    throw new ProviderError('upstream_error', `The model returned no usable logprobs (${why}).`);
  };
  const choice = isRecord(response) && Array.isArray(response.choices) ? (response.choices[0] as unknown) : undefined;
  if (!isRecord(choice)) return fail('no choices');
  const content = isRecord(choice.logprobs) ? choice.logprobs.content : undefined;
  if (!Array.isArray(content) || content.length === 0) return fail('logprobs null or empty');
  const first = toChoice(content[0]);
  const rawTop = isRecord(content[0]) ? content[0].top_logprobs : undefined;
  if (!first || !Array.isArray(rawTop)) return fail('malformed first position');
  const top = rawTop.map(toChoice).filter((c): c is TokenChoice => c !== null);
  if (top.length === 0) return fail('top_logprobs empty');
  return { ...first, top };
}
