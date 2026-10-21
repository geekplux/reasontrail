# Reasontrail

See what your coding agent did. One command turns a Claude Code session into a self-contained map: the task, the route it took, where it got stuck and what changed. It runs on your machine, makes no network requests and uploads nothing. A zoom-in lens still shows a language model's next-token choices as a garden of branches.

**Status:** early development (see [`docs/PLAN.md`](docs/PLAN.md)). License: [MIT](LICENSE).

## Try it (from a clone, before the package is published)

```sh
pnpm install && pnpm build:cli
node cli/dist/cli.mjs             # the newest Claude Code session for this folder, opened as a local HTML page
node cli/dist/cli.mjs --list      # the 10 most recent sessions for this folder
node cli/dist/cli.mjs --share     # a redacted copy in the current folder, safe to send
node cli/dist/cli.mjs --help      # every flag and the exit codes
```

## How to read this map

- **Task**: the first thing you asked, with the source, model, time and counts.
- **At a glance**: whether the last test, build, lint or typecheck run passed, how many trouble spots were found, and how many files changed.
- **Route**: the session cut into numbered episodes (▶ a request, ○ exploring, ■ changing files, ◇ verifying, ● handing work to a subagent, ◉ the answer). Subagents are indented under the episode that started them. Each episode's steps are behind its "Steps" button.
- **Trouble** (square plates): error streaks, retries, reverts, rewinds, interruptions and churn. These are detected patterns found by fixed rules, not by AI.
- **Destination**: the changed files, the last verification and the final answer.

Written reasoning is the agent's own account, not a record of how the model computed. Thinking whose text was not stored is shown as "thinking (text not stored)"; nothing is invented for it.

## Develop

Requires Node 20.19+ and pnpm 9.

```sh
pnpm install
pnpm dev             # local dev server
pnpm lint            # oxlint
pnpm typecheck       # tsc --noEmit
pnpm test            # Vitest, single run
pnpm build           # production build into dist/
pnpm build:cli       # the local viewer (one HTML file) and the CLI into cli/dist/
pnpm test:cli        # CLI unit tests
pnpm check:size      # size budgets on dist/ and the runtime dependency allowlist
pnpm check:browser   # build, preview, headless Chrome flows + axe, screenshots in .tmp/screenshots/
pnpm run check:deploy  # Worker dry run (bundle + bindings into .wrangler/dry-run/); deploys nothing
pnpm dev:worker      # wrangler dev for /api/next-tokens; needs valid Cloudflare auth (Workers AI runs remotely)
node scripts/smoke-workers-ai.mjs  # one real Workers AI logprobs call; prints SKIPPED without a valid token
```

`pnpm check:browser` uses the system Chrome (`/usr/bin/google-chrome`, override with `CHROME_PATH`) and port 4317 (override with `TG_PORT`). Options: `--flows a,b|all`, `--out <dir>`, `--no-build`, `--fail-after-launch` (tests that cleanup also runs on failure). It always closes the browser and stops the preview server, and prints a `cleanup:` line.

## How this repo is built

This repository is developed by a Claude Code main agent acting as product manager, delegating to the specialist sub-agents in `.claude/agents/`. See `CLAUDE.md` for the operating manual, `docs/PLAN.md` for the plan and `docs/STATUS.md` for live progress. Work lands as a stack of pull requests, one per phase; nothing is merged without review.
