// Package identity and exit codes (PLAN D25, C2). Docs and the skill write `npx reasontrail` through PKG_NAME.
import pkg from '../package.json';
import { PKG_NAME, SKILL_HOMES } from '../../shared/commands';

export { PKG_NAME };
export const VERSION: string = pkg.version;
export const SOURCE_URL = 'https://github.com/geekplux/reasontrail';
/** `--ai`'s default endpoint: the public site's Worker (a placeholder until deployment, D20). */
export const DEFAULT_AI_ENDPOINT = 'https://reasontrail.geekplux.com/api/structure';

/** Documented exit codes (C2). */
export const EXIT = { ok: 0, usage: 1, notFound: 2, unreadable: 3 } as const;

export const HELP = `${PKG_NAME} ${VERSION}: see how your coding agent reasoned and worked.

Usage: npx ${PKG_NAME} [session] [options]
       npx ${PKG_NAME} install-skill [--target claude|grok|codex|all] [--dry-run] [--force]

  session            a session file (.jsonl, Grok's updates.jsonl, a Codex rollout) or a session id
                     (default: the newest session for this folder)

Options:
  --current          the calling agent's session (CLAUDE_CODE_SESSION_ID, GROK_SESSION_ID or CODEX_THREAD_ID),
                     else the newest for this folder
  --latest           the newest session for this folder, across Claude Code, Grok Build and Codex
  --list             the 10 most recent sessions for this folder, from all three
  --source <name>    only look in one store: claude-code, grok or codex
  --out <file>       where to write the HTML
  --share            redact secrets, emails and home paths; writes ./reasontrail-<id>.html
  --json             print the session graph as JSON instead of writing HTML
  --trim <from>:<to> keep only steps <from>..<to> of the full map (e.g. 0:399)
  --no-open          print the path instead of opening a browser
  --ai               ask a model to suggest AI titles and claim links (opt-in; the only option that uses the
                     network): prints what will be sent and asks first. Sends redacted one-line step
                     summaries only
  --api <url>        the endpoint for --ai (default ${DEFAULT_AI_ENDPOINT})
  -y, --yes          send without asking (needed for --ai without a terminal)
  -h, --help         this help
  -v, --version      the version

install-skill puts the /${PKG_NAME} skill into ${SKILL_HOMES.claude} (Grok Build reads it too; ${SKILL_HOMES.grok}
when ~/.claude is absent) and ${SKILL_HOMES.codex} (Codex). It never replaces a file you changed unless --force.

Writes <tmp>/reasontrail/<source>-<id>.html by default. Runs locally; nothing is uploaded unless you pass --ai.

Exit codes: 0 ok, 1 bad arguments, 2 no session found, 3 unreadable or unsupported file.`;
