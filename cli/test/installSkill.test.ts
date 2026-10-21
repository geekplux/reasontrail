import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { installSkill, MANIFEST, planInstall, SKILL_FILES } from '../src/installSkill';

const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));

function sandbox(env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'reasontrail-install-'));
  homes.push(home);
  const lines = { out: [] as string[], err: [] as string[] };
  const run = (...argv: string[]) => installSkill(argv, { home, env, cli: '/opt/reasontrail/cli.mjs', out: (l) => lines.out.push(l), err: (l) => lines.err.push(l) });
  return { home, lines, run, skill: join(home, '.claude', 'skills', 'reasontrail') };
}

describe('install-skill in a sandbox HOME', () => {
  it('bundles SKILL.md, the kit and the references', () => {
    expect(Object.keys(SKILL_FILES)).toEqual(['SKILL.md', 'kit/run.mjs', 'references/formats.md', 'references/privacy.md', 'references/troubleshooting.md']);
  });

  it('--dry-run lists the exact files and writes nothing', () => {
    const sb = sandbox();
    expect(sb.run('--dry-run')).toBe(0);
    expect(sb.lines.out).toEqual([
      `Claude Code: ${sb.skill}`,
      '  add  SKILL.md', '  add  kit/run.mjs', '  add  references/formats.md', '  add  references/privacy.md', '  add  references/troubleshooting.md', '  add  kit/cli.json', '  record  .reasontrail-install.json',
      'Claude Code: dry run, nothing written',
      `Grok Build: reads ${join(sb.home, '.claude', 'skills')}, so nothing extra is needed.`,
      'Codex: not supported yet (coming in phase 18 of the roadmap).',
    ]);
    expect(existsSync(join(sb.home, '.claude'))).toBe(false);
  });

  it('installs, then reports unchanged, and keeps a changed file unless --force', () => {
    const sb = sandbox();
    expect(sb.run('--target', 'claude')).toBe(0);
    expect(readFileSync(join(sb.skill, 'SKILL.md'), 'utf8')).toBe(SKILL_FILES['SKILL.md']);
    expect(JSON.parse(readFileSync(join(sb.skill, 'kit/cli.json'), 'utf8'))).toMatchObject({ cli: '/opt/reasontrail/cli.mjs' });
    expect(existsSync(join(sb.skill, MANIFEST))).toBe(true);
    sb.lines.out.length = 0;
    expect(sb.run('--target=claude')).toBe(0);
    expect(sb.lines.out.at(-1)).toBe('Claude Code: unchanged (already up to date)');

    writeFileSync(join(sb.skill, 'kit/run.mjs'), '// my edit\n');
    expect(sb.run('--target', 'claude')).toBe(1);
    expect(sb.lines.err.at(-1)).toMatch(/changed after install: kit\/run\.mjs\. Re-run with --force/);
    expect(readFileSync(join(sb.skill, 'kit/run.mjs'), 'utf8')).toBe('// my edit\n');
    expect(sb.run('--target', 'claude', '--force')).toBe(0);
    expect(readFileSync(join(sb.skill, 'kit/run.mjs'), 'utf8')).toBe(SKILL_FILES['kit/run.mjs']);
  });

  it('updates an older installed version without --force', () => {
    const sb = sandbox();
    sb.run('--target', 'claude');
    const old = { ...SKILL_FILES, 'SKILL.md': 'old\n' };
    // Simulate an older install: the file and its manifest hash both say "old".
    writeFileSync(join(sb.skill, 'SKILL.md'), 'old\n');
    const manifest = JSON.parse(readFileSync(join(sb.skill, MANIFEST), 'utf8'));
    manifest.files['SKILL.md'] = createHash('sha256').update('old\n').digest('hex');
    writeFileSync(join(sb.skill, MANIFEST), JSON.stringify(manifest));
    expect(planInstall(sb.skill, old).find(([rel]) => rel === 'SKILL.md')?.[1]).toBe('unchanged');
    expect(planInstall(sb.skill, SKILL_FILES).find(([rel]) => rel === 'SKILL.md')?.[1]).toBe('update');
  });

  it('grok installs into GROK_HOME only when ~/.claude/skills is absent; codex is not yet supported', () => {
    const sb = sandbox({ GROK_HOME: '' });
    expect(sb.run('--target', 'grok')).toBe(0);
    expect(existsSync(join(sb.home, '.grok', 'skills', 'reasontrail', 'SKILL.md'))).toBe(true);
    const sb2 = sandbox();
    mkdirSync(join(sb2.home, '.claude', 'skills'), { recursive: true });
    expect(sb2.run('--target', 'grok')).toBe(0);
    expect(sb2.lines.out).toEqual([`Grok Build: reads ${join(sb2.home, '.claude', 'skills')}, so nothing extra is needed.`]);
    expect(existsSync(join(sb2.home, '.grok'))).toBe(false);
    const sb3 = sandbox();
    expect(sb3.run('--target', 'codex')).toBe(0);
    expect(sb3.lines.out).toEqual(['Codex: not supported yet (coming in phase 18 of the roadmap).']);
    expect(sb3.run('--target', 'vscode')).toBe(1);
  });
});
