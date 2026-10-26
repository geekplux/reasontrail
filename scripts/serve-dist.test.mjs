import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { headersFor, matches, parseHeaders } from './serve-dist.mjs';

const rules = parseHeaders(readFileSync(new URL('../public/_headers', import.meta.url), 'utf8'));
const csp = (path) => headersFor(rules, path).get('content-security-policy') ?? '';

describe('public/_headers', () => {
  it('gives every page the site CSP: self and Google Analytics only, no inline code, blob: workers', () => {
    for (const path of ['/', '/anything', '/assets/index-abc.js']) {
      const policy = csp(path);
      expect(policy).toContain("script-src 'self' https://*.googletagmanager.com;");
      expect(policy).toContain("connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com;");
      expect(policy).toContain("worker-src 'self' blob:");
      expect(policy).not.toContain('unsafe-inline');
      expect(policy).not.toContain('unsafe-eval');
    }
    expect(headersFor(rules, '/').get('x-content-type-options')).toBe('nosniff');
    expect(headersFor(rules, '/').get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headersFor(rules, '/').get('permissions-policy')).toContain('camera=()');
  });

  it('caches hashed assets for a year and revalidates HTML', () => {
    expect(headersFor(rules, '/assets/index-abc.js').get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(headersFor(rules, '/').get('cache-control')).toBe('public, max-age=0, must-revalidate');
  });

  it('gives the viewer template one policy of its own: inline, no network', () => {
    for (const path of ['/viewer.html', '/viewer']) {
      expect(csp(path)).toMatch(/^default-src 'none'; script-src 'unsafe-inline';/);
      expect(csp(path)).toContain("connect-src 'none'");
      expect(csp(path)).not.toContain('google');
      expect(csp(path)).not.toContain(', '); // detached, not joined with the site CSP
    }
  });
});

describe('the _headers rules', () => {
  it('match splats and placeholders, join repeats and detach with "!"', () => {
    expect(matches('/assets/*', '/assets/a/b.js')).toBe(true);
    expect(matches('/users/:id', '/users/7')).toBe(true);
    expect(matches('/users/:id', '/users/7/x')).toBe(false);
    const r = parseHeaders('/*\n  X-A: 1\n  X-B: 1\n/b\n  X-A: 2\n  ! X-B\n# note\n');
    expect(Object.fromEntries(headersFor(r, '/b'))).toEqual({ 'x-a': '1, 2' });
    expect(Object.fromEntries(headersFor(r, '/c'))).toEqual({ 'x-a': '1', 'x-b': '1' });
  });
});
