// Reusable contract every adapter must pass. Returns violations (empty = pass) so it runs under any test runner.
import type { SessionAdapter } from './adapter';
import { buildGraph } from './build/graph';
import { firstLines } from './jsonl';
import type { SessionGraph, SessionInput } from './types';

/** Appended to the main file to prove the adapter counts what it cannot read. */
const PROBE = 'this is not json\n{"type":"tg-contract-unknown-record"}\n{"type":"user","mess';

function build(adapter: SessionAdapter, input: SessionInput): SessionGraph | string {
  try {
    return buildGraph(adapter.parse(input));
  } catch (e) {
    return `threw: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Check one adapter against one input. Each returned string names one broken rule. */
export function checkAdapterContract(adapter: SessionAdapter, input: SessionInput): string[] {
  const out: string[] = [];
  const main = input.files.find((f) => f.path.endsWith('.jsonl'));
  if (!main) return ['input has no .jsonl file'];
  if (!adapter.sniff(firstLines(main.text))) out.push('sniff rejects its own input');

  const g = build(adapter, input);
  if (typeof g === 'string') return [...out, g];
  const again = build(adapter, input);
  if (JSON.stringify(g) !== JSON.stringify(again)) out.push('output is not deterministic');

  const paths = new Set(input.files.map((f) => f.path));
  const lanes = new Set(g.lanes.map((l) => l.id));
  const ids = new Set<string>();
  let lastTime = Number.NEGATIVE_INFINITY;
  g.steps.forEach((s, i) => {
    if (s.seq !== i || s.id !== `s${i}` || ids.has(s.id)) out.push(`step ${i}: bad id/seq`);
    ids.add(s.id);
    if (!paths.has(s.raw.file) || !Number.isInteger(s.raw.line) || s.raw.line < 1) out.push(`step ${s.id}: missing provenance`);
    if (!lanes.has(s.laneId)) out.push(`step ${s.id}: unknown lane ${s.laneId}`);
    const t = s.t ? Date.parse(s.t) : Number.NaN;
    if (!Number.isNaN(t)) {
      if (t < lastTime) out.push(`step ${s.id}: out of time order`);
      lastTime = t;
    }
  });
  for (const e of g.edges) {
    const from = Number(e.from.slice(1));
    const to = Number(e.to.slice(1));
    if (!ids.has(e.from) || !ids.has(e.to) || from >= to) out.push(`edge ${e.from}->${e.to} (${e.kind}) is invalid`);
  }
  if (g.stats.steps !== g.steps.length) out.push('stats.steps does not match');

  // Compare against the main file cut at its last newline, so an existing partial line does not skew the deltas.
  const cut = main.text.slice(0, main.text.lastIndexOf('\n') + 1);
  const withMain = (text: string): SessionInput => ({ files: input.files.map((f) => (f === main ? { path: f.path, text } : f)) });
  const base = build(adapter, withMain(cut));
  const probed = build(adapter, withMain(cut + PROBE));
  if (typeof probed === 'string' || typeof base === 'string') out.push(`probe ${String(probed)}`);
  else {
    const d = (k: 'skippedLines' | 'partialLines' | 'unknownRecords') => probed.stats[k] - base.stats[k];
    if (d('skippedLines') !== 2 || d('partialLines') !== 1 || d('unknownRecords') !== 1) {
      out.push(`probe not counted: skipped +${d('skippedLines')}, partial +${d('partialLines')}, unknown +${d('unknownRecords')}`);
    }
  }
  return out;
}
