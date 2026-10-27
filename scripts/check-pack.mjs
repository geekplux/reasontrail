#!/usr/bin/env node
// Pack check: `pnpm --dir cli pack` into a temporary folder, then fail unless the tarball holds
// exactly the built CLI, the viewer template, package.json, README and LICENSE, with the viewer's data slot still empty
// and no session data. The tarball is deleted afterwards. Needs `pnpm build:cli` first. Usage: pnpm check:pack
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Everything the published package may contain (paths inside the tarball, without the `package/` prefix). */
export const EXPECTED = ['LICENSE', 'README.md', 'dist/cli.mjs', 'dist/viewer.html', 'package.json'];

/** Problems with a tarball's file list and its text files (`read(path)` returns a file's text). */
export function checkPack(files, read) {
  const list = files.map((f) => f.replace(/^package\//, '')).sort();
  const problems = [];
  for (const f of list) if (!EXPECTED.includes(f)) problems.push(`unexpected file in the tarball: ${f}`);
  for (const f of EXPECTED) if (!list.includes(f)) problems.push(`missing from the tarball: ${f}`);
  if (list.includes('dist/viewer.html') && !read('dist/viewer.html').includes('__REASONTRAIL_DATA__')) problems.push('dist/viewer.html: the data slot is filled (a session is baked in)');
  for (const f of list.filter((x) => x.startsWith('dist/'))) {
    if (/"sessionId"\s*:\s*"[^"<]/.test(read(f))) problems.push(`${f}: contains session data (a "sessionId" value)`);
  }
  const pkg = list.includes('package.json') ? JSON.parse(read('package.json')) : {};
  if (pkg.dependencies && Object.keys(pkg.dependencies).length) problems.push('package.json: the CLI must have no runtime dependencies');
  return problems;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = mkdtempSync(join(tmpdir(), 'reasontrail-pack-'));
  try {
    execFileSync('pnpm', ['--dir', join(root, 'cli'), 'pack', '--pack-destination', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'));
    if (!tgz) throw new Error('pnpm pack wrote no tarball');
    execFileSync('tar', ['-xzf', join(out, tgz), '-C', out]);
    const files = execFileSync('tar', ['-tzf', join(out, tgz)], { encoding: 'utf8' }).split('\n').filter(Boolean);
    console.log(`check:pack: ${tgz}\n${files.map((f) => `  ${f.replace(/^package\//, '')}`).sort().join('\n')}`);
    const problems = checkPack(files, (f) => readFileSync(join(out, 'package', f), 'utf8'));
    if (problems.length) {
      console.error(`check:pack FAILED:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
      process.exitCode = 1;
    } else console.log('check:pack passed');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
