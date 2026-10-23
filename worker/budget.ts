// Daily upstream budget (docs/llm-provider.md §6): a soft cap, since KV counters are not atomic. Cache hits never count.
import { ProviderError } from '../shared/llm/types';
import type { Ctx, Env, KvBinding } from './env';
import { enforceLimit } from './limits';

export const DEFAULT_DAILY_CAP = 1000;
export const BUDGET_TTL_SEC = 2 * 24 * 60 * 60;

/** `budget:<YYYY-MM-DD>` for the UTC day of `now`. */
export const budgetKey = (now: Date): string => `budget:${now.toISOString().slice(0, 10)}`;

/** `DAILY_UPSTREAM_CAP` as a whole number; anything else falls back to the default. "0" switches live calls off. */
export function dailyCap(raw: string | undefined): number {
  return raw !== undefined && /^\d+$/.test(raw.trim()) ? Number(raw) : DEFAULT_DAILY_CAP;
}

/**
 * Rejects with 503 `budget_exhausted` once today's count reaches `cap`; otherwise returns `spend`, which records one
 * upstream call via `waitUntil` (call it only after a successful call). Without KV there is no budget.
 */
export async function checkBudget(kv: KvBinding | undefined, cap: number, ctx: Ctx, now = new Date()): Promise<() => void> {
  if (!kv) return () => {};
  const key = budgetKey(now);
  let used = 0;
  try {
    used = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0;
  } catch (err) {
    console.warn('next-tokens: budget read failed', err);
  }
  if (used >= cap) throw new ProviderError('budget_exhausted', "Today's live budget is used up. Recorded gardens still work; try again tomorrow.");
  return () =>
    ctx.waitUntil(kv.put(key, String(used + 1), { expirationTtl: BUDGET_TTL_SEC }).catch((err: unknown) => console.warn('next-tokens: budget write failed', err)));
}

/** A cache miss: RL_MISS for `ip`, then the daily budget, then `call`; one unit is spent only if the call succeeds. */
export async function paidCall<T>(env: Env, ctx: Ctx, ip: string, call: () => Promise<T>): Promise<T> {
  await enforceLimit(env.RL_MISS, ip);
  const spend = await checkBudget(env.TG_CACHE, dailyCap(env.DAILY_UPSTREAM_CAP), ctx);
  const result = await call();
  spend();
  return result;
}
