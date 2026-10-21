// Pure request handler (PLAN D3): everything the Worker does, testable in Node with fakes.
import { ProviderError } from '../shared/llm/types';
import { cacheKey, readCache, writeCache } from './cache';
import type { Ctx, Env } from './env';
import { errorResponse, json, toErrorResponse } from './errors';
import { workersAiNextTokens } from './upstream/workersAi';
import { parseNextTokensRequest } from './validate';

export const NEXT_TOKENS_PATH = '/api/next-tokens';

export async function handle(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== NEXT_TOKENS_PATH) {
    if (!pathname.startsWith('/api/') && env.ASSETS) return env.ASSETS.fetch(request);
    return errorResponse('invalid_input', 'There is no such endpoint.', 404);
  }
  if (request.method !== 'POST') return errorResponse('invalid_input', 'Use POST for this endpoint.', 405, { allow: 'POST' });
  try {
    const { prefix, k } = await parseNextTokensRequest(request);
    const model = env.MODEL_ID;
    if (!model) throw new ProviderError('unavailable', 'Live mode is not configured on this server.');
    const key = await cacheKey(model, prefix);
    const cached = await readCache(env.TG_CACHE, key);
    if (cached) return json({ model, k, cached: true, tokens: cached.slice(0, k) });
    if (!env.AI || (env.UPSTREAM ?? 'workers-ai') !== 'workers-ai') throw new ProviderError('unavailable', 'Live mode is not configured on this server.');
    const tokens = await workersAiNextTokens(env.AI, model, prefix);
    writeCache(env.TG_CACHE, key, tokens, ctx);
    return json({ model, k, cached: false, tokens: tokens.slice(0, k) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
