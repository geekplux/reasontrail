// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommandLine } from './Install';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const clipboard = (writeText: () => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
/** Lets the clipboard promise settle and the delayed announcement land. */
const flush = () => act(async () => {
  await Promise.resolve();
  vi.advanceTimersByTime(120);
});

describe('CommandLine copy feedback', () => {
  it('says "Copied" in a status, again on a repeat, and clears it after a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    clipboard(() => Promise.resolve());
    render(<CommandLine command="npx reasontrail" label="the map command" />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Copy the map command' }));
    await flush();
    expect(status.textContent).toBe('Copied');
    fireEvent.click(screen.getByRole('button', { name: 'Copy the map command' }));
    await act(async () => Promise.resolve());
    expect(status.textContent).toBe(''); // emptied first, so the repeat is announced
    act(() => vi.advanceTimersByTime(50));
    expect(status.textContent).toBe(''); // still empty until the 100 ms delay
    await flush();
    expect(status.textContent).toBe('Copied');
    act(() => vi.advanceTimersByTime(2600));
    expect(status.textContent).toBe('');
  });

  it('selects the command when the clipboard refuses', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    clipboard(() => Promise.reject(new Error('denied')));
    render(<CommandLine command="npx reasontrail --list" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));
    await flush();
    await flush();
    expect(screen.getByRole('status').textContent).toBe('Copy failed; the command is selected — press Ctrl or Cmd+C');
    expect(window.getSelection()?.toString()).toBe('npx reasontrail --list');
  });
});
