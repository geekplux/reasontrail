#!/usr/bin/env node
// Folds dist-viewer/ (one JS file, one CSS file with data-URL fonts) into cli/dist/viewer.html: an inline <style>,
// the data slot the CLI fills, and the app script at the end of <body> (D32). No dependencies.
// The app script is stored gzip-compressed (base64, a non-executable script type) and a 5-line loader inflates it with
// the browser's DecompressionStream and runs it as an inline script: the page stays one file with zero requests, and
// the template stays inside the 300 KB budget (C3) as the map grows. Deterministic (gzip header without a timestamp).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-viewer');
const out = join(root, 'cli', 'dist', 'viewer.html');
const asset = (href) => readFileSync(join(dist, href.replace(/^\.?\//, '')), 'utf8');

let html = readFileSync(join(dist, 'viewer.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>\s*/g)];
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>\s*/g)];
if (scripts.length !== 1 || styles.length !== 1) throw new Error(`expected 1 script and 1 stylesheet, got ${scripts.length} and ${styles.length}`);
const js = asset(scripts[0][1]).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const css = asset(styles[0][1]).replace(/<\/(style)/gi, '<\\/$1');
if (/url\((?!["']?data:)/.test(css)) throw new Error('viewer CSS references an external url()');

html = html.replace(scripts[0][0], '').replace(styles[0][0], () => `<style>${css}</style>\n`);
const packed = gzipSync(Buffer.from(js, 'utf8'), { level: 9 }).toString('base64');
const loader = `(async()=>{const r=document.getElementById('root');try{const b=Uint8Array.from(atob(document.getElementById('reasontrail-app').textContent),(c)=>c.charCodeAt(0));` +
  `const t=await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();const s=document.createElement('script');s.textContent=t;document.body.append(s)}` +
  `catch{r.innerHTML='<main class="viewer-error"><h1>Reasontrail</h1><p role="alert">This browser cannot open the map: it needs a current Chrome, Edge, Firefox or Safari. The session data is still in this file.</p></main>'}})()`;
html = html.replace('</body>', () => `<script id="reasontrail-data" type="application/json">__REASONTRAIL_DATA__</script>\n<script id="reasontrail-app" type="application/octet-stream">${packed}</script>\n<script>${loader}</script>\n</body>`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`inline-viewer: ${out} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
