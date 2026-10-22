// Brand flow (never part of "all"): renders docs/brand/social-preview.html (PLAN D19) to docs/brand/social-preview.png
// at 1280×640, with every relative file it uses (the hero still, the fonts) inlined as data URLs first, so the page
// makes no request at all. Fails if the PNG is over 1 MB. Uploading it in the GitHub settings is manual.
// Usage: pnpm check:browser --flows brand
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

/** `html` with every relative `src="…"` and `url('…')` replaced by a data URL of the file, resolved from `dir`. */
export function inlineFiles(html, dir, read = readFileSync) {
  const data = (path) => {
    const type = TYPES[extname(path).toLowerCase()];
    if (!type) throw new Error(`social preview: no type for ${path}`);
    return `data:${type};base64,${read(resolve(dir, path)).toString('base64')}`;
  };
  const relative = (p) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(p);
  return html
    .replace(/\bsrc="([^"]+)"/g, (m, p) => (relative(p) ? `src="${data(p)}"` : m))
    .replace(/url\('([^']+)'\)/g, (m, p) => (relative(p) ? `url('${data(p)}')` : m));
}

export async function run({ context, root, log, fail }) {
  const template = join(root, 'docs', 'brand', 'social-preview.html');
  const out = join(root, 'docs', 'brand', 'social-preview.png');
  const ctx = await context.browser().newContext({ viewport: { width: 1280, height: 640 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const requests = [];
  ctx.on('request', (r) => r.url().startsWith('data:') || requests.push(r.url()));
  try {
    const page = await ctx.newPage();
    await page.setContent(inlineFiles(readFileSync(template, 'utf8'), dirname(template)), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length);
    if (fonts < 2) fail(`social preview: ${fonts} of 2 fonts loaded`);
    writeFileSync(out, await page.screenshot({ type: 'png' }));
    log(`screenshot ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
    if (statSync(out).size > 1024 * 1024) fail(`social preview is ${statSync(out).size} bytes (limit 1 MB)`);
  } finally {
    await ctx.close();
  }
  requests.filter((u) => u !== 'about:blank').forEach((u) => fail(`social preview requested ${u}`));
}
