import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOT_FOUND_TITLE, notFoundHtml, notFoundPage } from './not-found-page.mjs';
import { serveDist } from './serve-dist.mjs';

// The page an unknown path gets. Workers static assets answer any path that is not a file with dist/404.html at
// status 404 (`not_found_handling: "404-page"`), so a made-up URL no longer passes for a second copy of the home page
// (it used to get index.html with 200).
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const homeTitle = /<title>([^<]*)<\/title>/.exec(index)?.[1];

describe('404 page', () => {
  const page = notFoundHtml(index, NOT_FOUND_TITLE);

  it('has its own title, not the home page title', () => {
    expect(homeTitle).toMatch(/^Reasontrail: /);
    expect(page).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
    expect(page).not.toContain(`<title>${homeTitle}</title>`);
  });

  it('is noindex and names no canonical (the home page keeps its own)', () => {
    expect(index).toContain('<link rel="canonical" href="https://reasontrail.geekplux.com/" />');
    expect(page).toContain('<meta name="robots" content="noindex" />');
    expect(page).not.toContain('rel="canonical"');
  });

  it('keeps the rest of the shell (the site still opens on a mistyped link)', () => {
    expect(page).toContain('<div id="root"></div>');
    expect(page).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it('refuses a shell without a title', () => {
    expect(() => notFoundHtml('<html><head></head></html>', NOT_FOUND_TITLE)).toThrow('no <title>');
  });

  it('is emitted as 404.html next to index.html, and only where there is an index.html', () => {
    const emitted = [];
    const ctx = { emitFile: (file) => emitted.push(file) };
    const { handler } = notFoundPage().generateBundle;
    handler.call(ctx, {}, {});
    expect(emitted).toEqual([]);
    handler.call(ctx, {}, { 'index.html': { type: 'asset', source: index } });
    expect(emitted.map((file) => file.fileName)).toEqual(['404.html']);
    expect(emitted[0].source).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
  });

  it('is what wrangler.jsonc serves for an unknown path', () => {
    const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    expect(wrangler).toMatch(/"not_found_handling":\s*"404-page"/);
    expect(wrangler).not.toContain('single-page-application');
  });
});

describe('serve-dist, like Workers static assets with "404-page"', () => {
  it('serves the files at 200 and an unknown path as 404.html at 404', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reasontrail-dist-'));
    writeFileSync(join(dir, 'index.html'), '<title>home</title>');
    writeFileSync(join(dir, 'viewer.html'), '<title>viewer</title>');
    writeFileSync(join(dir, '404.html'), '<title>missing</title>');
    const server = await serveDist({ dir, port: 0 });
    const address = server.address();
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    try {
      const get = async (path) => {
        const res = await fetch(`${base}${path}`, { redirect: 'manual' });
        return [res.status, await res.text()];
      };
      expect(await get('/')).toEqual([200, '<title>home</title>']);
      expect(await get('/?sample=x')).toEqual([200, '<title>home</title>']);
      expect(await get('/viewer')).toEqual([200, '<title>viewer</title>']);
      expect(await get('/no/such/page')).toEqual([404, '<title>missing</title>']);
      expect(await get('/seo_audit_missing/')).toEqual([404, '<title>missing</title>']);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
});
