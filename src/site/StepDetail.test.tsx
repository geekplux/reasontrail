// @vitest-environment happy-dom
// "Show raw" (DECISIONS 2026-10-25): a 12px link after the Source line discloses the verbatim record in a `pre`.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defaultSessionGraph as g } from '../sessions/samples';
import { OWN_ACCOUNT, StepDetail } from './StepDetail';
import { stepDetail } from './stepDetailData';

afterEach(cleanup);
const noop = () => {};

describe('the step panel\'s "Show raw"', () => {
  it('discloses the verbatim record after the Source line, and hides it again', () => {
    const d = stepDetail(g, 's41')!;
    const raw = g.steps.find((s) => s.id === 's41')!.rawText!;
    expect(d.raw?.startsWith(raw)).toBe(true); // the call's record, then its result's
    const { container } = render(<StepDetail d={d} onStep={noop} onClose={noop} />);
    const link = screen.getByRole('button', { name: 'Show raw' });
    expect(link.previousElementSibling?.classList.contains('d-src')).toBe(true);
    expect(link.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('pre.raw')).toBeNull();
    fireEvent.click(link);
    const pre = container.querySelector('pre.raw')!;
    expect(pre.textContent).toBe(d.raw);
    // A focusable, named region, so a keyboard user can scroll the record.
    expect(pre.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('region', { name: 'Raw record' })).toBe(pre);
    expect(link.getAttribute('aria-expanded')).toBe('true');
    expect(link.getAttribute('aria-controls')).toBe(pre.id);
    expect(link.textContent).toBe('Hide raw');
    fireEvent.click(link);
    expect(container.querySelector('pre.raw')).toBeNull();
  });

  it('starts hidden on another step', () => {
    const d = stepDetail(g, 's41')!;
    const { container, rerender } = render(<StepDetail d={d} onStep={noop} onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show raw' }));
    rerender(<StepDetail d={stepDetail(g, d.nextId!)!} onStep={noop} onClose={noop} />);
    expect(container.querySelector('pre.raw')).toBeNull();
  });

  it('shows no link when the graph kept no raw text', () => {
    const { raw: _raw, ...d } = stepDetail(g, 's41')!;
    render(<StepDetail d={d} onStep={noop} onClose={noop} />);
    expect(screen.queryByRole('button', { name: 'Show raw' })).toBeNull();
  });
});

describe('the honesty line (phase 35)', () => {
  it('sits as a 12px note right under the title of a thinking step, and nowhere else', () => {
    const think = { ...stepDetail(g, stepDetail(g, 's43')!.nextId!)!, text: 'Check the config first.', ownAccount: true as const };
    const { container, rerender } = render(<StepDetail d={think} onStep={noop} onClose={noop} />);
    const note = container.querySelector('.d-own')!;
    expect(note.textContent).toBe(OWN_ACCOUNT);
    expect(note.previousElementSibling?.classList.contains('d-title')).toBe(true);
    expect(OWN_ACCOUNT).not.toMatch(/·/);
    rerender(<StepDetail d={stepDetail(g, 's41')!} onStep={noop} onClose={noop} />);
    expect(container.querySelector('.d-own')).toBeNull();
  });
});
