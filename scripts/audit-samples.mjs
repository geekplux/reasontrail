#!/usr/bin/env node
// pnpm audit:samples (PLAN R3): fails when a committed sample, fixture or skill eval matches a redaction rule
// (shared/session/redact.ts), or contains a term from the optional, gitignored `.redact-denylist` (one term per line).
// Prints file:line and the rule only, never the matched text. Usage: pnpm audit:samples [--root <dir>]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
/** Directories scanned, relative to the root; `skills` only below an `evals/` folder. */
export const SCAN_DIRS = ['src/sessions/samples', 'fixtures', 'skills'];
const TEXT = /\.(jsonl?|md|txt|ya?ml|html|csv|mjs|js|ts)$/;

/** Load the redaction rules straight from the TypeScript source (type-only imports, so a plain transform is enough). */
export async function loadRules() {
  const path = resolve(HERE, '../shared/session/redact.ts');
  const { code } = await transformWithOxc(readFileSync(path, 'utf8'), path, { lang: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Findings `{ file, line, rule }` for every scanned file under `root`. */
export async function audit(root) {
  const { findSecrets } = await loadRules();
  const denyFile = join(root, '.redact-denylist');
  const deny = existsSync(denyFile)
    ? readFileSync(denyFile, 'utf8').split('\n').map((t) => t.trim().toLowerCase()).filter((t) => t && !t.startsWith('#'))
    : [];
  const findings = [];
  for (const dir of SCAN_DIRS.map((d) => join(root, d)).filter(existsSync)) {
    for (const file of walk(dir)) {
      const rel = relative(root, file);
      if (!TEXT.test(file) || (rel.startsWith('skills') && !rel.includes('/evals/'))) continue;
      readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
        for (const rule of findSecrets(text)) findings.push({ file: rel, line: i + 1, rule });
        const lower = text.toLowerCase();
        deny.forEach((term, n) => lower.includes(term) && findings.push({ file: rel, line: i + 1, rule: `denylist term #${n + 1}` }));
      });
    }
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--root');
  const root = resolve(at > 0 ? process.argv[at + 1] : join(HERE, '..'));
  const findings = await audit(root);
  for (const f of findings) console.error(`${f.file}:${f.line}  ${f.rule}`);
  console.log(findings.length ? `audit:samples: ${findings.length} finding(s); redact or remove them.` : 'audit:samples: clean.');
  process.exit(findings.length ? 1 : 0);
}
