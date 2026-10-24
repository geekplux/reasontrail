// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { parseSession } from '../../shared/session/adapter';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import { LIVE_AI, MapView } from '../map/MapView';
import { Viewer } from '../viewer/Viewer';
import AiControl from './AiControl';
import { StepAiNote } from './LabelBadge';

import trouble from '../../fixtures/sessions/claude-code/trouble.jsonl?raw';

const graph = parseSession({ files: [{ path: 'trouble.jsonl', text: trouble }] }) as SessionGraph;
const last = graph.steps[graph.steps.length - 1]?.id ?? '';
const reply = (body: { steps: { id: string }[] }) => ({
  model: 'fake-model',
  cached: false,
  labels: body.steps.map((s) => ({ stepId: s.id, label: s.id === last ? 'answer' : 'evidence', confidence: 0.8 })),
  links: [{ claimStepId: last, supportStepIds: [graph.steps[0]?.id, 'not-a-step'] }],
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('AI labels (phase 21)', () => {
  it('sends nothing before consent, ⌈n/200⌉ requests after it, and off restores the deterministic map exactly', async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (_url, init) => Response.json(reply(JSON.parse(String(init.body)))));
    vi.stubGlobal('fetch', fetch);
    const { container } = render(<MapView graph={graph} ai={LIVE_AI} />);
    const route = () => container.querySelector('.route-app')?.outerHTML;
    const before = route();
    fireEvent.click(screen.getByRole('button', { name: 'AI labels…' }));
    expect(await screen.findByText('Ask a model to label this session?')).toBeTruthy();
    expect(screen.getByText(/redacted step summar/).textContent).toMatch(/^\d+ redacted step summar/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Ask a model to label this session?')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'AI labels…' }));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    const toggle = await screen.findByRole('button', { name: 'AI labels, suggested by fake-model' });
    expect(fetch).toHaveBeenCalledTimes(1); // the fixture has far fewer than 200 steps
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/structure');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe(' AI labels · suggested by fake-model'); // the dashed swatch is the key
    expect(container.querySelectorAll('.route-canvas .ai-tag').length).toBeGreaterThan(0);
    const named = [...container.querySelectorAll('[data-episode-id]')].map((e) => e.getAttribute('aria-label') ?? '');
    expect(named.every((n) => n.includes('AI labels, suggested by fake-model: '))).toBe(true);

    fireEvent.click(toggle);
    expect(route()).toBe(before);
    expect(container.querySelector('.ai-tag:not(.ai-swatch), .ai-links')).toBeNull();
  });

  it('says the map still works when there is no Worker behind the site', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } })));
    render(<MapView graph={graph} ai={LIVE_AI} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI labels…' }));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    await waitFor(() => expect(document.querySelector('[data-ai-note="unavailable"]')?.textContent).toBe("AI labels aren't available here; the map still works."));
    expect(screen.queryByRole('button', { name: /AI labels/ })).toBeNull(); // nothing to retry here
  });

  it('shows the CLI overlay in the viewer behind an off-by-default toggle, with no consent and no requests', () => {
    const fetch = vi.fn<() => void>();
    vi.stubGlobal('fetch', fetch);
    const labels: LabelOverlay = { model: 'fake-model', createdAt: '', labels: [{ stepId: last, label: 'answer', confidence: 1 }], links: [] };
    const { container } = render(<Viewer loaded={{ ok: true, payload: { graph, meta: { version: '0' }, labels } }} />);
    return screen.findByRole('button', { name: 'AI labels, suggested by fake-model' }).then((toggle) => {
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      expect(container.querySelector('.ai-tag:not(.ai-swatch)')).toBeNull();
      fireEvent.click(toggle);
      expect(container.querySelector('.route-canvas .ai-tag')?.textContent).toBe('answer');
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it('announces progress and a cancel once, and does not announce a note that takes focus', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const announce = vi.fn<(text: string) => void>();
    render(<AiControl g={graph} source={{ live: true }} onOverlay={() => {}} announce={announce} />);
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    expect(announce).toHaveBeenLastCalledWith('Asking a model for AI labels'); // one batch
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(announce).toHaveBeenLastCalledWith('AI labels cancelled; nothing was kept');
    cleanup();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } })));
    announce.mockClear();
    render(<AiControl g={graph} source={{ live: true }} onOverlay={() => {}} announce={announce} />);
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    const note = await waitFor(() => document.querySelector('[data-ai-note="unavailable"]') ?? Promise.reject(new Error('no note')));
    expect(document.activeElement).toBe(note);
    expect(announce.mock.calls.map(([t]) => t)).toEqual(['Asking a model for AI labels']);
  });

  it('keeps the home card\'s name "AI titles" after the dialog is dismissed and after a run, with no middle dot', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => Response.json(reply(JSON.parse(String(init.body))))));
    render(<AiControl g={graph} source={{ live: true }} onOverlay={() => {}} announce={() => {}} label="AI titles" buttonClass="btn ghost" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })); // the consent dialog's Cancel
    const idle = screen.getByRole('button', { name: 'AI titles' });
    expect(idle.className).toBe('btn ghost');
    fireEvent.click(idle);
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    const toggle = await screen.findByRole('button', { name: 'AI titles' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('AI titles');
    expect(document.body.textContent).not.toContain('·');
  });

  it('lists the first 5 supporting steps, then all of them on request', () => {
    const ids = graph.steps.slice(0, 7).map((s) => s.id);
    const overlay: LabelOverlay = { model: 'fake-model', createdAt: '', labels: [{ stepId: last, label: 'answer', confidence: 1 }], links: [{ claimStepId: last, supportStepIds: ids }] };
    render(<StepAiNote g={graph} overlay={overlay} stepId={last} onPick={() => {}} />);
    expect(screen.getAllByText(/suggested by fake-model/)).toHaveLength(1);
    expect(document.querySelectorAll('.ai-supports li')).toHaveLength(5);
    const more = screen.getByRole('button', { name: 'Show all 7 steps' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(document.querySelectorAll('.ai-supports li')).toHaveLength(7);
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });
});
