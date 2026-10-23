# Troubleshooting

## "No Claude Code, Grok Build or Codex session was found" (exit 2)

Reasontrail looks for sessions of the current working directory in three stores (`references/formats.md` has the details):

- Claude Code: `~/.claude/projects/<folder>/`, where `<folder>` is the directory with every character other than a letter or digit replaced by `-`. If you moved `~/.claude`, set `CLAUDE_CONFIG_DIR`.
- Grok Build: `~/.grok/sessions/<url-encoded folder>/<session id>/updates.jsonl`. If you moved `~/.grok`, set `GROK_HOME`.
- Codex: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` whose first record names this folder as `cwd`. If you moved `~/.codex`, set `CODEX_HOME`.

Then:

- Run the kit from the project folder the session started in.
- Map a file directly: `node cli/dist/cli.mjs <path to session>.jsonl` (once Reasontrail is published: `npx reasontrail <path>`).

## The map shows the wrong session

The kit asks for the current session through `CLAUDE_CODE_SESSION_ID`, `GROK_SESSION_ID` or `CODEX_THREAD_ID`, in that order. When none is set, or none is found, it takes the newest session for the folder across all three stores and says so on stderr, for example `session 1a2b… was not found; using the newest for this folder`. With two sessions running in one folder, the newest is not always yours. To choose, call the CLI directly (its path is in `${CLAUDE_SKILL_DIR}/kit/cli.json`): `node <cli> --list` shows the ten most recent from all three stores, with their source, then `node <cli> <session id>` maps that one. `--source claude-code|grok|codex` keeps to one store. Grok Build documents `GROK_SESSION_ID` for hooks only, so inside Grok the kit may fall back to the newest session; when a Grok session runs inside a Claude Code terminal, the inherited `CLAUDE_CODE_SESSION_ID` can win, so pass the Grok session id explicitly.

## "could not read" or "this doesn't look like a Claude Code, Grok Build or Codex session" (exit 3)

The file is not a session transcript Reasontrail knows (a Claude Code `.jsonl`, Grok's `updates.jsonl` or a Codex rollout), or it is damaged. Broken lines are skipped and counted in the map; a file with no readable records at all is refused.

## No browser opens

Over SSH, in a container or without a display, no browser opens; the kit still prints `MAP: <path>`. Open `file://<path>` in a browser on this machine, or copy the file to one that has a browser. Pass `--no-open` to skip trying.

## "reasontrail: the CLI was not found"

Until `reasontrail` is published to npm, the kit needs a built CLI:

1. In a clone of the repository: `pnpm install && pnpm build:cli`.
2. Then either run `node cli/dist/cli.mjs install-skill` (the installed kit remembers where the CLI is) or set `REASONTRAIL_CLI=/path/to/cli/dist/cli.mjs`.

Once published, the kit will use `npx --yes reasontrail@<version>` instead.

## The skill does not show up

Run `node cli/dist/cli.mjs install-skill --dry-run` to see where it would go, then without `--dry-run`. Restart the agent so it rescans its skills. Codex looks in `~/.agents/skills/`, Claude Code and Grok Build in `~/.claude/skills/`. If you edited the installed files, the installer keeps your changes and stops; add `--force` to replace them.
