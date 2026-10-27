#!/usr/bin/env node
// Reasontrail skill kit: map the calling agent's session and print exactly one stdout line, `MAP: <path>`.
// The CLI's own messages (which session file was used, what --share replaced) pass through on stderr.
//
// CLI resolution, first match wins:
//   1. REASONTRAIL_CLI (a path to cli.mjs);
//   2. kit/cli.json, written by `reasontrail install-skill`;
//   3. this repository's cli/dist/cli.mjs (`pnpm build:cli`).
// There is no npx fallback on purpose: the kit never touches the network (SKILL.md, references/privacy.md).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = dirname(fileURLToPath(import.meta.url));

function resolveCli(env = process.env, kit = KIT) {
  if (env.REASONTRAIL_CLI) return env.REASONTRAIL_CLI;
  try {
    const { cli } = JSON.parse(readFileSync(join(kit, 'cli.json'), 'utf8'));
    if (typeof cli === 'string' && existsSync(cli)) return cli;
  } catch {
    // not installed by install-skill
  }
  const repo = resolve(kit, '../../../cli/dist/cli.mjs');
  return existsSync(repo) ? repo : undefined;
}

const cli = resolveCli();
if (!cli) {
  process.stderr.write('reasontrail: the CLI was not found. Run `npx reasontrail install-skill` again (it records where the CLI is), or set REASONTRAIL_CLI to the path of cli.mjs. See references/troubleshooting.md.\n');
  process.exit(1);
}
const res = spawnSync(process.execPath, [cli, '--current', ...process.argv.slice(2)], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const path = res.status === 0 ? res.stdout.trim().split('\n').pop() : undefined;
if (!path) {
  if (res.error) process.stderr.write(`reasontrail: ${res.error.message}\n`);
  process.exit(res.status || 1);
}
process.stdout.write(`MAP: ${path}\n`);
