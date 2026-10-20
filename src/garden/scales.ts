/** Branch stroke width in px, linear in the conditional probability (PLAN D5): 1.5 px floor, 20 px at p = 1. */
export function branchWidth(p: number): number {
  const clamped = Math.min(1, Math.max(0, p));
  return 1.5 + 18.5 * clamped;
}

/** Probability as a short percentage label, e.g. 0.447 -> "44.7%", tiny values -> "<0.1%". */
export function formatPct(p: number): string {
  if (p > 0 && p < 0.0005) return '<0.1%';
  return `${(p * 100).toFixed(1)}%`;
}

/** One text form for a branch, shared by the tooltip and the accessible summary: the verbatim token in quotes + percentage. */
export function describeBranch(token: string, p: number): string {
  return `“${token}” ${formatPct(p)}`;
}
