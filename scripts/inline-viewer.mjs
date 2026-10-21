#!/usr/bin/env node
// Folds dist-viewer/ (one JS file, one CSS file with data-URL fonts) into cli/dist/viewer.html: an inline <style>,
// an inline classic <script> at the end of <body>, and the data slot the CLI fills (D32). No dependencies.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
html = html.replace('</body>', () => `<script id="reasontrail-data" type="application/json">__REASONTRAIL_DATA__</script>\n<script>${js}</script>\n</body>`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`inline-viewer: ${out} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
