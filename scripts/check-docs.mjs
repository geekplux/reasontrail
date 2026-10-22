#!/usr/bin/env node
// Docs check (PLAN S7, phase 26): every relative link and image in the top-level docs resolves to a committed file,
// every image has descriptive alt text, and every `npx reasontrail …` command the README shows is one of `shared/commands.ts`
// (the single source the CLI's --help, the skill installer and the website use).
// Usage: pnpm check:docs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The files checked, relative to the repo root (`docs/*.md` and `examples/README.md` are added when present). */
export const DOC_FILES = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', '.github/pull_request_template.md'];
/** The local CLI from a clone, which takes the same arguments as `npx reasontrail` until the package is published. */
export const LOCAL_CLI = 'node cli/dist/cli.mjs';

/** Markdown with fenced code blocks and inline code blanked out (line count kept), so examples are not checked as links. */
export function stripCode(md) {
  return md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (block) => block.replace(/[^\n]/g, ' ')).replace(/`[^`\n]*`/g, (c) => ' '.repeat(c.length));
}

/** Links and images in Markdown and inline HTML: `{ kind: 'link' | 'image', target, alt?, line }`. */
export function extractRefs(md) {
  const text = stripCode(md);
  const refs = [];
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  for (const m of text.matchAll(/(!?)\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    refs.push({ kind: m[1] ? 'image' : 'link', target: m[3], alt: m[1] ? m[2] : undefined, line: lineOf(m.index) });
  }
  for (const m of text.matchAll(/<(img|source|a)\b([^>]*)>/gi)) {
    const attr = (name) => m[2].match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
    const tag = m[1].toLowerCase();
    if (tag === 'a' && attr('href')) refs.push({ kind: 'link', target: attr('href'), line: lineOf(m.index) });
    if (tag === 'img') refs.push({ kind: 'image', target: attr('src') ?? '', alt: attr('alt'), line: lineOf(m.index) });
    if (tag === 'source') for (const s of (attr('srcset') ?? '').split(',').filter((x) => x.trim())) refs.push({ kind: 'image', target: s.trim().split(/\s+/)[0], alt: '(picture source)', line: lineOf(m.index) });
  }
  return refs;
}

/** Alt text that names the kind of thing instead of saying what it shows. */
export const VAGUE_ALT = /^(image|img|screenshot|picture|photo|logo|hero)$/i;

/** True for targets this check does not resolve: other sites, mail, in-page anchors. */
export const isExternal = (target) => /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('//');

/** Problems with one file's refs. `has(path)` says whether a repo-relative path is a committed file or directory. */
export function checkRefs(file, md, has) {
  const problems = [];
  for (const ref of extractRefs(md)) {
    const where = `${file}:${ref.line}`;
    if (ref.kind === 'image' && !ref.alt?.trim()) problems.push(`${where}: image without alt text: ${ref.target}`);
    else if (ref.kind === 'image' && VAGUE_ALT.test(ref.alt.trim())) problems.push(`${where}: image alt text does not describe it ("${ref.alt.trim()}"): ${ref.target}`);
    if (!ref.target || isExternal(ref.target)) continue;
    const path = decodeURI(ref.target.replace(/[?#].*$/, ''));
    const target = ref.target.startsWith('/') ? path.slice(1) : join(dirname(file), path);
    if (!has(target.replace(/\/$/, ''))) problems.push(`${where}: ${ref.kind} does not resolve to a committed file: ${ref.target}`);
  }
  return problems;
}

/** The command strings in `shared/commands.ts`, read from its source (Node 20 cannot import TypeScript). */
export function readCommands(source) {
  const pkg = source.match(/PKG_NAME\s*=\s*'([^']+)'/)?.[1];
  if (!pkg) throw new Error('shared/commands.ts: PKG_NAME not found');
  const npx = `npx ${pkg}`;
  const block = source.match(/export const COMMANDS\s*=\s*\{([\s\S]*?)\}\s*as const/)?.[1] ?? '';
  const commands = [...block.matchAll(/(\w+):\s*(NPX|`\$\{NPX\}([^`]*)`)/g)].map((m) => (m[2] === 'NPX' ? npx : npx + m[3]));
  if (!commands.length) throw new Error('shared/commands.ts: COMMANDS not found');
  return { npx, commands };
}

/** Problems with the README's commands: every `npx …` (and `node cli/dist/cli.mjs …`) line or inline command must be one
 * of `commands`, and the README must show the skill install and the open command. */
export function checkCommands(readme, { npx, commands }) {
  const md = readme.replace(/^> ?/gm, ''); // commands inside a blockquote count too
  const found = [];
  for (const m of md.matchAll(/^```(?:sh|bash|shell)?\n([\s\S]*?)^```/gm)) {
    for (const line of m[1].split('\n')) for (const part of line.replace(/\s+#.*$/, '').split('&&')) found.push(part.trim());
  }
  for (const m of md.matchAll(/`([^`\n]+)`/g)) found.push(m[1].trim());
  const problems = [];
  for (const cmd of found) {
    const asNpx = cmd.startsWith(`${LOCAL_CLI}`) ? npx + cmd.slice(LOCAL_CLI.length) : cmd;
    if (asNpx !== npx && !asNpx.startsWith(`${npx} `)) continue;
    if (!commands.includes(asNpx)) problems.push(`README.md: command not in shared/commands.ts: ${cmd}`);
  }
  for (const need of [commands[0], npx]) {
    if (!found.includes(need)) problems.push(`README.md: missing the command ${need}`);
  }
  return [...new Set(problems)];
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...DOC_FILES, ...readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`), 'examples/README.md'].filter((f) => existsSync(join(root, f)));
  let tracked;
  try {
    tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));
  } catch {
    tracked = undefined; // not a git checkout: fall back to the file system
  }
  const dirs = new Set([...(tracked ?? [])].flatMap((f) => f.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
  const has = (p) => {
    const rel = relative(root, resolve(root, p)).split('\\').join('/');
    return tracked ? tracked.has(rel) || dirs.has(rel) || rel === '' : existsSync(join(root, rel));
  };
  const problems = files.flatMap((f) => checkRefs(f, readFileSync(join(root, f), 'utf8'), has));
  problems.push(...checkCommands(readFileSync(join(root, 'README.md'), 'utf8'), readCommands(readFileSync(join(root, 'shared', 'commands.ts'), 'utf8'))));
  console.log(`check:docs: ${files.length} files checked`);
  if (problems.length) {
    console.error(`check:docs FAILED:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exitCode = 1;
  } else console.log('check:docs passed');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
