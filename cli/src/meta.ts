// Package identity and exit codes (PLAN D25, C2). Docs and the skill write `npx reasontrail` through PKG_NAME.
import pkg from '../package.json';

export const PKG_NAME = 'reasontrail';
export const VERSION: string = pkg.version;
export const SOURCE_URL = 'https://github.com/geekplux/reasontrail';

/** Documented exit codes (C2). */
export const EXIT = { ok: 0, usage: 1, notFound: 2, unreadable: 3 } as const;

export const HELP = `${PKG_NAME} ${VERSION}: see what your coding agent did.

Usage: npx ${PKG_NAME} [session] [options]
       npx ${PKG_NAME} install-skill [--target claude|grok|codex|all] [--dry-run] [--force]

  session            a session .jsonl path or a session id (default: the newest session for this folder)

Options:
  --current          the calling agent's session (CLAUDE_CODE_SESSION_ID), else the newest for this folder
  --latest           the newest session for this folder
  --list             the 10 most recent sessions for this folder
  --source <name>    claude-code (codex and grok-build come later)
  --out <file>       where to write the HTML
  --share            redact secrets, emails and home paths; writes ./reasontrail-<id>.html
  --json             print the session graph as JSON instead of writing HTML
  --no-open          print the path instead of opening a browser
  -h, --help         this help
  -v, --version      the version

install-skill puts the /${PKG_NAME} skill into ~/.claude/skills (Grok Build reads it too; ~/.grok/skills
when ~/.claude is absent). It never replaces a file you changed unless --force is given.

Writes <tmp>/reasontrail/<source>-<id>.html by default. Runs locally; nothing is uploaded.

Exit codes: 0 ok, 1 bad arguments, 2 no session found, 3 unreadable or unsupported file.`;
