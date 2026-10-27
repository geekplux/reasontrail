# CLAUDE.md: maintainer guide (Reasontrail)

Reasontrail turns a coding-agent session (Claude Code, Codex, Grok Build) or a chat transcript into a map: a tree of
episodes and subagents, a git-style list of every step, and the outcome. It ships as a zero-dependency CLI
(`npx reasontrail`), an agent skill (`/reasontrail`) and a showcase site at https://reasontrail.geekplux.com, with a
next-token "garden" as a zoom-in lens. Everything is parsed locally; nothing is uploaded.

How the code fits together: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Visual spec: `docs/DESIGN.md`.
Extending: `docs/EXTENDING.md`. Deploy and publish: `docs/DEPLOY.md`, `docs/PUBLISH.md`.

## Stack and commands

React 19 + Vite + TypeScript, Vitest, oxlint, pnpm 9, Node 22+ (the published CLI runs on Node 20.19+). The site
and the optional AI endpoints run on one Cloudflare Worker (Workers AI, KV, rate limits).

```sh
pnpm dev                 # Vite dev server          pnpm dev:worker      # wrangler dev
pnpm lint                # oxlint, warnings fail    pnpm typecheck       # tsc for app, node, worker, session, cli
pnpm test                # Vitest, one run          pnpm build           # website into dist/
pnpm build:cli           # npm package in cli/dist  pnpm check:size      # size budgets, dependency allowlist
pnpm check:docs          # links, alt text, README commands      pnpm check:pack   # npm tarball contents
pnpm run check:deploy    # wrangler dry run, deploys nothing     pnpm check:browser # headless Chrome flows + axe
pnpm audit:samples       # no secrets or personal data in samples
pnpm skill:audit / skill:evals          pnpm samples:sessions / samples:record
```

## Rules

- **Toolchain:** pure React + Vite with the VoidZero tools (Vite, Vitest, oxlint). No Next.js, no Remix, no other
  meta-framework. Package manager: pnpm. Anything deployed runs on Cloudflare; use `wrangler` for local dev.
- **Deployment** happens only through Cloudflare Workers Builds on merge to `main`. Never run `wrangler deploy`;
  the dry run `pnpm run check:deploy` is fine and should pass before every PR. Merging is the maintainer's call, so
  a merged PR is a deploy. Never merge PRs yourself.
- `.claude/settings.json` denies `gh pr merge`, `gh stack merge`, every form of `wrangler deploy` and
  `wrangler pages deploy`, `pnpm run deploy`, `pnpm deploy`, `npm run deploy` and force-pushes to `main`. Do not
  work around it and do not edit it.
- **Secrets:** never commit them. Local secrets go in `.dev.vars` (gitignored); deployed ones via
  `wrangler secret put`.
- **Accessibility:** never rely on colour alone; palettes must pass protanopia, deuteranopia and tritanopia checks;
  everything keyboard-operable; `prefers-reduced-motion` respected.
- No decorative 3D. Nothing finance-related (no prices, trading, crypto, payments features or sample data).
- No company names in project content, samples, docs, commits or PRs, apart from tools, services and cited sources.
- **Lean AI:** deterministic code first; use the model only where it adds real value. Cache every answer and keep
  the global daily cap (`DAILY_UPSTREAM_CAP` in `wrangler.jsonc`) and the per-IP rate limits in place.
- **Samples:** the built-in samples work offline and without any API key. Committed samples are redacted
  (`tools/session-samples.json`) and must pass `pnpm audit:samples`.
- **CI** lives in `.github/workflows/ci.yml` and runs on every push to `main` and every pull request. Keep it in
  step with the checks contributors run locally (`CONTRIBUTING.md`).
- New work is ordinary branches and PRs against `main`. Before calling work done: `pnpm lint && pnpm typecheck &&
  pnpm test && pnpm build`, plus `check:size`, `check:docs` and the dry run when they apply.
