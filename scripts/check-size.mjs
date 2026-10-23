#!/usr/bin/env node
// Size budgets (PLAN P1) and the runtime-dependency allowlist (PLAN Q2), checked on dist/ after `pnpm build`.
// Usage: pnpm check:size [--dist <dir>] [--package <package.json>]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Runtime dependencies allowed in package.json; adding one needs a DECISIONS.md entry and an edit here. */
export const RUNTIME_ALLOWLIST = ['@fontsource-variable/chivo-mono', 'd3-hierarchy', 'react', 'react-dom'];
/** `jsGzip`: PLAN G2 (≤ 170 KB gzip with the default sample), which supersedes P1's 130 KB for the website first view
 * (PLAN §4.1). The default sample now carries its raw records for "Show raw" (phase 17). */
export const BUDGETS = { jsGzip: 170 * 1024, cssGzip: 15 * 1024, fontBytes: 45 * 1024, fontFiles: 2 };

/** Problems with the runtime dependency list: anything missing from or extra to the allowlist. */
export function checkDependencies(deps = {}) {
  const names = Object.keys(deps);
  return [
    ...names.filter((n) => !RUNTIME_ALLOWLIST.includes(n)).map((n) => `runtime dependency not in the allowlist: ${n}`),
    ...RUNTIME_ALLOWLIST.filter((n) => !names.includes(n)).map((n) => `allowlisted runtime dependency missing: ${n}`),
  ];
}

/** Problems with the Worker bundle's imports: it must have no runtime dependencies, only relative modules (`import type` is fine). */
export function checkWorkerImports(files) {
  const problems = [];
  for (const [file, src] of Object.entries(files)) {
    for (const m of src.matchAll(/^\s*(import|export)(\s+type)?\b[^;]*?\bfrom\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/gm)) {
      const spec = m[3] ?? m[4];
      if (!m[2] && !spec.startsWith('.')) problems.push(`Worker runtime dependency in ${file}: ${spec}`);
    }
  }
  return problems;
}

/** Source files the Worker bundles: worker/ and shared/, minus tests and fakes. */
function workerSources(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(path);
      }
      else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out[path] = readFileSync(path, 'utf8');
    }
  };
  for (const dir of ['worker', 'shared']) walk(join(root, dir));
  return out;
}

/** Assets the first view loads, read from the built index.html: entry + modulepreload JS and stylesheets. */
export function initialAssets(html) {
  const attr = (re) => [...html.matchAll(re)].map((m) => m[1].replace(/^\//, ''));
  return {
    js: [...attr(/<script[^>]*type="module"[^>]*src="([^"]+)"/g), ...attr(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)],
    css: attr(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
  };
}

/** G2 (phase 19): what must load lazily, never with the first view, and its own gzip budget. */
export const LAZY = [
  { name: 'sample verify-fail-fix', re: /^verify-fail-fix\.graph-.*\.js$/, max: 80 * 1024 },
  { name: 'sample planner-pivot', re: /^planner-pivot\.graph-.*\.js$/, max: 80 * 1024 },
  { name: 'drop zone', re: /^DropZone-.*\.js$/, max: 10 * 1024 },
  { name: 'parse worker', re: /^parse\.worker-.*\.js$/, max: 40 * 1024 },
];
/** Problems with the lazy chunks: missing, loaded by the first view, or over budget. `sizes`: asset file → gzip bytes. */
export function checkLazy(assets, initialJs, sizes) {
  const problems = [];
  for (const { name, re, max } of LAZY) {
    const file = assets.find((f) => re.test(f));
    if (!file) problems.push(`lazy chunk not found: ${name}`);
    else if (initialJs.some((f) => f.endsWith(file))) problems.push(`${name} loads with the first view (should be lazy)`);
    else if (sizes[file] > max) problems.push(`${name} ${(sizes[file] / 1024).toFixed(1)} KB gzip > ${max / 1024} KB`);
  }
  return problems;
}

/** The CLI (C3, C4): no runtime dependencies, and the viewer template (when built) at most 300 KB before session data. */
export const VIEWER_MAX = 300 * 1024;
export function checkCli(cliPkg, viewerBytes) {
  const deps = Object.keys({ ...cliPkg.dependencies, ...cliPkg.optionalDependencies, ...cliPkg.peerDependencies });
  return [
    ...deps.map((d) => `CLI runtime dependency (must be zero): ${d}`),
    ...(viewerBytes > VIEWER_MAX ? [`viewer template ${(viewerBytes / 1024).toFixed(1)} KB > ${VIEWER_MAX / 1024} KB`] : []),
  ];
}

/** Compares measured sizes with BUDGETS; returns human-readable problems. */
export function checkBudgets({ jsGzip, cssGzip, fontBytes, fontFiles }) {
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const problems = [];
  if (jsGzip > BUDGETS.jsGzip) problems.push(`initial JS ${kb(jsGzip)} gzip > ${kb(BUDGETS.jsGzip)}`);
  if (cssGzip > BUDGETS.cssGzip) problems.push(`CSS ${kb(cssGzip)} gzip > ${kb(BUDGETS.cssGzip)}`);
  if (fontBytes > BUDGETS.fontBytes) problems.push(`fonts ${kb(fontBytes)} > ${kb(BUDGETS.fontBytes)}`);
  if (fontFiles > BUDGETS.fontFiles) problems.push(`${fontFiles} font files > ${BUDGETS.fontFiles}`);
  return problems;
}

function main(argv) {
  const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const dist = resolve(arg('--dist', 'dist'));
  const pkg = JSON.parse(readFileSync(resolve(arg('--package', 'package.json')), 'utf8'));
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const { js, css } = initialAssets(html);
  const gz = (files) => files.reduce((sum, f) => sum + gzipSync(readFileSync(join(dist, f))).length, 0);
  // Browsers that support woff2 never fetch the .woff fallbacks, so the first view's fonts are the woff2 files.
  const fonts = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.woff2'));
  const sizes = {
    jsGzip: gz(js),
    cssGzip: gz(css),
    fontBytes: fonts.reduce((sum, f) => sum + statSync(join(dist, 'assets', f)).size, 0),
    fontFiles: fonts.length,
  };
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const assets = readdirSync(join(dist, 'assets'));
  const lazySizes = Object.fromEntries(assets.filter((f) => LAZY.some(({ re }) => re.test(f))).map((f) => [f, gz([join('assets', f)])]));
  console.log(`lazy: ${Object.entries(lazySizes).map(([f, n]) => `${f.replace(/-[\w-]{8}\.js$/, '')} ${kb(n)}`).join(', ')} (gzip)`);
  console.log(`initial JS ${kb(sizes.jsGzip)} gzip (${js.length} file(s)), CSS ${kb(sizes.cssGzip)} gzip, fonts ${kb(sizes.fontBytes)} in ${sizes.fontFiles} woff2 file(s)`);
  const workerFiles = workerSources(resolve('.'));
  console.log(`Worker: ${Object.keys(workerFiles).length} source file(s) checked for runtime dependencies`);
  const viewer = resolve('cli/dist/viewer.html');
  const viewerBytes = existsSync(viewer) ? statSync(viewer).size : 0;
  console.log(`CLI: viewer template ${viewerBytes ? `${(viewerBytes / 1024).toFixed(1)} KB` : 'not built (pnpm build:cli)'}`);
  const problems = [
    ...checkCli(JSON.parse(readFileSync(resolve('cli/package.json'), 'utf8')), viewerBytes),
    ...(js.length ? [] : ['no entry script found in index.html']),
    ...checkDependencies(pkg.dependencies),
    ...checkBudgets(sizes),
    ...checkLazy(assets, js, lazySizes),
    ...checkWorkerImports(workerFiles),
  ];
  if (problems.length) {
    console.error(`check:size FAILED:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exitCode = 1;
  } else console.log('check:size passed');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
