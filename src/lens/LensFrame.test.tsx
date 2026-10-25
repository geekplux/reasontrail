// @vitest-environment happy-dom
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CAP_NOTE, CAP_NOTE_SHORT, LensFrame } from './LensFrame';
import { lensSamples } from './lensSamples';
import type { LensTarget } from './lensTarget';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

const liveOnly: LensTarget = { sentence: 'The build passes on the second try.', prompt: 'The build passes', stepId: 's9', where: 'Checks', sampleTitle: undefined, recorded: undefined };

async function renderLens(target: LensTarget) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <LensFrame target={target} focusOnOpen={false} onBack={() => {}} />
      </Suspense>,
    );
  });
}
const capLines = () => screen.queryAllByText(CAP_NOTE);

const okFetch = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const tokens = [' map', ' plan', ' team'].map((token, i) => ({ token, logprob: -0.6 - i * 0.5 }));
    return new Response(JSON.stringify({ model: 'fake-open-model', tokens }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
const optInButton = () => screen.getByRole('button', { name: 'Grow live with an open model' });
const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));

describe('LensFrame daily-cap note', () => {
  it('says live calls are capped per day next to the opt-in and while live growth is on', async () => {
    const fetch = okFetch();
    await renderLens({ ...liveOnly, prompt: 'The build passes ok' });
    expect(capLines()).toHaveLength(1);
    expect(capLines()[0]?.className).toBe('lens-cap');
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(optInButton());
    });
    await settle();
    expect(fetch).toHaveBeenCalled();
    expect(document.getElementById('lens-live')).not.toBeNull();
    expect(capLines()).toHaveLength(1);
  });

  it('drops the cap line once a live call fails, so the error stands alone', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await renderLens({ ...liveOnly, prompt: 'The build passes failing' });
    await act(async () => {
      fireEvent.click(optInButton());
    });
    await settle();
    expect(document.querySelector('.lens-status .inline-note')).not.toBeNull();
    expect(capLines()).toHaveLength(0);
    expect(document.querySelector('.lens-cap')).toBeNull();
    expect(document.getElementById('lens-live')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('keeps only the short cap line with the opt-in in More options for a recorded sentence, and has no middle dot', async () => {
    const rec = lensSamples[0]!;
    await renderLens({ sentence: rec.sentence, prompt: '', stepId: rec.stepId, where: 'Checks', sampleTitle: undefined, recorded: rec });
    const cap = await screen.findAllByText(CAP_NOTE_SHORT, {}, { timeout: 3000 });
    expect(cap).toHaveLength(1);
    expect(capLines()).toHaveLength(0);
    expect(cap[0]!.closest('.lens-options')).not.toBeNull();
    expect(cap[0]!.previousElementSibling?.querySelector('button')?.textContent).toBe('Grow live with an open model');
    expect(CAP_NOTE).not.toContain('·');
    expect(CAP_NOTE_SHORT).not.toContain('·');
  });
});

describe('LensFrame opt-in descriptions', () => {
  const describedBy = (el: Element | null) => (el?.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id));

  it('describes the opt-in by its note and the cap line, and the live status by the cap line', async () => {
    okFetch();
    await renderLens({ ...liveOnly, prompt: 'The build passes described' });
    const [note, cap] = describedBy(optInButton());
    expect(note?.textContent).toContain('Nothing is sent until you choose this.');
    expect(cap?.className).toBe('lens-cap');
    expect(document.querySelectorAll('#lens-cap')).toHaveLength(1);
    expect(document.querySelectorAll('#lens-optin-note')).toHaveLength(1);

    await act(async () => {
      fireEvent.click(optInButton());
    });
    await settle();
    expect(describedBy(document.getElementById('lens-live'))).toEqual([document.getElementById('lens-cap')]);
    expect(document.getElementById('lens-cap')?.textContent).toBe(CAP_NOTE);
  });

  it('links the opt-in in More options to its note and the short cap line', async () => {
    const rec = lensSamples[0]!;
    await renderLens({ sentence: rec.sentence, prompt: '', stepId: rec.stepId, where: 'Checks', sampleTitle: undefined, recorded: rec });
    await screen.findAllByText(CAP_NOTE_SHORT, {}, { timeout: 3000 });
    const [note, cap] = describedBy(optInButton());
    expect(note?.id).toBe('lens-optin-note');
    expect(cap?.textContent).toBe(CAP_NOTE_SHORT);
  });
});
