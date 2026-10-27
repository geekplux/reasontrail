// Pure request handler: everything the Worker does, testable in Node with fakes.
import { paidCall } from './budget';
import { cacheKey, readCache, writeCache } from './cache';
import type { Ctx, Env } from './env';
import { errorResponse, json, toErrorResponse } from './errors';
import { clientKey, enforceLimit } from './limits';
import { notConfigured } from './upstream/chat';
import { selectUpstream } from './upstream/select';
import { handleStructure, STRUCTURE_PATH } from './structure/handler';
import { parseNextTokensRequest } from './validate';

export const NEXT_TOKENS_PATH = '/api/next-tokens';

type Route = (request: Request, env: Env, ctx: Ctx) => Promise<Response>;

async function nextTokens(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const { prefix, k } = await parseNextTokensRequest(request);
  const upstream = selectUpstream(env);
  const model = upstream.model;
  if (!model) throw notConfigured();
  const key = await cacheKey(model, prefix);
  const cached = await readCache(env.TG_CACHE, key);
  if (cached) return json({ model, k, cached: true, tokens: cached.slice(0, k) });
  const tokens = await paidCall(env, ctx, clientKey(request), () => upstream.nextTokens(prefix));
  writeCache(env.TG_CACHE, key, tokens, ctx);
  return json({ model, k, cached: false, tokens: tokens.slice(0, k) });
}

const ROUTES = new Map<string, Route>([
  [NEXT_TOKENS_PATH, nextTokens],
  [STRUCTURE_PATH, (request, env, ctx) => handleStructure(request, env, ctx)],
]);

export async function handle(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const { pathname } = new URL(request.url);
  const route = ROUTES.get(pathname);
  if (!route) {
    if (!pathname.startsWith('/api/') && env.ASSETS) return env.ASSETS.fetch(request);
    return errorResponse('invalid_input', 'There is no such endpoint.', 404);
  }
  try {
    await enforceLimit(env.RL_ALL, clientKey(request));
    if (request.method !== 'POST') return errorResponse('invalid_input', 'Use POST for this endpoint.', 405, { allow: 'POST' });
    return await route(request, env, ctx);
  } catch (err) {
    return toErrorResponse(err);
  }
}
