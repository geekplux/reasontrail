// Redaction (PLAN R1, R4, §5.13, D24): secrets, emails and home paths become typed placeholders; content that is not
// conversation is dropped. On for samples, shared files and anything sent to AI; off in the private local view.
// Self-contained (type imports only): scripts/audit-samples.mjs loads this file directly.
import type { SessionGraph, Step } from './types';

/** What was replaced (by placeholder type) and how many non-conversation contents were dropped. */
export interface RedactionSummary {
  replaced: Record<string, number>;
  dropped: number;
}

/** Minimum Shannon entropy (bits per char) for an unlabelled 32+ char string to count as a secret. */
export const ENTROPY_MIN = 4.2;

const SECRET_WORD = /(passw|secret)|(key|token|tokens|auth|cookie|cookies|session|pwd|credentials?)$/;

/** True when a `NAME=value` / `"name": "value"` name is secret-like: its last word names a key, token, secret, … (`sessionId` is not). */
export function isSecretName(name: string): boolean {
  const words = name.replace(/^-+/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return SECRET_WORD.test(words[words.length - 1] ?? '');
}

function isSecretValue(raw: string): boolean {
  const v = raw.replace(/^["']|["']$/g, '');
  return v.length >= 3 && !/^(\d+(\.\d+)?|true|false|null|none|undefined|yes|no|[x*.]+)$/i.test(v) && !/^[$[<{]/.test(v);
}

function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

type Replacer = (match: string, ...groups: string[]) => string | undefined;
/** [placeholder type, pattern, replacement (undefined keeps the match)]. Order matters: specific formats first. */
const RULES: [string, RegExp, string | Replacer][] = [
  ['secret:private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[secret:private-key]'],
  ['secret:anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{16,}/g, '[secret:anthropic-key]'],
  ['secret:openai-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, '[secret:openai-key]'],
  ['secret:github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,})/g, '[secret:github-token]'],
  ['secret:slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[secret:slack-token]'],
  ['secret:aws-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[secret:aws-key]'],
  ['secret:google-key', /\bAIza[0-9A-Za-z_-]{35}/g, '[secret:google-key]'],
  ['secret:jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[secret:jwt]'],
  ['secret:auth', /\b(authorization["']?\s*[:=]\s*["']?(?:bearer|basic|token)\s+)[A-Za-z0-9._~+/=-]{4,}/gi, '$1[secret:auth]'],
  ['secret:url-credentials', /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, '$1[secret:url-credentials]@'],
  ['secret:value', /(?<![\w-])((?:--)?[A-Za-z_][\w.-]*)=("[^"\n]*"|'[^'\n]*'|[^\s"'&;,)<>]+)/g, (_m, name = '', value = '') => (isSecretName(name) && isSecretValue(value) ? `${name}=[secret:value]` : undefined)],
  ['secret:value', /("([\w.-]+)"\s*:\s*)"((?:[^"\\\n]|\\.)*)"/g, (_m, head = '', name = '', value = '') => (isSecretName(name) && isSecretValue(value) ? `${head}"[secret:value]"` : undefined)],
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g, (m) => (m.startsWith('git@') ? undefined : '[email]')],
  ['home-path', /(?:\/home|\/Users)\/[^/\s"'`:;,)\]]+|\b[A-Za-z]:\\Users\\[^\\\s"']+/g, '~'],
  // Claude Code project folders encode the cwd ("-home-<user>-proj"): keep the shape, drop the user name.
  ['home-path', /(?<![\w-])-(?:home|Users)-[A-Za-z0-9._]+(?=-)/g, '-~'],
  ['secret:high-entropy', /[A-Za-z0-9+_=-]{32,}/g, (m, ...rest) => {
    const at = rest[rest.length - 2] as unknown as number;
    const input = rest[rest.length - 1] ?? '';
    let start = at;
    while (start > 0 && /[A-Za-z0-9+/=_-]/.test(input[start - 1] ?? '')) start--;
    const integrity = /^sha(1|256|384|512)-/.test(input.slice(start, at + 1));
    const mixed = /[a-z]/.test(m) && /[A-Z]/.test(m) && /[0-9]/.test(m);
    return !integrity && mixed && entropy(m) >= ENTROPY_MIN ? '[secret:high-entropy]' : undefined;
  }],
];

/** Redact one string. `counts` gets one entry per replacement, by placeholder type. */
export function redactText(text: string, counts: Record<string, number> = {}): string {
  let out = text;
  for (const [type, re, rep] of RULES) {
    out = out.replace(re, (match: string, ...groups: string[]) => {
      const next = typeof rep === 'string' ? rep.replace('$1', groups[0] ?? '') : rep(match, ...groups);
      if (next === undefined || next === match) return match;
      counts[type] = (counts[type] ?? 0) + 1;
      return next;
    });
  }
  return out;
}

/** Placeholder types found in `text` (empty = clean). Used by `pnpm audit:samples`. */
export function findSecrets(text: string): string[] {
  const counts: Record<string, number> = {};
  redactText(text, counts);
  return Object.keys(counts);
}

/** Identifier fields that never hold user content. */
const KEEP = new Set(['id', 'seq', 'laneId', 'stepIds', 'uuid', 'callId', 'spawnedBy', 'from', 'to', 'kind', 'status', 'category', 'stepId', 'answerStepId', 'parentId', 'label', 'editHash', 'schemaVersion', 'sessionId']);
const ENV_LINE = /^[A-Z_][A-Z0-9_]*=/;

/** R4: text that is not conversation (meta/system records, environment dumps), or `undefined` to keep it. */
function dropReason(step: Step): string | undefined {
  if (!step.text) return undefined;
  if (step.kind === 'system' && !step.status) return '[dropped: system record]';
  const lines = step.text.split('\n');
  const env = lines.filter((l) => ENV_LINE.test(l)).length;
  return env >= 5 && env * 2 >= lines.length ? '[dropped: environment dump]' : undefined;
}

function walk(value: unknown, counts: Record<string, number>): unknown {
  if (typeof value === 'string') return redactText(value, counts);
  if (Array.isArray(value)) return value.map((v) => walk(v, counts));
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = KEEP.has(k) ? v : walk(v, counts);
  return out;
}

/** A redacted copy of the graph (the input is not changed) and a summary of what was replaced or dropped. */
export function redactGraph(graph: SessionGraph): { graph: SessionGraph; summary: RedactionSummary } {
  const summary: RedactionSummary = { replaced: {}, dropped: 0 };
  const steps = graph.steps.map((s) => {
    const reason = dropReason(s);
    if (!reason) return s;
    summary.dropped++;
    return { ...s, text: reason };
  });
  return { graph: walk({ ...graph, steps }, summary.replaced) as SessionGraph, summary };
}
