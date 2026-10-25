// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import homeCss from './home.css?raw';
import listCss from '../map/gitlist/gitlist.css?raw';
import { Home } from './Home';
import { SiteShell } from './SiteShell';
import { PHONE_QUERY, usePhone } from './usePhone';

/** A viewport `phone` or not, through matchMedia. */
const viewport = (phone: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone && q === PHONE_QUERY, media: q, addEventListener() {}, removeEventListener() {} }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Probe = () => <p>{usePhone() ? 'phone' : 'wide'}</p>;

describe('usePhone', () => {
  it('follows the phone media query, and is false where there is no matchMedia', () => {
    render(<Probe />);
    expect(screen.getByText('wide')).toBeTruthy();
    cleanup();
    viewport(true);
    render(<Probe />);
    expect(screen.getByText('phone')).toBeTruthy();
  });

  it('is the width the phone rules in home.css use', () => {
    expect(homeCss).toContain(`@media ${PHONE_QUERY}`);
    expect(listCss).not.toMatch(/@media/); // the compact list follows the `compact` prop, not the viewport
  });
});

describe('Home on the phone (Phone.html)', () => {
  it('puts the legend under the tabs and the outcome box above the list, the final answer under it', () => {
    viewport(true);
    const { container } = render(<Home session={null} onSession={() => {}} />);
    expect(container.querySelector('.hero-tree > .legend')).toBeNull();
    expect(container.querySelector('.under > .tabs + .legend')).toBeTruthy();
    const order = [...container.querySelector('.frame')!.children].map((el) => el.className.split(' ')[0]);
    expect(order.filter((c) => c !== 'details' && c !== 'visually-hidden')).toEqual(['sess', 'side', 'cols', 'block']);
    expect(container.querySelector('.frame > .side .res')).toBeTruthy();
    expect(container.querySelector('.frame > .block h3')?.textContent).toBe('Final answer');
    expect(container.querySelector('.gl.is-compact')).toBeTruthy();
  });

  it('has no header buttons, and the meta line leaves out the branch and ends with the Sample tag', () => {
    viewport(true);
    const { container } = render(<Home session={null} onSession={() => {}} />);
    expect(container.querySelector('.sess-r')).toBeNull();
    expect(screen.queryAllByRole('button').map((b) => b.textContent).filter((t) => ['AI titles', 'Details', 'Share'].includes(t ?? ''))).toEqual([]);
    expect([...container.querySelector('.meta')!.children].map((c) => c.textContent)).toEqual(['Claude Code', '47 min total', '3 subagents', '60 tool calls', 'Sample']);
  });

  it('labels the header button "Open session"', () => {
    viewport(true);
    render(<SiteShell view="map" onFile={() => {}}><p /></SiteShell>);
    expect(screen.getByRole('link', { name: 'Open session' })).toBeTruthy();
    cleanup();
    viewport(false);
    render(<SiteShell view="map" onFile={() => {}}><p /></SiteShell>);
    expect(screen.getByRole('link', { name: 'Open a session' })).toBeTruthy();
  });
});
