# Troubleshooting

## "No Claude Code session was found" (exit 2)

Reasontrail looks in `~/.claude/projects/<folder>/`, where `<folder>` is the current working directory with every character other than a letter or digit replaced by `-`.

- Run the kit from the project folder the session started in.
- If you moved `~/.claude`, set `CLAUDE_CONFIG_DIR` to the new place.
- Map a file directly: `node cli/dist/cli.mjs <path to session>.jsonl` (once Reasontrail is published: `npx reasontrail <path>`).

## The map shows the wrong session

The kit asks for the current session through `CLAUDE_CODE_SESSION_ID`. When that is not set, or not found, it takes the newest session for the folder and says so on stderr, for example `session 1a2b… was not found; using the newest for this folder`. With two sessions running in one folder, the newest is not always yours. To choose, call the CLI directly (its path is in `${CLAUDE_SKILL_DIR}/kit/cli.json`): `node <cli> --list` shows the ten most recent, then `node <cli> <session id>` maps that one.

## "could not read" or "this doesn't look like a Claude Code session" (exit 3)

The file is not a Claude Code transcript, or it is damaged. Broken lines are skipped and counted in the map; a file with no readable records at all is refused.

## No browser opens

Over SSH, in a container or without a display, no browser opens; the kit still prints `MAP: <path>`. Open `file://<path>` in a browser on this machine, or copy the file to one that has a browser. Pass `--no-open` to skip trying.

## "reasontrail: the CLI was not found"

Until `reasontrail` is published to npm, the kit needs a built CLI:

1. In a clone of the repository: `pnpm install && pnpm build:cli`.
2. Then either run `node cli/dist/cli.mjs install-skill` (the installed kit remembers where the CLI is) or set `REASONTRAIL_CLI=/path/to/cli/dist/cli.mjs`.

Once published, the kit will use `npx --yes reasontrail@<version>` instead.

## The skill does not show up

Run `node cli/dist/cli.mjs install-skill --dry-run` to see where it would go, then without `--dry-run`. Restart the agent so it rescans its skills. If you edited the installed files, the installer keeps your changes and stops; add `--force` to replace them.
