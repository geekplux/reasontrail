// Hand-written validation for POST /api/structure: the request limits, the JSON schema the model is asked
// to follow, and the check of its answer. Unknown step ids and invalid labels are dropped, never shown.
import { ProviderError } from '../../shared/llm/types';
import {
  BATCH_MAX_STEPS,
  LINK_MAX_SUPPORTS,
  STRUCTURE_LABELS,
  SUMMARY_MAX_CHARS,
  sanitizeResult,
  type StructureRequest,
  type StructureResult,
} from '../../shared/session/structure';

export { sanitizeResult };
import type { StepKind } from '../../shared/session/types';
import { BAD_CHARS, invalid, readJsonObject } from '../validate';

/** 200 steps × 300 chars, with room for multi-byte text and JSON overhead. */
export const MAX_STRUCTURE_BODY_BYTES = 256 * 1024;
const STEP_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const KINDS: readonly StepKind[] = ['user', 'assistant', 'thinking', 'tool-call', 'tool-result', 'system', 'compaction'];

const tooLarge = (message: string) => new ProviderError('input_too_large', message);

/** Reads and checks a batch; rejects with `invalid_input` (400) or `input_too_large` (413). */
export async function parseStructureRequest(request: Request): Promise<StructureRequest> {
  const { steps } = await readJsonObject(request, MAX_STRUCTURE_BODY_BYTES, tooLarge);
  if (!Array.isArray(steps) || steps.length === 0) throw invalid('`steps` must be a non-empty array.');
  if (steps.length > BATCH_MAX_STEPS) throw tooLarge(`Send at most ${BATCH_MAX_STEPS} steps per batch.`);
  const seen = new Set<string>();
  return {
    steps: steps.map((raw: unknown, i) => {
      const { id, kind, text } = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      if (typeof id !== 'string' || !STEP_ID.test(id) || seen.has(id)) throw invalid(`steps[${i}].id must be a unique step id.`);
      seen.add(id);
      if (!KINDS.includes(kind as StepKind)) throw invalid(`steps[${i}].kind is not a step kind.`);
      if (typeof text !== 'string' || text.trim() === '') throw invalid(`steps[${i}].text must be a non-empty string.`);
      const clean = text.normalize('NFC');
      if ([...clean].length > SUMMARY_MAX_CHARS) throw tooLarge(`steps[${i}].text must be at most ${SUMMARY_MAX_CHARS} characters.`);
      if (BAD_CHARS.test(clean)) throw invalid(`steps[${i}].text contains control characters.`);
      return { id, kind: kind as StepKind, text: clean };
    }),
  };
}

/** The JSON schema for `response_format` (Workers AI and OpenAI-compatible JSON mode). */
export const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['labels', 'links'],
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stepId', 'label', 'confidence'],
        properties: { stepId: { type: 'string' }, label: { type: 'string', enum: STRUCTURE_LABELS }, confidence: { type: 'number', minimum: 0, maximum: 1 } },
      },
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claimStepId', 'supportStepIds'],
        properties: { claimStepId: { type: 'string' }, supportStepIds: { type: 'array', items: { type: 'string' }, maxItems: LINK_MAX_SUPPORTS } },
      },
    },
  },
} as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const bad = (message: string) => new ProviderError('upstream_error', message);

/** The validated answer in a chat completion (or a legacy Workers AI `{response}`); rejects with `upstream_error`. */
export function parseReply(completion: unknown, ids: ReadonlySet<string>): StructureResult {
  const c = isObject(completion) ? completion : {};
  const choice = Array.isArray(c.choices) && isObject(c.choices[0]) ? c.choices[0] : {};
  const content = (isObject(choice.message) ? choice.message.content : undefined) ?? c.response;
  let value: unknown = content;
  if (typeof content === 'string') {
    if (/^\s*<think>/i.test(content)) throw bad('The model started thinking instead of answering.');
    try {
      value = JSON.parse(content);
    } catch {
      throw bad('The model did not return valid JSON.');
    }
  }
  const result = sanitizeResult(value, ids);
  if (!result) throw bad("The model's answer did not match the schema.");
  return result;
}
