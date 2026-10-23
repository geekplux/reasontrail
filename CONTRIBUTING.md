# Contributing to Reasontrail

Thanks for helping. Reasontrail is small on purpose: a few runtime dependencies, deterministic code first, and AI only where you ask for it. This page gets you from a clone to a pull request.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go through [`SECURITY.md`](SECURITY.md), not public issues.

## Setup

You need Node 22 or newer and pnpm 9 (`.nvmrc`; wrangler needs Node 22). The published CLI itself runs on Node 20.19+.

```sh
git clone https://github.com/geekplux/reasontrail && cd reasontrail
pnpm install
pnpm dev              # the website on a local dev server
pnpm build:cli        # the local viewer and the CLI, into cli/dist/
node cli/dist/cli.mjs --help
```

## Checks

Run these before you open a pull request. CI runs the same ones (its definition is in `ci/github-workflow.yml`).

| Command | What it checks |
| --- | --- |
| `pnpm lint` | oxlint, warnings fail |
| `pnpm typecheck` | `tsc --noEmit` for the app, the Worker, the session model and the CLI |
| `pnpm test` | Vitest, one run |
| `pnpm build` | the website build into `dist/` |
| `pnpm check:size` | size budgets on `dist/` and the runtime dependency allowlist |
| `pnpm check:docs` | every relative link and image in the docs resolves, every image has descriptive alt text, and the README's commands match `shared/commands.ts` |
| `pnpm check:browser` | builds, starts a preview server and runs the browser flows in headless Chrome with axe; screenshots go to `.tmp/screenshots/` |
| `pnpm audit:samples` | no secret, email, home path or denylisted term in committed samples and fixtures |
| `pnpm skill:audit`, `pnpm skill:evals` | the skill's structure, and its offline sandbox cases |
| `pnpm run check:deploy` | a Worker dry run; deploys nothing |

`pnpm check:browser` uses the system Chrome (`/usr/bin/google-chrome`, or set `CHROME_PATH`) and port 4317 (or set `TG_PORT`). `--flows a,b` runs only some flows. It always closes the browser and stops the server.

The README's images come from the app: `pnpm check:browser --flows hero` rewrites `docs/brand/hero.webp` and the wordmarks, and `node scripts/browser/readme-shot.mjs` renders the README with GitHub's Markdown API (needs `gh`) and checks that the first screen shows the pitch, the hero and the quick start.

## Where things live

| Path | What |
| --- | --- |
| `shared/session/` | adapters, the step graph, redaction (pure TypeScript, no Node or DOM) |
| `shared/commands.ts` | the commands people type, shared by the CLI, the skill installer, the website and the README |
| `cli/` | the `reasontrail` CLI and the session locators |
| `src/` | the website and the local viewer (React); `src/map/` is the map, `src/lens/` and `src/garden/` the lens |
| `worker/` | the Cloudflare Worker: `/api/structure` and `/api/next-tokens` |
| `skills/reasontrail/` | the skill: `SKILL.md`, kit, references, audit and evals |
| `fixtures/` | hand-written synthetic sessions and chats for tests |

## Add an adapter for another agent

Follow [`docs/EXTENDING.md`](docs/EXTENDING.md) section 5. In short: add the source name, write a pure adapter in `shared/session/adapters/`, register it, add a hand-written fixture under `fixtures/sessions/<name>/`, prove it with `checkAdapterContract`, and teach the CLI where the sessions live (`cli/src/locate/`). Never commit a real session as a fixture.

## Add a sample

- **A sample map** (the website's gallery): add an entry to `tools/session-samples.json` (the session file, a `--trim` range, any steps to hide) and run `pnpm samples:sessions`. Samples are redacted by the CLI, scrubbed again with your local `.redact-denylist`, and must pass `pnpm audit:samples`. Only propose sessions you own and are happy to publish; the session-sample issue template asks the right questions.
- **A lens garden:** see [`docs/EXTENDING.md`](docs/EXTENDING.md) section 3 (`pnpm samples:record`). Keep prompts neutral and everyday.

## Pull requests

- Keep each pull request to one change you can review in about 20 minutes.
- Add or update tests next to the code. Keep logic in pure, tested modules and components thin.
- Add a line to `CHANGELOG.md` under "Unreleased".
- For UI changes, attach a screenshot and check accessibility: everything works with the keyboard alone and focus is always visible; controls and readouts have screen-reader names (check with VoiceOver, NVDA or Orca); colour is never the only signal and categories stay distinct under Chrome DevTools > Rendering > "Emulate vision deficiencies" (protanopia, deuteranopia, tritanopia); text contrast is at least 4.5:1 and graphics at least 3:1; and motion stops under "Emulate CSS prefers-reduced-motion: reduce". `pnpm check:browser` runs axe and must report no violations.
- No secrets in commits: local keys go in `.dev.vars` (gitignored).
- Looking for a first task? See [`docs/GOOD-FIRST-ISSUES.md`](docs/GOOD-FIRST-ISSUES.md).

By contributing you agree that your work is licensed under the [MIT License](LICENSE).
