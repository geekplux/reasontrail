// "Save shareable copy" (PLAN V4, phase 24): redact the graph, summarise what was replaced, and write it into the
// self-contained viewer template. The website fetches its own built `/viewer.html`; the local viewer rebuilds the
// template from its own document. Pure apart from `fetchTemplate`, `templateFromDocument` and `download`.
import { DATA_SLOT, TITLE_SLOT, renderHtml } from '../../cli/src/html';
import { redactGraph, type RedactionSummary } from '../../shared/session/redact';
import type { SessionGraph } from '../../shared/session/types';
import type { ViewerPayload } from '../map/loadGraph';

export interface ShareCounts {
  secrets: number;
  emails: number;
  paths: number;
  /** Token-like tails of clipped text, replaced because they might be the start of a secret. */
  cut: number;
  /** Every replacement, all types. */
  total: number;
  /** Non-conversation records dropped (system records, environment dumps). */
  dropped: number;
}

export interface SharePlan {
  graph: SessionGraph;
  counts: ShareCounts;
  /** A few redacted excerpts around a placeholder, for "Preview redacted". */
  examples: string[];
  /** Steps that carry a raw excerpt. */
  rawExcerpts: number;
}

/** Placeholders written by the redaction rules: `[secret:<type>]`, `[email]`, `~` (home) and `-~` (project folder). */
export const PLACEHOLDER = /\[secret:[a-z-]+\]|\[email\]|\[dropped: [a-z ]+\]|(?<![\w~])-?~(?=[-/\\]|$)/g;

export function countsOf(summary: RedactionSummary): ShareCounts {
  const n = (pred: (k: string) => boolean) => Object.entries(summary.replaced).reduce((sum, [k, v]) => sum + (pred(k) ? v : 0), 0);
  return { secrets: n((k) => k.startsWith('secret:') && k !== 'secret:cut'), cut: n((k) => k === 'secret:cut'), emails: n((k) => k === 'email'), paths: n((k) => k === 'home-path'), total: n(() => true), dropped: summary.dropped };
}

/** The JSON string literal of `s` around index `i` (raw transcript lines are JSON): its bounds, or the whole string. */
function literalAround(s: string, i: number): [number, number] {
  if (!/^\s*[[{]/.test(s)) return [0, s.length];
  const quote = (j: number) => s[j] === '"' && s[j - 1] !== '\\';
  let a = Math.min(i, s.length - 1);
  while (a > 0 && !quote(a)) a--;
  let b = i;
  while (b < s.length && !quote(b)) b++;
  return a > 0 || quote(0) ? [a + 1, b] : [0, s.length];
}

const unjson = (s: string) => s.replace(/\\[nrt]/g, ' ').replace(/\\(["\\/])/g, '$1');

/** Placeholder sequence plus the 40 characters around the first one: excerpts that agree on it say the same thing. */
function excerptKey(text: string): string {
  const all = [...text.matchAll(PLACEHOLDER)];
  const at = all[0]?.index ?? 0;
  return `${all.map((m) => m[0]).join(' ')}|${text.slice(Math.max(0, at - 20), at + (all[0]?.[0].length ?? 0) + 20)}`;
}

/** Strings that redaction changed, as an excerpt of the redacted text around the first change (never the original);
 * an excerpt of a raw JSON line is cut to the string value that changed. Near-duplicates are skipped. */
export function redactedExcerpts(before: unknown, after: unknown, max = 3, out: string[] = [], keys = new Set<string>()): string[] {
  if (out.length >= max) return out;
  if (typeof before === 'string' && typeof after === 'string') {
    if (before === after) return out;
    let i = 0;
    while (i < before.length && before[i] === after[i]) i++;
    const [lo, hi] = literalAround(after, i);
    const start = Math.max(lo, i - 40);
    const end = Math.min(hi, start + 120);
    const text = unjson(after.slice(start, end)).replace(/\s+/g, ' ').trim();
    const key = excerptKey(text);
    if (!keys.has(key)) {
      keys.add(key);
      out.push(`${start > lo ? '…' : ''}${text}${end < hi ? '…' : ''}`);
    }
  } else if (before && after && typeof before === 'object' && typeof after === 'object') {
    const b = before as Record<string, unknown>;
    for (const [k, v] of Object.entries(after)) redactedExcerpts(b[k], v, max, out, keys);
  }
  return out;
}

/** The token-like run right before a clip's "…": a secret or address cut by a preview may no longer match any rule. */
const CUT_TAIL = /[A-Za-z0-9_+/=.@-]{6,}(?=…(?:\n|$))/gm;
const RISKY = /@|^(?:sk-|gh[pousr]_|github_pat_|xox|AKIA|ASIA|AIza|eyJ)|^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])/;

/** Replace token-like tails of clipped text (`…`) with `[secret:cut]`, counted in `counts`. */
export function redactCutTails(value: unknown, counts: Record<string, number>): unknown {
  if (typeof value === 'string') {
    return value.includes('…') ? value.replace(CUT_TAIL, (m) => (RISKY.test(m) ? ((counts['secret:cut'] = (counts['secret:cut'] ?? 0) + 1), '[secret:cut]') : m)) : value;
  }
  if (Array.isArray(value)) return value.map((v) => redactCutTails(v, counts));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactCutTails(v, counts)]));
}

/** The redacted graph, its counts and preview excerpts. The input is not changed. A graph built on the website was
 * clipped before redaction (unlike the CLI's `--share`), so the tails of clipped text get one more pass. */
export function planShare(graph: SessionGraph): SharePlan {
  const first = redactGraph(graph);
  const summary = { ...first.summary, replaced: { ...first.summary.replaced } };
  const red = redactCutTails(first.graph, summary.replaced) as SessionGraph;
  return { graph: red, counts: countsOf(summary), examples: redactedExcerpts(graph.steps, red.steps), rawExcerpts: red.steps.filter((s) => s.rawText).length };
}

/** The shared copy: the redacted graph in the viewer template, with the "Shared copy" ribbon (`prior`: items an
 * earlier shared copy already replaced). */
export function shareHtml(template: string, plan: SharePlan, version = '', prior = 0): string {
  const payload: ViewerPayload = { graph: plan.graph, meta: { version, shared: { replaced: plan.counts.total + prior } } };
  return renderHtml(template, payload);
}

/** `reasontrail-<first 8 chars of the session id>.html` (the CLI's `--share` name), safe as a file name. */
export function shareFileName(graph: SessionGraph, ext = 'html'): string {
  const id = graph.source.sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'map';
  return `reasontrail-${id}.${ext}`;
}

/** The website's built viewer template. The SPA fallback answers unknown paths with index.html: check the slots. */
export async function fetchTemplate(url = `${import.meta.env.BASE_URL}viewer.html`): Promise<string> {
  const res = await fetch(url);
  const text = res.ok ? await res.text() : '';
  if (!text.includes(DATA_SLOT) || !text.includes(TITLE_SLOT)) throw new Error('The viewer template could not be loaded.');
  return text;
}

/**
 * The local viewer's own template: this document without its payload, its rendered map and the inflated app script
 * (`#reasontrail-run`, added by the loader at run time; the gzip-packed copy and the loader stay). Throws outside a
 * built viewer page.
 */
export function templateFromDocument(doc: Document): string {
  const html = doc.documentElement.cloneNode(true) as HTMLElement;
  const data = html.querySelector('#reasontrail-data');
  if (!data || !html.querySelector('#reasontrail-app')) throw new Error('This page is not a Reasontrail map file.');
  data.textContent = DATA_SLOT;
  html.querySelector('#reasontrail-run')?.remove();
  const root = html.querySelector('#root');
  if (root) root.textContent = '';
  const title = html.querySelector('title');
  if (title) title.textContent = TITLE_SLOT;
  return `<!doctype html>\n${html.outerHTML}`;
}

/** Save `data` as a file through a temporary object URL. */
export function download(data: BlobPart, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
