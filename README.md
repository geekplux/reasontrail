# token-garden

Type a prompt and watch the model's possible continuations grow as a garden of branches: each fork is a next-token choice, branch thickness is that token's probability, and clicking any branch grows it further. A built-in recorded sample means the very first view costs nothing and works offline.

**Status:** early development (phase 1 of the plan in [`docs/PLAN.md`](docs/PLAN.md)). License: [MIT](LICENSE).

## Develop

Requires Node 20.19+ and pnpm 9.

```sh
pnpm install
pnpm dev             # local dev server
pnpm lint            # oxlint
pnpm typecheck       # tsc --noEmit
pnpm test            # Vitest, single run
pnpm build           # production build into dist/
pnpm check:size      # size budgets on dist/ and the runtime dependency allowlist
pnpm check:browser   # build, preview, headless Chrome flows + axe, screenshots in .tmp/screenshots/
pnpm run check:deploy  # Worker dry run (bundle + bindings into .wrangler/dry-run/); deploys nothing
pnpm dev:worker      # wrangler dev for /api/next-tokens; needs valid Cloudflare auth (Workers AI runs remotely)
node scripts/smoke-workers-ai.mjs  # one real Workers AI logprobs call; prints SKIPPED without a valid token
```

`pnpm check:browser` uses the system Chrome (`/usr/bin/google-chrome`, override with `CHROME_PATH`) and port 4317 (override with `TG_PORT`). Options: `--flows a,b|all`, `--out <dir>`, `--no-build`, `--fail-after-launch` (tests that cleanup also runs on failure). It always closes the browser and stops the preview server, and prints a `cleanup:` line.

## How this repo is built

This repository is developed by a Claude Code main agent acting as product manager, delegating to the specialist sub-agents in `.claude/agents/`. See `CLAUDE.md` for the operating manual, `docs/PLAN.md` for the plan and `docs/STATUS.md` for live progress. Work lands as a stack of pull requests, one per phase; nothing is merged without review.
