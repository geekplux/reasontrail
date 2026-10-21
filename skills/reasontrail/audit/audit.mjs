#!/usr/bin/env node
// Audit for the reasontrail skill (`pnpm skill:audit`): frontmatter rules, referenced files, no network in the kit
// (static check plus a sandbox run), no absolute home paths and no secrets in any skill file. Exits 1 on any problem.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = resolve(fileURLToPath(import.meta.url), '../..');
const NAME = 'reasontrail';
// Frontmatter limits from the Agent Skills format that Claude Code reads (checked 2026-10-21).
const KEYS = { name: 64, description: 1024, license: 100, compatibility: 500 };
const OPTIONAL = new Set(['license', 'compatibility', 'metadata', 'allowed-tools']);

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return undefined;
  return Object.fromEntries(m[1].split('\n').filter((l) => /^[\w-]+:/.test(l)).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
}

export function checkFrontmatter(fm) {
  if (!fm) return ['SKILL.md has no --- frontmatter --- block'];
  const p = [];
  for (const k of Object.keys(fm)) if (!(k in KEYS) && !OPTIONAL.has(k)) p.push(`unknown frontmatter field: ${k}`);
  for (const k of ['name', 'description']) if (!fm[k]) p.push(`frontmatter needs ${k}`);
  for (const [k, max] of Object.entries(KEYS)) if (fm[k] && fm[k].length > max) p.push(`${k} is ${fm[k].length} characters (max ${max})`);
  if (fm.name && fm.name !== NAME) p.push(`name must be "${NAME}", the folder name`);
  if (fm.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) p.push('name must be lowercase letters, digits and hyphens');
  if (fm.description && !/\bUse only when\b/.test(fm.description)) p.push('description must say when to use it ("Use only when ...")');
  if (fm.description && !/\bDo not use\b/.test(fm.description)) p.push('description must say when not to use it ("Do not use ...")');
  if (/[<>]/.test(`${fm.name}${fm.description}`)) p.push('name and description must not contain < or >');
  return p;
}

/** Files named in markdown as `references/...`, `kit/...`, `evals/...`, `audit/...` or `agents/...` must exist. */
export function missingRefs(text, root = SKILL) {
  const refs = [...text.matchAll(/`((?:references|kit|evals|audit|agents)\/[\w./-]+\.\w+)`/g)].map((m) => m[1]);
  return [...new Set(refs)].filter((r) => !existsSync(join(root, r))).map((r) => `referenced file missing: ${r}`);
}

const NET = /\bfrom\s+['"](?:node:)?(?:https?|http2|net|tls|dgram|dns)['"]|\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|spawn\w*\(\s*['"]npx/;
const HOME_PATH = /(?:\/home\/[a-z_][\w-]*|\/Users\/[A-Za-z][\w-]*|[A-Z]:\\Users\\)/;
const SECRET = /(sk-(?:ant-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|AIza[\w-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

export function checkFile(rel, text) {
  const p = [];
  if (rel.startsWith('kit/') && NET.test(text)) p.push(`${rel}: the kit must make no network calls`);
  if (HOME_PATH.test(text)) p.push(`${rel}: absolute home path`);
  if (SECRET.test(text)) p.push(`${rel}: looks like a secret`);
  return p;
}

async function main() {
  const problems = [];
  const skillMd = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  problems.push(...checkFrontmatter(frontmatter(skillMd)));
  if (skillMd.split('\n').length > 500) problems.push('SKILL.md is over 500 lines');
  for (const dir of ['kit', 'references', 'audit', 'evals']) if (!existsSync(join(SKILL, dir))) problems.push(`missing ${dir}/`);
  for (const abs of files(SKILL)) {
    const rel = relative(SKILL, abs);
    const text = readFileSync(abs, 'utf8');
    problems.push(...checkFile(rel, text));
    if (rel.endsWith('.md')) problems.push(...missingRefs(text));
  }
  const { CASES, CLI, runCase } = await import('../evals/run-evals.mjs');
  if (!existsSync(CLI)) problems.push(`the CLI is not built (${CLI}); run pnpm build:cli`);
  if (CASES.length < 8) problems.push(`evals/cases.json has ${CASES.length} cases (min 8)`);
  const evals = JSON.parse(readFileSync(join(SKILL, 'evals/evals.json'), 'utf8')).evals;
  if (!evals.some((e) => e.should_trigger) || !evals.some((e) => !e.should_trigger)) problems.push('evals/evals.json needs trigger and negative prompts');
  // The sandbox run: the kit maps a fixture with the network blocked.
  if (existsSync(CLI)) problems.push(...runCase(CASES.find((c) => c.id === 'current-env')).problems.map((p) => `sandbox run: ${p}`));
  for (const p of problems) console.log(`- ${p}`);
  console.log(problems.length ? `skill:audit: ${problems.length} problem(s)` : 'skill:audit: passed');
  return problems.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
