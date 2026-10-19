# token-garden

Type a prompt and watch the model's possible continuations grow as a garden of branches: each fork is a next-token choice, branch thickness is that token's probability, and clicking any branch grows it further. It makes sampling, temperature and uncertainty visible at a glance. A built-in recorded sample means the very first view costs nothing and works offline.

**Status:** planning

**Stack:** React + Vite + TypeScript, Vitest, oxlint; tree layout and rendering in SVG/Canvas 2D (d3-hierarchy style layout, no decorative 3D); an LLM provider that exposes token logprobs, called through a Cloudflare Worker (provider chosen in planning, see CLAUDE.md); recorded sample trees committed as JSON so no key is needed for the default experience.

## How this repo is built

This repository is developed by a Claude Code main agent acting as product manager, delegating to the specialist sub-agents in `.claude/agents/`. See `CLAUDE.md` for the operating manual, `docs/KICKOFF.md` for the start prompt, `docs/PLAN.md` for the plan (once written), and `docs/STATUS.md` for live progress. Work lands as a stack of pull requests, one per phase; nothing is merged without review.
