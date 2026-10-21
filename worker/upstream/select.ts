// Picks the upstream for cache misses from `env.UPSTREAM` (default "workers-ai").
import type { Env } from '../env';
import { notConfigured, type Upstream } from './chat';
import { openAiCompatibleUpstream } from './openaiCompatible';
import { workersAiUpstream } from './workersAi';

export function selectUpstream(env: Env): Upstream {
  switch (env.UPSTREAM ?? 'workers-ai') {
    case 'workers-ai':
      return workersAiUpstream(env.AI, env.MODEL_ID);
    case 'openai-compatible':
      return openAiCompatibleUpstream({ baseUrl: env.OPENAI_BASE_URL, apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL });
    default:
      return { model: env.MODEL_ID, nextTokens: () => Promise.reject(notConfigured()) };
  }
}
