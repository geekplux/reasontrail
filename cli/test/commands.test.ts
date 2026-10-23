// PLAN phase 19, AC2: the website's commands come from shared/commands.ts; each must be valid for this CLI.
import { describe, expect, it } from 'vitest';
import { COMMANDS, NPX, SKILL_HOMES } from '../../shared/commands';
import { parseArgs } from '../src/args';
import { HELP } from '../src/meta';

describe('website commands', () => {
  it.each(Object.entries(COMMANDS))('%s parses and its flags are in --help', (_, cmd) => {
    expect(cmd.startsWith(NPX)).toBe(true);
    const args = cmd.split(' ').slice(2);
    for (const a of args.filter((x) => x.startsWith('-') || x === 'install-skill')) expect(HELP).toContain(a);
  });

  it.each(Object.values(COMMANDS).filter((c) => !c.includes('install-skill')))('%s is accepted by the argument reader', (cmd) => {
    expect(parseArgs(cmd.split(' ').slice(2))).not.toHaveProperty('error');
  });

  it('the help names every skill folder the installer uses', () => {
    for (const dir of Object.values(SKILL_HOMES)) expect(HELP).toContain(dir);
  });
});
