// `reasontrail install-skill` (PLAN C6): copies the skill (SKILL.md, kit, references) into the agent's skills folder.
// Idempotent; never overwrites a file the user changed unless --force; --dry-run writes nothing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PKG_NAME, VERSION } from './meta';

/** The skill's files, bundled into the CLI at build time (relative path → text). */
const BUNDLED = import.meta.glob(['../../skills/reasontrail/SKILL.md', '../../skills/reasontrail/kit/*.mjs', '../../skills/reasontrail/references/*.md'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
export const SKILL_FILES: Record<string, string> = Object.fromEntries(Object.entries(BUNDLED).map(([k, v]) => [k.replace('../../skills/reasontrail/', ''), v]).sort());

/** Written last; holds a hash of each file as installed, so a later run can tell a user's edit from an old version. */
export const MANIFEST = '.reasontrail-install.json';
const TARGETS = ['claude', 'grok', 'codex', 'all'] as const;

export interface InstallContext {
  home: string;
  env: Readonly<Record<string, string | undefined>>;
  out: (line: string) => void;
  err: (line: string) => void;
  /** Absolute path of the running CLI, written to kit/cli.json so the installed kit can find it. */
  cli: string;
}

type Action = 'add' | 'update' | 'unchanged' | 'modified';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined);

/** What installing `files` into `dir` would do to each file. */
export function planInstall(dir: string, files: Record<string, string>): [string, Action][] {
  let installed: Record<string, string> = {};
  try {
    installed = (JSON.parse(read(join(dir, MANIFEST)) ?? '{}') as { files?: Record<string, string> }).files ?? {};
  } catch {
    // unreadable manifest: every differing file counts as changed by hand
  }
  return Object.entries(files).map(([rel, text]) => {
    const now = read(join(dir, rel));
    if (now === undefined) return [rel, 'add'];
    if (now === text) return [rel, 'unchanged'];
    return [rel, installed[rel] === sha(now) ? 'update' : 'modified'];
  });
}

/** Install into one folder. Returns false when a changed file blocks it. */
function installInto(label: string, dir: string, files: Record<string, string>, o: { dryRun: boolean; force: boolean }, ctx: InstallContext): boolean {
  const plan = planInstall(dir, files);
  const blocked = plan.filter(([, a]) => a === 'modified').map(([rel]) => rel);
  ctx.out(`${label}: ${dir}`);
  for (const [rel, a] of plan) ctx.out(`  ${a === 'modified' && o.force ? 'overwrite' : a}  ${rel}`);
  if (blocked.length && !o.force) {
    ctx.err(`${label}: not installed. These files were changed after install: ${blocked.join(', ')}. Re-run with --force to replace them.`);
    return false;
  }
  if (plan.every(([, a]) => a === 'unchanged')) return ctx.out(`${label}: unchanged (already up to date)`), true;
  ctx.out(`  record  ${MANIFEST}`);
  if (o.dryRun) return ctx.out(`${label}: dry run, nothing written`), true;
  for (const [rel, a] of plan) {
    if (a === 'unchanged') continue;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), files[rel] as string);
  }
  const hashes = Object.fromEntries(Object.entries(files).map(([rel, text]) => [rel, sha(text)]));
  writeFileSync(join(dir, MANIFEST), `${JSON.stringify({ version: VERSION, files: hashes }, null, 2)}\n`);
  ctx.out(`${label}: installed. Restart the agent, then ask it to "map this session" or type /${PKG_NAME}.`);
  return true;
}

export function installSkill(argv: readonly string[], ctx: InstallContext): number {
  const o = { target: 'all' as (typeof TARGETS)[number], dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = (argv[i] as string).split(/=(.*)/s);
    if (flag === '--dry-run') o.dryRun = true;
    else if (flag === '--force') o.force = true;
    else if (flag === '--target' && TARGETS.includes((inline ?? argv[i + 1]) as never)) o.target = (inline ?? argv[++i]) as typeof o.target;
    else return ctx.err(`${PKG_NAME} install-skill: ${flag === '--target' ? `--target must be one of ${TARGETS.join(', ')}` : `unknown option: ${argv[i]}`}\nUsage: ${PKG_NAME} install-skill [--target claude|grok|codex|all] [--dry-run] [--force]`), 1;
  }
  const files = { ...SKILL_FILES, 'kit/cli.json': `${JSON.stringify({ cli: ctx.cli, version: VERSION }, null, 2)}\n` };
  const claudeSkills = join(ctx.env.CLAUDE_CONFIG_DIR || join(ctx.home, '.claude'), 'skills');
  const want = (t: string) => o.target === t || o.target === 'all';
  let ok = true;
  if (want('claude')) ok = installInto('Claude Code', join(claudeSkills, PKG_NAME), files, o, ctx) && ok;
  if (want('grok')) {
    if (existsSync(claudeSkills) || (want('claude') && ok)) ctx.out(`Grok Build: reads ${claudeSkills}, so nothing extra is needed.`);
    else ok = installInto('Grok Build', join(ctx.env.GROK_HOME || join(ctx.home, '.grok'), 'skills', PKG_NAME), files, o, ctx) && ok;
  }
  if (want('codex')) ctx.out('Codex: not supported yet (coming in phase 18 of the roadmap).');
  return ok ? 0 : 1;
}
