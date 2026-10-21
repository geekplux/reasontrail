// Pure request handler (PLAN D3): everything the Worker does, testable in Node with fakes.
import { checkBudget, dailyCap } from './budget';
import { cacheKey, readCache, writeCache } from './cache';
import type { Ctx, Env } from './env';
import { errorResponse, json, toErrorResponse } from './errors';
import { clientKey, enforceLimit } from './limits';
import { notConfigured } from './upstream/chat';
import { selectUpstream } from './upstream/select';
import { parseNextTokensRequest } from './validate';

export const NEXT_TOKENS_PATH = '/api/next-tokens';

export async function handle(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== NEXT_TOKENS_PATH) {
    if (!pathname.startsWith('/api/') && env.ASSETS) return env.ASSETS.fetch(request);
    return errorResponse('invalid_input', 'There is no such endpoint.', 404);
  }
  const ip = clientKey(request);
  try {
    await enforceLimit(env.RL_ALL, ip);
    if (request.method !== 'POST') return errorResponse('invalid_input', 'Use POST for this endpoint.', 405, { allow: 'POST' });
    const { prefix, k } = await parseNextTokensRequest(request);
    const upstream = selectUpstream(env);
    const model = upstream.model;
    if (!model) throw notConfigured();
    const key = await cacheKey(model, prefix);
    const cached = await readCache(env.TG_CACHE, key);
    if (cached) return json({ model, k, cached: true, tokens: cached.slice(0, k) });
    await enforceLimit(env.RL_MISS, ip);
    const spend = await checkBudget(env.TG_CACHE, dailyCap(env.DAILY_UPSTREAM_CAP), ctx);
    const tokens = await upstream.nextTokens(prefix);
    writeCache(env.TG_CACHE, key, tokens, ctx);
    spend();
    return json({ model, k, cached: false, tokens: tokens.slice(0, k) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
