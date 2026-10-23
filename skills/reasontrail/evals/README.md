# Evals

Two kinds, as in the [anatomy](https://github.com/wheresryan22/anatomy) skill layout:

- **`cases.json`, scripted (`pnpm skill:evals`).** Thirteen cases run `kit/run.mjs --no-open` in a fresh sandbox each: their own `HOME`, `TMPDIR` and project folder under the system temp folder, fixture sessions from `fixtures/sessions/{claude-code,grok-build,codex}/` placed in the matching store (`~/.claude/projects`, `~/.grok/sessions`, `~/.codex/sessions`), a clean environment and the network blocked by `no-network.mjs`. They cover the current session from `CLAUDE_CODE_SESSION_ID` and `GROK_SESSION_ID`, the latest-session fallback (Claude Code, Grok Build, Codex, and all three stores at once), two sessions in one folder, an id that is not found, no session, a malformed file, `--share`, paths with spaces and a subagent session. Each checks the exit code, the single `MAP: <path>` line, which session was mapped and the HTML. The run fails if any process is left. Build the CLI first (`pnpm build:cli`); `--keep` leaves the sandboxes for screenshots.
- **`evals.json`, model in the loop (manual).** Prompts that must trigger the skill and prompts that must not. They need a coding agent with a model, and there is no model key on the build machine, so they are run by hand: install the skill into a test `HOME` (`HOME=/tmp/rt-home node cli/dist/cli.mjs install-skill`), start the agent there, paste each prompt and compare with `expected_output`.

Nothing here reads your real `~/.claude`, `~/.grok`, `~/.codex` or `~/.agents`.
