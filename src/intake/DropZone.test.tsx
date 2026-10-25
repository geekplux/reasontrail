// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { parseFile } from './parseFile';
import { OpenSession } from './DropZone';

import trouble from '../../fixtures/sessions/claude-code/trouble.jsonl?raw';
import pasted from '../../fixtures/chats/pasted-chatgpt.txt?raw';
import plain from '../../fixtures/chats/pasted-plain.txt?raw';

// The page's intake without the worker: the same parse, on the main thread.
vi.mock('./intake', () => ({
  warmIntake: () => Promise.resolve(null),
  startParse: (file: File, _progress: unknown, pick?: string) => ({ result: parseFile(file, file.name, { pick }), cancel() {} }),
}));

afterEach(cleanup);

/** The page first, then the file (the paste page ignores a file dropped before it opened). */
async function open(file: File, chat = false) {
  const { rerender } = render(<OpenSession file={null} onFile={() => {}} chat={chat} />);
  rerender(<OpenSession file={file} onFile={() => {}} chat={chat} />);
  return waitFor(() => screen.getByTestId('opened'), { timeout: 5_000 });
}

describe('Open a session (v7 §7)', () => {
  it('shows a dropped session on the v7 page: title as the focused h1, tree, list and outcome; the file name is the tag', async () => {
    const page = await open(new File([trouble], 'trouble.jsonl'));
    const h1 = screen.getByRole('heading', { level: 1 });
    await waitFor(() => expect(document.activeElement).toBe(h1));
    expect(page.querySelector('.hero-tree svg.tree')).toBeTruthy();
    expect(page.querySelector('.frame .gl [role="tree"]')).toBeTruthy();
    expect(page.querySelector('.frame .res')).toBeTruthy();
    expect(page.querySelector('.meta .tag')?.textContent).toBe('trouble.jsonl');
    expect(screen.getByRole('button', { name: 'AI titles' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open another file' })).toBeTruthy();
    // None of the old map: no route band, task card or Map/Outline switch.
    expect(page.querySelector('[data-testid="map"], .route-band, .view-switch, [data-region="task"]')).toBeNull();
    expect(document.querySelector('[data-role="intake-live"]')?.textContent).toMatch(/^Map ready: \d+ episodes?, \d+ detected patterns?$/);
  });

  it('shows a pasted chat on the same page, tagged "Pasted chat"', async () => {
    const page = await open(new File([pasted], 'Pasted chat', { type: 'text/plain' }), true);
    expect(page.querySelector('.hero-tree svg.tree')).toBeTruthy();
    expect(page.querySelector('.meta .tag')?.textContent).toBe('Pasted chat');
    expect(screen.getByRole('button', { name: 'Map another chat' })).toBeTruthy();
  });

  it("says what it assumed: a chat with no speaker names notes its alternating turns under the meta line", async () => {
    const page = await open(new File([plain], 'Pasted chat', { type: 'text/plain' }), true);
    expect(page.querySelector('.note')?.textContent).toMatch(/^No speaker names were found/);
  });

  it('keeps the drop target and its copy, with no middle dot', () => {
    render(<OpenSession file={null} onFile={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Map your own session');
    expect(screen.getByTestId('drop-target').textContent).toContain('Drop a .jsonl here');
    expect(screen.getByText('Choose a file').className).toBe('btn primary');
    expect(document.body.textContent).not.toContain('·');
  });
});
