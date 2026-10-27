# Architecture

Reasontrail reads a coding-agent session (Claude Code, Codex, Grok Build) or a chat transcript and draws it as a
map: a tree of episodes and subagent lanes, a git-style list of every step, and an outcome summary. This page is for
engineers reading the code. For the visual spec see [`DESIGN.md`](DESIGN.md); for adding a format, sample or
provider see [`EXTENDING.md`](EXTENDING.md).

## The pieces

```
 session files (.jsonl, chat text, chat exports)
        │
        ▼
 shared/session   adapters ──► NormalizedSession ──► buildGraph ──► SessionGraph (JSON)
        │                                                              │
        ├── cli/  (Node)  locate the session, build, write one HTML file (viewer + graph)
        └── src/  (browser) parse in a Web Worker, render tree + list + outcome
                                                                       │
 worker/  (Cloudflare, optional)  /api/structure: AI episode titles ◄──┘ redacted text only
                                  /api/next-tokens: the next-token lens
```

- **`shared/session/`** is the core. Each adapter in `adapters/` turns one source format into a `NormalizedSession`
  (`adapter.ts` holds the interface and the registry; `sniff` picks the adapter from the first lines). `build/`
  turns that into a `SessionGraph`: steps, lanes, edges, episodes, trouble spots and the outcome. `redact.ts` replaces
  secrets, emails and home paths with typed placeholders; `trim.ts` cuts a step range. No DOM and no Node types,
  so the same code runs in the CLI and in a browser Web Worker (`tsconfig.session.json` enforces this).
- **`shared/commands.ts`** is the single list of CLI commands. The CLI's `--help`, the skill installer, the website's
  Install section and `pnpm check:docs` (for the README) all read it.
- **`cli/`** is the npm package `reasontrail`. `src/locate/` finds the current or newest session for each agent,
  `main.ts` builds the graph, `html.ts` fills the viewer template and `open.ts` opens it. `installSkill.ts` installs
  the agent skill from `skills/reasontrail/`.
- **`src/`** is one React app with two entry points: the website (`main.tsx`, `Site.tsx`) and the local viewer
  (`viewer/`). `map/tree/` lays out the tree, `map/gitlist/` the list, `site/` the pages and the step panel,
  `intake/` the drop zone and chat import, `share/` the redacted export, `garden/` and `lens/` the next-token lens.
- **`worker/`** is the Cloudflare Worker. It serves `dist/` as static assets and runs only for `/api/*`
  (`wrangler.jsonc`). `handler.ts` is a pure request handler; `upstream/` talks to Workers AI or any
  OpenAI-compatible server; `cache.ts`, `limits.ts` and `budget.ts` add the KV cache, per-IP rate limits and the
  daily cap.
- **`tools/` and `scripts/`** hold dev-time tools: sample recording and redaction, the size, docs and pack checks, and
  the headless-browser flows (`scripts/browser/`).

## Decisions that shaped it

- **Local first.** A session is parsed on the reader's machine, by the CLI or by a Web Worker in the browser.
  Nothing is uploaded unless the reader opts into AI titles, and then only redacted step summaries are sent.
- **Deterministic graph.** Episodes, trouble detection and outcomes come from rules over the transcript, not from a
  model. The same file always gives the same map, which keeps tests exact and maps reproducible.
- **One self-contained HTML file.** The viewer inlines its script (gzip and base64, inflated with
  `DecompressionStream`), its two subset fonts and the graph. It works from `file://` with no network, and it can be
  attached or shared as one file. `scripts/inline-viewer.mjs` builds the template; `check:size` keeps it under 300 KB.
- **A zero-dependency CLI.** `cli/package.json` has no runtime dependencies, so `npx reasontrail` installs fast and
  has nothing to audit. `check:pack` checks what the tarball holds.
- **Pure layout, thin rendering.** `layoutTree` and `listRows` are pure functions of the graph and the box, memoised
  per graph. Components only turn their output into SVG and DOM, so layout is tested without a browser.
- **The list is the accessible path.** The tree is an image with a factual summary; the list is a WAI-ARIA tree that
  reaches every step by keyboard. Meaning is carried by shape and text, and colour only repeats it.
- **Lean AI.** Both endpoints are optional and the site works without them. Answers are cached in KV (by prefix hash
  for the lens, by batch hash for titles), misses go through per-IP rate limits, and `DAILY_UPSTREAM_CAP` caps
  upstream calls for all users per UTC day. The cap is soft because KV counters are not atomic.
- **Offline samples.** Three real sessions are trimmed, redacted and bundled (`src/sessions/samples/`), with
  recorded lens gardens, so the first view needs no key and no network. Only the default sample loads with the first
  view; `check:size` enforces the gzip budgets.

## Extending it

- **A new agent format:** add an adapter in `shared/session/adapters/`, register it in `adapter.ts`, add a locator in
  `cli/src/locate/` if the CLI should find sessions by itself, and run the shared contract suite
  (`shared/session/adapterContract.ts`) on a synthetic fixture in `fixtures/sessions/`.
- **A new model provider:** implement `LogprobProvider` (`shared/llm/types.ts`) or an upstream in `worker/upstream/`,
  and run `src/llm/providerContract.ts` against it.
- **A new sample:** list it in `tools/session-samples.json` and run `pnpm samples:sessions`, then `pnpm audit:samples`.
- **A new command:** add it to `shared/commands.ts` first; the CLI, the skill and the website pick it up from there.

[`EXTENDING.md`](EXTENDING.md) has step-by-step guides for providers, Worker upstreams, recorded gardens, themes
and adapters.

## Tests

- Unit tests sit next to the code (`*.test.ts`, `*.test.tsx`) and run with Vitest (`pnpm test`). CLI tests are in
  `cli/test/`, Worker tests in `worker/test/` (with fakes for KV, AI and the rate limiters), script tests in
  `scripts/*.test.mjs`, skill tests in `skills/reasontrail/audit/`.
- Contract suites: `shared/session/adapterContract.ts` for adapters, `src/llm/providerContract.ts` for providers.
- Fixtures are synthetic: `fixtures/sessions/` and `fixtures/chats/`. The tree layout is also checked against the
  design canvas's reference geometry in `src/map/tree/__fixtures__/`.
- Browser flows: `pnpm check:browser` builds, serves the site and runs headless Chrome with axe (`scripts/browser/`).
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build, `check:size`, `check:docs`, `build:cli`,
  `check:pack`, the deploy dry run and the browser flows.
