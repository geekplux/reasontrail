// dist/404.html: what Workers static assets answer any path that is not a file with, at status 404
// (wrangler.jsonc `not_found_handling: "404-page"`). The site's routes are `/` (state in the query and hash) and
// `/viewer` (dist/viewer.html); every other path used to get index.html with 200 and the home page's title.

/** The 404 page's title: never the home page's, so an unknown path cannot pass for it. */
export const NOT_FOUND_TITLE = 'Page not found · Reasontrail';

const TITLE_RE = /<title>[^<]*<\/title>/;

/**
 * The 404 page from the built index.html: the same shell (a mistyped link still opens the site), with its own title,
 * `noindex` and no canonical, so search engines neither index it nor fold it into the home page.
 * @param {string} html
 * @param {string} title
 * @returns {string}
 */
export function notFoundHtml(html, title) {
  if (!TITLE_RE.test(html)) throw new Error('index.html has no <title> to replace');
  return html
    .replace(TITLE_RE, `<meta name="robots" content="noindex" />\n    <title>${title}</title>`)
    .replace(/\s*<link rel="canonical"[^>]*>/, '');
}

/**
 * Writes dist/404.html next to index.html (build only).
 * @param {string} [title]
 * @returns {import('vite').Plugin}
 */
export function notFoundPage(title = NOT_FOUND_TITLE) {
  return {
    name: 'reasontrail-not-found-page',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const index = bundle['index.html'];
        if (index?.type !== 'asset') return;
        this.emitFile({ type: 'asset', fileName: '404.html', source: notFoundHtml(String(index.source), title) });
      },
    },
  };
}
