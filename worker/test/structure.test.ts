import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StructureStep } from '../../shared/session/structure';
import { budgetKey } from '../budget';
import { handle } from '../handler';
import { STRUCTURE_SYSTEM_PROMPT } from '../structure/prompt';
import { handleStructure, structureCacheKey } from '../structure/handler';
import { FakeAi, fakeCtx, fakeEnv, FakeRateLimit } from './fakes';
import FIXTURE from './fixtures/structure-response.json';

const MODEL = '@cf/zai-org/glm-4.7-flash';
const STEPS: StructureStep[] = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, kind: i % 2 ? 'assistant' : 'tool-result', text: `step ${i} summary` }));
const reply = (content: unknown) => ({ choices: [{ index: 0, message: { role: 'assistant', content } }] });

const req = (body: unknown, ip = '203.0.113.7') =>
  new Request('https://garden.test/api/structure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function call(body: unknown, env = fakeEnv({ AI: new FakeAi(() => FIXTURE) })) {
  const ctx = fakeCtx();
  const res = await handle(req(body), env, ctx);
  await ctx.settle();
  return { res, body: (await res.json()) as Body, env };
}
interface Body {
  model: string;
  cached: boolean;
  labels: { stepId: string; label: string; confidence: number }[];
  links: { claimStepId: string; supportStepIds: string[] }[];
  error: { code: string };
}
interface Inputs {
  temperature: number;
  chat_template_kwargs: unknown;
  response_format: unknown;
  messages: { role: string; content: string }[];
}
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/structure (X1, X2, X4)', () => {
  it('200: one low-temperature JSON-schema call, labels and links validated, stored under st:v1:<model>:<sha256>', async () => {
    const { res, body, env } = await call({ steps: STEPS });
    expect(res.status).toBe(200);
    expect(body.model).toBe(MODEL);
    expect(body.cached).toBe(false);
    expect(body.labels).toHaveLength(6);
    expect(body.labels[0]).toEqual({ stepId: 's1', label: 'sub-question', confidence: 0.82 });
    expect(body.links).toEqual([{ claimStepId: 's7', supportStepIds: ['s5', 's6'] }, { claimStepId: 's9', supportStepIds: ['s5', 's8'] }]);
    expect(env.AI.calls).toHaveLength(1);
    const inputs = env.AI.calls[0]!.inputs as unknown as Inputs;
    expect(inputs.temperature).toBeLessThanOrEqual(0.2);
    expect(inputs.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(inputs.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'reasoning_structure', strict: true } });
    expect(inputs.messages[0]).toEqual({ role: 'system', content: STRUCTURE_SYSTEM_PROMPT });
    expect(inputs.messages[1]!.content.split('\n')[1]).toBe('s1 [assistant] step 1 summary');
    const key = await structureCacheKey(MODEL, STEPS);
    expect(key).toMatch(/^st:v1:@cf\/zai-org\/glm-4\.7-flash:[0-9a-f]{64}$/);
    expect(JSON.parse(env.TG_CACHE.store.get(key)!.value)).toEqual({ labels: body.labels, links: body.links });
    expect(env.TG_CACHE.store.get(budgetKey(new Date()))?.value).toBe('1');
  });

  it('a cache hit makes no upstream call and spends nothing', async () => {
    const env = fakeEnv({ AI: new FakeAi(() => FIXTURE) });
    await call({ steps: STEPS }, env);
    const { res, body } = await call({ steps: STEPS }, env);
    expect([res.status, body.cached, body.labels.length]).toEqual([200, true, 6]);
    expect(env.AI.calls).toHaveLength(1);
    expect(env.RL_MISS.counts.get('203.0.113.7')).toBe(1);
    expect(env.TG_CACHE.store.get(budgetKey(new Date()))?.value).toBe('1');
  });

  it('drops unknown step ids, invalid labels, bad confidences and self-links', async () => {
    const content = JSON.stringify({
      labels: [
        { stepId: 's2', label: 'hypothesis', confidence: 0.6 },
        { stepId: 's404', label: 'evidence', confidence: 0.9 },
        { stepId: 's3', label: 'conspiracy', confidence: 0.9 },
        { stepId: 's4', label: 'answer', confidence: 7 },
        { stepId: 's2', label: 'answer', confidence: 0.9 },
      ],
      links: [
        { claimStepId: 's9', supportStepIds: ['s404', 's9', 's1', 's1'] },
        { claimStepId: 's404', supportStepIds: ['s1'] },
        { claimStepId: 's8', supportStepIds: ['s999'] },
      ],
    });
    const { res, body } = await call({ steps: STEPS }, fakeEnv({ AI: new FakeAi(() => reply(content)) }));
    expect(res.status).toBe(200);
    expect(body.labels).toEqual([{ stepId: 's2', label: 'hypothesis', confidence: 0.6 }]);
    expect(body.links).toEqual([{ claimStepId: 's9', supportStepIds: ['s1'] }]);
  });

  it.each([
    ['invalid JSON', reply('{"labels": [')],
    ['a <think>-prefixed reply', reply('<think>Let me look at s1 first.</think>{"labels":[],"links":[]}')],
    ['the wrong shape', reply('["s1"]')],
    ['no content', reply(null)],
  ])('502 upstream_error for %s, and nothing is cached', async (_, answer) => {
    const { res, body, env } = await call({ steps: STEPS }, fakeEnv({ AI: new FakeAi(() => answer) }));
    expect([res.status, body.error.code]).toEqual([502, 'upstream_error']);
    expect([...env.TG_CACHE.store.keys()].some((k) => k.startsWith('st:'))).toBe(false);
  });

  it('429 rate_limited from RL_MISS before any upstream call', async () => {
    const { res, body, env } = await call({ steps: STEPS }, fakeEnv({ AI: new FakeAi(() => FIXTURE), RL_MISS: new FakeRateLimit(0) }));
    expect([res.status, res.headers.get('retry-after'), body.error.code]).toEqual([429, '60', 'rate_limited']);
    expect(env.AI.calls).toHaveLength(0);
  });

  it('503 budget_exhausted once the shared daily budget is spent', async () => {
    const { res, body, env } = await call({ steps: STEPS }, fakeEnv({ AI: new FakeAi(() => FIXTURE), DAILY_UPSTREAM_CAP: '0' }));
    expect([res.status, body.error.code]).toEqual([503, 'budget_exhausted']);
    expect(env.AI.calls).toHaveLength(0);
  });

  it('a timeout is upstream_error', async () => {
    quiet();
    const env = fakeEnv({ AI: new FakeAi(() => new Promise(() => {})) });
    await expect(handleStructure(req({ steps: STEPS }), env, fakeCtx(), 20)).rejects.toMatchObject({ code: 'upstream_error', message: expect.stringContaining('too long') });
  });

  it.each([
    ['201 steps', { steps: Array.from({ length: 201 }, (_, i) => ({ id: `s${i}`, kind: 'user', text: 'x' })) }],
    ['a 301-character summary', { steps: [{ id: 's1', kind: 'user', text: 'é'.repeat(301) }] }],
    ['a body over 256 KB', JSON.stringify({ steps: STEPS, pad: 'x'.repeat(256 * 1024) })],
  ])('413 input_too_large for %s, with no upstream call', async (_, body) => {
    const { res, body: out, env } = await call(body);
    expect([res.status, out.error.code]).toEqual([413, 'input_too_large']);
    expect(env.AI.calls).toHaveLength(0);
  });

  it.each([
    ['no steps', { steps: [] }],
    ['a duplicate id', { steps: [STEPS[0], STEPS[0]] }],
    ['an unknown kind', { steps: [{ id: 's1', kind: 'tool', text: 'x' }] }],
    ['a control character', { steps: [{ id: 's1', kind: 'user', text: 'a\u0007b' }] }],
  ])('400 invalid_input for %s', async (_, body) => {
    const { res, body: out } = await call(body);
    expect([res.status, out.error.code]).toEqual([400, 'invalid_input']);
  });

  it('X4: no user key; the default upstream is Workers AI, and a missing model is 503 unavailable', async () => {
    const { res, body } = await call({ steps: STEPS }, fakeEnv({ MODEL_ID: '' }));
    expect([res.status, body.error.code]).toEqual([503, 'unavailable']);
  });

  it('X4: UPSTREAM=openai-compatible sends the same body with the configured model', async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(FIXTURE), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const env = fakeEnv({ UPSTREAM: 'openai-compatible', OPENAI_BASE_URL: 'https://llm.test/v1/', OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'small-model' });
    const { res, body } = await call({ steps: STEPS }, env);
    expect([res.status, body.model, body.labels.length]).toEqual([200, 'small-model', 6]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://llm.test/v1/chat/completions');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'small-model', response_format: { type: 'json_schema' } });
    expect(env.AI.calls).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
