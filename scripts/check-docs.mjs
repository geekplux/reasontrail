#!/usr/bin/env node
// Docs check (PLAN S7, phase 26): every relative link and image in the top-level docs resolves to a committed file,
// every image has descriptive alt text, and every `npx reasontrail …` command the README shows is one of `shared/commands.ts`
// (the single source the CLI's --help, the skill installer and the website use). Demo links
// (`https://reasontrail.example/?session=<id>&step=<id>`, PLAN D20) must name a bundled sample and one of its steps.
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
  let text = stripCode(md);
  const refs = [];
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  // A linked image, `[![alt](src)](href)`: both refs, then blanked so the general pattern below does not see it.
  for (const m of text.matchAll(/\[!\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^)\s>]+)>?\)\]\(\s*<?([^)\s>]+)>?\)/g)) {
    refs.push({ kind: 'image', target: m[2], alt: m[1], line: lineOf(m.index) }, { kind: 'link', target: m[3], line: lineOf(m.index) });
  }
  text = text.replace(/\[!\[(?:[^\]\\]|\\.)*\]\(\s*<?[^)\s>]+>?\)\]\(\s*<?[^)\s>]+>?\)/g, (m) => ' '.repeat(m.length));
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

/** The placeholder demo origin (PLAN D20); replaced after Sean deploys (docs/DEPLOY.md lists every file). */
export const DEMO_ORIGIN = 'https://reasontrail.example';
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DEMO_LINK = new RegExp(`${escapeRe(DEMO_ORIGIN)}/?(\\?[^\\s)"'<>\`]*)?`, 'g');

/** Problems with demo links: each `?session=` must be a sample in `samples` (id → its step ids), each `?step=` one of
 * that sample's steps. Links in code count too, since they are meant to be copied. A template (`?session=<id>`) is skipped. */
export function checkDemoLinks(file, md, samples) {
  const problems = [];
  const lineOf = (i) => md.slice(0, i).split('\n').length;
  for (const m of md.matchAll(DEMO_LINK)) {
    const url = m[0].replace(/[.,:;!?]+$/, ''); // trailing punctuation is prose, as in GitHub's autolinks
    const q = new URLSearchParams((url.split('?')[1] ?? '').replace(/&amp;/g, '&'));
    const session = q.get('session');
    const step = q.get('step');
    const where = `${file}:${lineOf(m.index)}`;
    if (session === '') continue; // a template such as `?session=<id>`
    if (session === null) {
      if (step !== null) problems.push(`${where}: demo link has a step but no session: ${url}`);
      continue;
    }
    const steps = samples.get(session);
    if (!steps) problems.push(`${where}: demo link names an unknown sample "${session}": ${url}`);
    else if (step !== null && !steps.has(step)) problems.push(`${where}: demo link names a step "${step}" that ${session} does not have: ${url}`);
  }
  return problems;
}

/** The bundled samples: id → the set of its step ids, read from `src/sessions/samples/<id>.graph.json`. */
export function readSamples(dir) {
  return new Map(readdirSync(dir).filter((f) => f.endsWith('.graph.json')).map((f) => [f.slice(0, -'.graph.json'.length), new Set(JSON.parse(readFileSync(join(dir, f), 'utf8')).steps.map((s) => s.id))]));
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
  const samples = readSamples(join(root, 'src', 'sessions', 'samples'));
  const problems = files.flatMap((f) => {
    const md = readFileSync(join(root, f), 'utf8');
    return [...checkRefs(f, md, has), ...checkDemoLinks(f, md, samples)];
  });
  problems.push(...checkCommands(readFileSync(join(root, 'README.md'), 'utf8'), readCommands(readFileSync(join(root, 'shared', 'commands.ts'), 'utf8'))));
  console.log(`check:docs: ${files.length} files checked`);
  if (problems.length) {
    console.error(`check:docs FAILED:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exitCode = 1;
  } else console.log('check:docs passed');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
