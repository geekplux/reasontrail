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

describe('Open a session', () => {
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

  it('shows the canvas Open frame: title, drop box with the privacy line and a ghost button, where the files are; no middle dot', () => {
    render(<OpenSession file={null} onFile={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Open a session');
    const drop = screen.getByTestId('drop-target');
    expect(drop.textContent).toContain('Drop a session file');
    expect(drop.textContent).toContain('Parsed in your browser. Nothing is uploaded.');
    expect(screen.getByText('Choose file').className).toBe('btn ghost');
    const where = document.querySelector('dl.where');
    expect([...(where?.querySelectorAll('dt') ?? [])].map((d) => d.textContent)).toEqual(['Claude Code', 'Codex', 'Grok Build', 'Chat']);
    expect(screen.getByRole('link', { name: 'Paste the text' }).getAttribute('href')).toBe('?view=chat');
    expect(screen.getByText('Files up to 50 MB.')).toBeTruthy();
    expect(document.querySelector('details, .bang')).toBeNull();
    expect(document.body.textContent).not.toContain('·');
  });

  it('marks an error with the alert icon, not a "!" badge', async () => {
    const { rerender } = render(<OpenSession file={null} onFile={() => {}} />);
    rerender(<OpenSession file={new File(['{"hello":1}\n'], 'notes.jsonl')} onFile={() => {}} />);
    const alert = await waitFor(() => {
      const p = document.querySelector('.intake-error');
      if (!p) throw new Error('no error yet');
      return p;
    });
    expect(alert.querySelector('svg.ic[aria-hidden="true"]')).toBeTruthy();
    expect(alert.textContent?.startsWith('!')).toBe(false);
    // The icon, then the message, then the follow-up link: the grid's two columns.
    expect([...alert.children].map((c) => c.tagName.toLowerCase())).toEqual(['svg', 'span', 'a']);
  });

  it('describes the file input by the error while there is one', async () => {
    const { rerender } = render(<OpenSession file={null} onFile={() => {}} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    rerender(<OpenSession file={new File(['{"hello":1}\n'], 'notes.jsonl')} onFile={() => {}} />);
    await waitFor(() => expect(document.querySelector<HTMLInputElement>('input[type="file"]')!.getAttribute('aria-describedby')).toBe('intake-error'));
    expect(document.getElementById('intake-error')?.classList.contains('intake-error')).toBe(true);
  });

  it('closes the chat page with the 12px privacy line, as the Open page', () => {
    render(<OpenSession file={null} onFile={() => {}} chat />);
    expect(screen.getByText('Parsed in your browser. Nothing is uploaded.').className).toBe('muted small');
  });
});
