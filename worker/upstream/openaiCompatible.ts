// Any OpenAI-compatible `chat/completions` server that returns `top_logprobs` (OpenAI, vLLM, …): docs/EXTENDING.md.
import { callUpstream, chatBody, notConfigured, RetryableError, tokensFromCompletion, type Upstream } from './chat';

export interface OpenAiCompatibleConfig {
  /** e.g. "https://api.openai.com/v1" or "http://localhost:8000/v1"; `/chat/completions` is appended. */
  baseUrl: string | undefined;
  /** Secret: `.dev.vars` locally, `wrangler secret put OPENAI_API_KEY` when deployed. */
  apiKey: string | undefined;
  model: string | undefined;
}

/** POSTs the shared chat body with `model`; 503 `unavailable` when the base URL, key or model is missing. */
export function openAiCompatibleUpstream({ baseUrl, apiKey, model }: OpenAiCompatibleConfig, timeoutMs?: number): Upstream {
  const complete = async (body: Record<string, unknown>, ms = timeoutMs) => {
    if (!baseUrl || !apiKey || !model) throw notConfigured();
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    return callUpstream(
      'OpenAI-compatible',
      async (signal) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model, ...body }),
          signal,
        });
        if (res.status >= 500) throw new RetryableError(`HTTP ${res.status}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as unknown;
      },
      ms,
    );
  };
  return { model, complete, nextTokens: async (prefix) => tokensFromCompletion(await complete(chatBody(prefix))) };
}
