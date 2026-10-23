// The optional AI structuring pass (PLAN phase 20, X1–X4): request and response types for `POST /api/structure`,
// the redacted batches a session is sent as, and how answers merge into a `LabelOverlay` (never into the graph, D22).
import { redactGraph, redactText } from './redact';
import type { LabelOverlay, SessionGraph, Step, StepKind } from './types';

/** The fixed label set (X1); anything else in an answer is dropped. */
export const STRUCTURE_LABELS = ['sub-question', 'hypothesis', 'evidence', 'dead end', 'decision', 'answer'] as const;
export type StructureLabel = (typeof STRUCTURE_LABELS)[number];

/** Steps per batch (X1). */
export const BATCH_MAX_STEPS = 200;
/** Characters per step summary (X1). */
export const SUMMARY_MAX_CHARS = 300;
/** Batches per session (X2). */
export const SESSION_MAX_BATCHES = 5;
/** Supporting steps kept per claim. */
export const LINK_MAX_SUPPORTS = 10;

/** One redacted step summary. */
export interface StructureStep {
  id: string;
  kind: StepKind;
  text: string;
}

/** The body of `POST /api/structure`. */
export interface StructureRequest {
  steps: StructureStep[];
}

export interface StructureLabelItem {
  stepId: string;
  label: StructureLabel;
  /** 0..1, the model's own estimate. */
  confidence: number;
}

/** A claim and the steps that support it (`supports` edges in the overlay only). */
export interface StructureLink {
  claimStepId: string;
  supportStepIds: string[];
}

/** A validated answer: every step id is one of the batch's ids. */
export interface StructureResult {
  labels: StructureLabelItem[];
  links: StructureLink[];
}

/** The 200 body of `POST /api/structure`. */
export interface StructureResponse extends StructureResult {
  model: string;
  cached: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The valid part of an answer for a batch with step `ids` (the Worker's cache reads and replies, and the client's check of a response), or null if its shape is wrong. */
export function sanitizeResult(value: unknown, ids: ReadonlySet<string>): StructureResult | null {
  if (!isObject(value) || !Array.isArray(value.labels ?? []) || !Array.isArray(value.links ?? [])) return null;
  const labels = new Map<string, StructureLabelItem>();
  for (const l of (value.labels ?? []) as unknown[]) {
    if (!isObject(l) || typeof l.stepId !== 'string' || !ids.has(l.stepId) || labels.has(l.stepId)) continue;
    if (!STRUCTURE_LABELS.includes(l.label as StructureLabel)) continue;
    const c = l.confidence;
    if (typeof c !== 'number' || !(c >= 0 && c <= 1)) continue;
    labels.set(l.stepId, { stepId: l.stepId, label: l.label as StructureLabel, confidence: c });
  }
  const links = new Map<string, StructureLink>();
  for (const l of (value.links ?? []) as unknown[]) {
    if (!isObject(l) || typeof l.claimStepId !== 'string' || !ids.has(l.claimStepId) || links.has(l.claimStepId) || !Array.isArray(l.supportStepIds)) continue;
    const claim = l.claimStepId;
    const supports = [...new Set(l.supportStepIds.filter((s): s is string => typeof s === 'string' && ids.has(s) && s !== claim))].slice(0, LINK_MAX_SUPPORTS);
    if (supports.length > 0) links.set(claim, { claimStepId: claim, supportStepIds: supports });
  }
  return { labels: [...labels.values()], links: [...links.values()] };
}

// C0/C1 controls and lone surrogates, which the Worker rejects.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F]|\p{Cs}/gu;

/** The raw text the model sees for a step, before cleaning; undefined for steps with nothing to say. */
function rawSummary(step: Step): string | undefined {
  if (step.textStored === false || (step.kind === 'system' && !step.status)) return undefined;
  if (step.kind === 'tool-call') return step.tool?.summary;
  if (step.kind === 'tool-result') return step.text ? `${step.status ?? 'ok'}: ${step.text}` : undefined;
  return step.text;
}

/** One line, redacted, then clipped to {@link SUMMARY_MAX_CHARS} (redaction first, so no secret is cut in half). */
export function stepSummary(step: Step): string {
  const line = redactText((rawSummary(step) ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim());
  const chars = [...line];
  return chars.length <= SUMMARY_MAX_CHARS ? line : `${chars.slice(0, SUMMARY_MAX_CHARS - 1).join('')}…`;
}

/**
 * The batches to send for a session: redacted step summaries (redactGraph, then redactText on each line), at most
 * {@link SESSION_MAX_BATCHES} × {@link BATCH_MAX_STEPS}. A longer session keeps its first and last halves, where the
 * task and the answer are. Pass a graph built from `redactSession` output so no secret was clipped before this.
 */
export function buildBatches(graph: SessionGraph): StructureRequest[] {
  const steps = redactGraph(graph)
    .graph.steps.map((s) => ({ id: s.id, kind: s.kind, text: stepSummary(s) }))
    .filter((s) => s.text !== '');
  const cap = SESSION_MAX_BATCHES * BATCH_MAX_STEPS;
  const kept = steps.length > cap ? [...steps.slice(0, cap / 2), ...steps.slice(-cap / 2)] : steps;
  const batches: StructureRequest[] = [];
  for (let i = 0; i < kept.length; i += BATCH_MAX_STEPS) batches.push({ steps: kept.slice(i, i + BATCH_MAX_STEPS) });
  return batches;
}

/**
 * Adds one batch's answer to the overlay: a step's newer label replaces its older one, and a claim's supports are
 * merged. An overlay from another model is replaced, since each overlay names the one model that suggested it (X3).
 */
export function mergeOverlay(overlay: LabelOverlay | undefined, answer: StructureResponse, createdAt = new Date().toISOString()): LabelOverlay {
  const base = overlay?.model === answer.model ? overlay : undefined;
  const labels = new Map((base?.labels ?? []).map((l) => [l.stepId, l]));
  for (const l of answer.labels) labels.set(l.stepId, { stepId: l.stepId, label: l.label, confidence: l.confidence });
  const links = new Map((base?.links ?? []).map((l) => [l.claimStepId, l.supportStepIds]));
  for (const l of answer.links) links.set(l.claimStepId, [...new Set([...(links.get(l.claimStepId) ?? []), ...l.supportStepIds])]);
  return {
    model: answer.model,
    createdAt,
    labels: [...labels.values()],
    links: [...links].map(([claimStepId, supportStepIds]) => ({ claimStepId, supportStepIds })),
  };
}
