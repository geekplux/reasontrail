// POST /api/structure: labels one batch of redacted step summaries. Cached in KV by the
// batch's SHA-256; a miss goes through RL_MISS and the daily budget like /api/next-tokens. No user key.
import type { StructureStep } from '../../shared/session/structure';
import { paidCall } from '../budget';
import { readJson, sha256Hex, writeJson } from '../cache';
import type { Ctx, Env } from '../env';
import { json } from '../errors';
import { clientKey } from '../limits';
import { notConfigured } from '../upstream/chat';
import { selectUpstream } from '../upstream/select';
import { STRUCTURE_CACHE_VERSION, structureBody } from './prompt';
import { parseReply, parseStructureRequest, sanitizeResult } from './schema';

export const STRUCTURE_PATH = '/api/structure';
/** A whole batch of labels takes longer than one token. */
export const STRUCTURE_TIMEOUT_MS = 60_000;

/** `st:v1:<model>:<sha256hex(batch)>`; no step text appears in the key. */
export async function structureCacheKey(model: string, steps: readonly StructureStep[]): Promise<string> {
  return `st:${STRUCTURE_CACHE_VERSION}:${model}:${await sha256Hex(JSON.stringify(steps))}`;
}

/** Answers one batch; rejects with `ProviderError` (the router maps it to a response). */
export async function handleStructure(request: Request, env: Env, ctx: Ctx, timeoutMs = STRUCTURE_TIMEOUT_MS): Promise<Response> {
  const { steps } = await parseStructureRequest(request);
  const upstream = selectUpstream(env);
  const model = upstream.model;
  if (!model) throw notConfigured();
  const ids = new Set(steps.map((s) => s.id));
  const key = await structureCacheKey(model, steps);
  const cached = await readJson(env.TG_CACHE, key, (v) => sanitizeResult(v, ids));
  if (cached) return json({ model, cached: true, ...cached });
  // The budget counts every answered call, even one whose answer then fails validation.
  const reply = await paidCall(env, ctx, clientKey(request), () => upstream.complete(structureBody(steps), timeoutMs));
  const result = parseReply(reply, ids);
  writeJson(env.TG_CACHE, key, result, ctx);
  return json({ model, cached: false, ...result });
}
