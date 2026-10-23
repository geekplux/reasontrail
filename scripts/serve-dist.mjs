#!/usr/bin/env node
// A tiny static server for dist/ that behaves like Cloudflare Workers static assets for what the site relies on: the
// `_headers` rules (in file order; `! Name` detaches a header set by an earlier rule, a header set twice is joined
// with ", "), `/x.html` → 307 `/x` (html_handling "auto-trailing-slash"), the single-page-application fallback, and
// no Worker (`/api/*` is a 404 JSON). `vite preview` ignores `_headers`, so `pnpm check:browser --headers` uses this
// to run the flows under the real CSP. Usage: node scripts/serve-dist.mjs [--port 4317] [--dir dist]
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `_headers` text → rules `{ pattern, set: [name, value][], unset: name[] }`. */
export function parseHeaders(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), set: [], unset: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) throw new Error(`_headers: header before any path: ${line.trim()}`);
    const body = line.trim();
    if (body.startsWith('!')) rule.unset.push(body.slice(1).trim());
    else {
      const i = body.indexOf(':');
      if (i < 1) throw new Error(`_headers: not "Name: value": ${body}`);
      rule.set.push([body.slice(0, i).trim(), body.slice(i + 1).trim()]);
    }
  }
  return rules;
}

/** True if `pathname` matches a `_headers` pattern (`*` is a splat, `:name` one segment). */
export function matches(pattern, pathname) {
  const re = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:\w+/g, '[^/]+');
  return new RegExp(`^${re}$`).test(pathname);
}

/** The custom headers for `pathname`, as a lower-case name → value map. */
export function headersFor(rules, pathname) {
  const out = new Map();
  for (const rule of rules.filter((r) => matches(r.pattern, pathname))) {
    for (const name of rule.unset) out.delete(name.toLowerCase());
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase();
      out.set(key, out.has(key) ? `${out.get(key)}, ${value}` : value);
    }
  }
  return out;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.gif': 'image/gif' };

/** Starts the server; resolves to it once listening. */
export function serveDist({ dir = 'dist', port = 4317, host = '127.0.0.1' } = {}) {
  const root = resolve(dir);
  const rules = existsSync(join(root, '_headers')) ? parseHeaders(readFileSync(join(root, '_headers'), 'utf8')) : [];
  const server = createServer((req, res) => {
    const { pathname, search } = new URL(req.url ?? '/', 'http://x');
    if (pathname.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}');
      return;
    }
    if (pathname.endsWith('.html')) {
      const to = pathname === '/index.html' ? '/' : pathname.slice(0, -5);
      res.writeHead(307, { location: to + search }).end();
      return;
    }
    const file = (p) => {
      const f = normalize(join(root, p));
      return f.startsWith(root) && existsSync(f) && statSync(f).isFile() && !f.endsWith('_headers') ? f : undefined;
    };
    const hit = file(pathname) ?? file(`${pathname}.html`) ?? (pathname.endsWith('/') ? file(`${pathname}index.html`) : undefined);
    const path = hit ?? join(root, 'index.html'); // single-page-application fallback
    const headers = { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' };
    for (const [k, v] of headersFor(rules, pathname)) headers[k] = v;
    res.writeHead(200, headers);
    createReadStream(path).pipe(res);
  });
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const port = Number(arg('--port', 4317));
  await serveDist({ dir: arg('--dir', 'dist'), port });
  console.log(`serve-dist: http://127.0.0.1:${port}/ (with _headers)`);
}
