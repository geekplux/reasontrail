// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StructureRequest } from '../../shared/session/structure';
import type { SessionGraph, Step } from '../../shared/session/types';
import { createStructureController, useStructure } from './useStructure';

const step = (i: number): Step => ({ id: `s${i}`, seq: i, laneId: 'main', kind: 'assistant', text: `thought ${i}`, raw: { file: 'a.jsonl', line: i + 1 } });
const graph = (n: number) => ({ schemaVersion: 1, title: 't', lanes: [], steps: Array.from({ length: n }, (_, i) => step(i)), edges: [], episodes: [], trouble: [] }) as unknown as SessionGraph;

const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A fake Worker: labels the first step of each batch and links the last to the first; records every request. */
function fakeFetch(reply?: (batch: StructureRequest, n: number) => Response | Promise<Response>) {
  const calls: { url: string; batch: StructureRequest }[] = [];
  const fn = async (url: RequestInfo | URL, init?: RequestInit) => {
    const batch = JSON.parse(String(init?.body)) as StructureRequest;
    calls.push({ url: String(url), batch });
    if (reply) return reply(batch, calls.length);
    const [first, last] = [batch.steps[0]?.id ?? '', batch.steps.at(-1)?.id ?? ''];
    return jsonRes({
      model: '@cf/test/model',
      cached: false,
      labels: [{ stepId: first, label: 'hypothesis', confidence: 0.7 }, { stepId: 'nope', label: 'answer', confidence: 1 }],
      links: [{ claimStepId: last, supportStepIds: [first, 'ghost'] }],
    });
  };
  return { fn: fn as typeof fetch, calls };
}

describe('createStructureController', () => {
  it('sends nothing before consent, then exactly ceil(n/200) sequential POSTs, and merges an overlay', async () => {
    const { fn, calls } = fakeFetch();
    const c = createStructureController(graph(450), { fetch: fn });
    expect(c.summary()).toMatchObject({ steps: 450, batches: 3, endpoint: '/api/structure' });
    expect(c.summary().characters).toBe(Array.from({ length: 450 }, (_, i) => `thought ${i}`.length).reduce((a, b) => a + b));
    expect(c.summary().caching).toMatch(/never your text.*cached per batch/);
    c.request();
    expect(c.getState()).toMatchObject({ status: 'consent-needed', summary: { batches: 3 } });
    expect(calls).toHaveLength(0);
    const seen: string[] = [];
    c.subscribe(() => {
      const s = c.getState();
      if (s.status === 'sending') seen.push(`${s.done}/${s.total}`);
    });
    await c.consent();
    expect(calls.map((x) => [x.url, x.batch.steps.length])).toEqual([['/api/structure', 200], ['/api/structure', 200], ['/api/structure', 50]]);
    expect(seen).toEqual(['0/3', '1/3', '2/3']);
    const s = c.getState();
    if (s.status !== 'ready') throw new Error(s.status);
    expect(s.overlay.model).toBe('@cf/test/model');
    expect(s.overlay.labels.map((l) => l.stepId)).toEqual(['s0', 's200', 's400']); // 'nope' dropped
    expect(s.overlay.links).toContainEqual({ claimStepId: 's199', supportStepIds: ['s0'] }); // 'ghost' dropped
    c.clear();
    expect(c.getState()).toEqual({ status: 'idle' });
  });

  it('caps a long session at 5 POSTs and does nothing on consent without request', async () => {
    const { fn, calls } = fakeFetch();
    const c = createStructureController(graph(1400), { fetch: fn, endpoint: 'https://x.test/api/structure' });
    await c.consent();
    expect(calls).toHaveLength(0);
    c.request();
    await c.consent();
    expect(calls).toHaveLength(5);
    expect(calls[0]?.url).toBe('https://x.test/api/structure');
  });

  it.each([
    ['a 404 from a static host', () => new Response('Not found', { status: 404 })],
    ['an HTML page', () => new Response('<!doctype html><p>app</p>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['no model connected (503 unavailable)', () => jsonRes({ error: { code: 'unavailable', message: 'x' } }, 503)],
  ])('treats %s as unavailable', async (_, reply) => {
    const c = createStructureController(graph(3), { fetch: fakeFetch(reply).fn });
    c.request();
    await c.consent();
    expect(c.getState()).toEqual({ status: 'unavailable', message: "AI titles aren't available here; the map still works." });
  });

  it('maps API errors to calm messages and stops at the first failure', async () => {
    const { fn, calls } = fakeFetch(() => jsonRes({ error: { code: 'rate_limited', message: 'x' } }, 429, { 'retry-after': '12' }));
    const c = createStructureController(graph(450), { fetch: fn });
    c.request();
    await c.consent();
    expect(calls).toHaveLength(1);
    expect(c.getState()).toMatchObject({ status: 'error', code: 'rate_limited', retryAfterSec: 12, message: expect.stringMatching(/12 s; the map still works/) });
    for (const [code, status, re] of [
      ['budget_exhausted', 503, /budget/],
      ['upstream_error', 502, /Try again; the map still works/],
      ['input_too_large', 413, /couldn't be sent/],
    ] as const) {
      const d = createStructureController(graph(2), { fetch: fakeFetch(() => jsonRes({ error: { code, message: 'x' } }, status)).fn });
      d.request();
      await d.consent();
      expect(d.getState()).toMatchObject({ status: 'error', code, message: expect.stringMatching(re) });
    }
  });

  it('rejects an answer that does not match the schema', async () => {
    const c = createStructureController(graph(2), { fetch: fakeFetch(() => jsonRes({ model: 'm', labels: 'x' })).fn });
    c.request();
    await c.consent();
    expect(c.getState()).toMatchObject({ status: 'error', code: 'upstream_error' });
  });

  it('cancel aborts the request in flight and returns to idle without an overlay', async () => {
    let signal: AbortSignal | undefined;
    const fn = ((_: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise((_r, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }) as typeof fetch;
    const c = createStructureController(graph(3), { fetch: fn });
    c.request();
    const done = c.consent();
    expect(c.getState()).toMatchObject({ status: 'sending', done: 0, total: 1 });
    c.cancel();
    await done;
    expect(signal?.aborted).toBe(true);
    expect(c.getState()).toEqual({ status: 'idle' });
  });
});

describe('useStructure', () => {
  it('exposes the state and makes no request until consent', async () => {
    const { fn, calls } = fakeFetch();
    const g = graph(5);
    const { result } = renderHook(() => useStructure(g, { fetch: fn }));
    expect(result.current.state).toEqual({ status: 'idle' });
    act(() => result.current.request());
    expect(result.current.state.status).toBe('consent-needed');
    expect(calls).toHaveLength(0);
    await act(() => result.current.consent());
    expect(calls).toHaveLength(1);
    expect(result.current.state.status).toBe('ready');
  });
});
