/**
 * Temperature over a top-k list (PLAN D8): `q_i = p_i^(1/T) / Z` over the k shown chances plus the remainder `r`
 * (everything outside the top-k) as one pseudo-token, in log space so small T never underflows. T = 1 returns the
 * inputs; T = 0 is greedy: all mass on rank 0 (the true argmax, since every hidden token is <= p_k).
 */
export function temper(ps: readonly number[], r: number, t: number): { q: number[]; rest: number } {
  const rest = Math.max(0, r);
  if (t === 1 || ps.length === 0) return { q: [...ps], rest };
  if (t <= 0) {
    const top = ps.indexOf(Math.max(...ps)); // ties go to the lower rank
    return { q: ps.map((_, i) => (i === top ? 1 : 0)), rest: 0 };
  }
  const logs = [...ps, rest].map((p) => (p > 0 ? Math.log(p) / t : -Infinity));
  const max = Math.max(...logs);
  const e = logs.map((l) => Math.exp(l - max));
  const z = e.reduce((s, x) => s + x, 0);
  const q = e.map((x) => x / z);
  return { q: q.slice(0, ps.length), rest: q[ps.length]! };
}

/** A temperature as the slider shows it: "T 1.0", or "T 0 (greedy)". */
export const formatT = (t: number) => (t === 0 ? 'T 0 (greedy)' : `T ${t.toFixed(1)}`);

/** One fork at temperature `t`: the shown chances of its choices and of everything outside them. */
export function temperChoices(choices: readonly { logprob: number }[], t: number) {
  const ps = choices.map((c) => Math.exp(c.logprob));
  return temper(ps, 1 - ps.reduce((s, p) => s + p, 0), t);
}
