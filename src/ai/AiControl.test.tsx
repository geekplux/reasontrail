// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { parseSession } from '../../shared/session/adapter';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import { SessionMap } from '../site/SessionMap';
import { Viewer } from '../viewer/Viewer';
import AiControl from './AiControl';

import trouble from '../../fixtures/sessions/claude-code/trouble.jsonl?raw';

const graph = parseSession({ files: [{ path: 'trouble.jsonl', text: trouble }] }) as SessionGraph;
const last = graph.steps[graph.steps.length - 1]?.id ?? '';
const reply = (body: { steps: { id: string }[] }) => ({
  model: 'fake-model',
  cached: false,
  labels: body.steps.map((s) => ({ stepId: s.id, label: s.id === last ? 'answer' : 'evidence', confidence: 0.8 })),
  links: [{ claimStepId: last, supportStepIds: [graph.steps[0]?.id, 'not-a-step'] }],
});

/** A session opened on the website (the drop zone's page): the card asks the model live. */
const OpenedCard = () => <SessionMap id="t" g={graph} step={null} onStep={() => {}} tag="trouble.jsonl" />;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('AI titles (phase 21; v7 §7)', () => {
  it('sends nothing before consent, ⌈n/200⌉ requests after it; tags in the list and rings in the tree; off is the plain map', async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (_url, init) => Response.json(reply(JSON.parse(String(init.body)))));
    vi.stubGlobal('fetch', fetch);
    const view = render(<OpenedCard />);
    const map = () => `${view.container.querySelector('.gl')?.outerHTML}${view.container.querySelector('.hero-tree svg')?.outerHTML}`;
    const before = map();
    fireEvent.click(screen.getByRole('button', { name: 'AI titles' }));
    expect(await screen.findByText('Ask a model to title this session?')).toBeTruthy();
    expect(screen.getByText(/redacted step summar/).textContent).toMatch(/^\d+ redacted step summar/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Ask a model to title this session?')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'AI titles' }));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AI titles' }).getAttribute('aria-pressed')).toBe('true'));
    const toggle = screen.getByRole('button', { name: 'AI titles' });
    expect(fetch).toHaveBeenCalledTimes(1); // the fixture has far fewer than 200 steps
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/structure');
    const tags = view.container.querySelectorAll('.gl .ai-tag');
    const rings = view.container.querySelectorAll('.hero-tree .ai-ring');
    expect(tags.length).toBeGreaterThan(0);
    expect(rings.length).toBe(tags.length); // every tagged episode row has its ring in the tree
    expect(view.container.querySelector('.ai-by')?.textContent).toBe('AI titles suggested by fake-model');
    const named = [...view.container.querySelectorAll('.gl [role="treeitem"]')].map((e) => e.textContent ?? '').filter((t) => t.includes('AI title'));
    expect(named.length).toBe(tags.length);
    expect(named.every((n) => n.includes('AI title, suggested by fake-model: '))).toBe(true);

    fireEvent.click(toggle);
    expect(map()).toBe(before);
    expect(view.container.querySelector('.ai-tag, .ai-ring, .ai-by')).toBeNull();
  });

  it('says the map still works when there is no Worker behind the site', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } })));
    render(<OpenedCard />);
    fireEvent.click(screen.getByRole('button', { name: 'AI titles' }));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    await waitFor(() => expect(document.querySelector('[data-ai-note="unavailable"]')?.textContent).toBe("AI titles aren't available here; the map still works."));
    expect(screen.queryByRole('button', { name: 'AI titles' })).toBeNull(); // nothing to retry here
  });

  it('shows the CLI overlay in the viewer behind an off-by-default toggle, with no consent and no requests', () => {
    const fetch = vi.fn<() => void>();
    vi.stubGlobal('fetch', fetch);
    const labels: LabelOverlay = { model: 'fake-model', createdAt: '', labels: [{ stepId: last, label: 'answer', confidence: 1 }], links: [] };
    const { container } = render(<Viewer loaded={{ ok: true, payload: { graph, meta: { version: '0' }, labels } }} />);
    const toggle = screen.getByRole('button', { name: 'AI titles' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.ai-tag')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.ai-tag')?.textContent).toBe('answer');
    expect(container.querySelectorAll('.hero-tree .ai-ring')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('announces progress and a cancel once, and does not announce a note that takes focus', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const announce = vi.fn<(text: string) => void>();
    render(<AiControl g={graph} source={{ live: true }} onOverlay={() => {}} announce={announce} />);
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    expect(announce).toHaveBeenLastCalledWith('Asking a model for AI titles'); // one batch
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(announce).toHaveBeenLastCalledWith('AI titles cancelled; nothing was kept');
    cleanup();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } })));
    announce.mockClear();
    render(<AiControl g={graph} source={{ live: true }} onOverlay={() => {}} announce={announce} />);
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send' })));
    const note = await waitFor(() => document.querySelector('[data-ai-note="unavailable"]') ?? Promise.reject(new Error('no note')));
    expect(document.activeElement).toBe(note);
    expect(announce.mock.calls.map(([t]) => t)).toEqual(['Asking a model for AI titles']);
  });

  it('keeps the name "AI titles" after the dialog is dismissed and after a run, with no middle dot', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => Response.json(reply(JSON.parse(String(init.body))))));
    render(<AiControl g={graph} source={{ live: true }} onOverlay={() => {}} announce={() => {}} />);
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
});
