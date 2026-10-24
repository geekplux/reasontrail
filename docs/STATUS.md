STATE: IN-PROGRESS
Redesign v7 (phases 29–37, spec `docs/design/v7/PROMPT.md`) in progress. Phases 1–28 are merged on `main`.

# Status (Reasontrail)

- Current phase: 29 (`phase-29-v7-tokens-logo`), step: PR
- Plan: `docs/PLAN.md` "Redesign v7" section; spec and reference in `docs/design/v7/`
- Blockers: none for v7. (Live Workers AI still needs a real `CLOUDFLARE_API_TOKEN`; not needed for this run.)

## Redesign v7

| Phase | Branch | PR | State | Review rounds |
|---|---|---|---|---|
| 29 | `phase-29-v7-tokens-logo` | (pending) | 2 rounds done, PR | 2 |
| 30 | `phase-30-v7-gitlist` | – | pending | – |
| 31 | `phase-31-v7-tree-engine` | – | pending | – |
| 32 | `phase-32-v7-tree-render` | – | pending | – |
| 33 | `phase-33-v7-site-layout` | – | pending | – |
| 34 | `phase-34-v7-phone-dark` | – | pending | – |
| 35 | `phase-35-v7-viewer-features` | – | pending | – |
| 36 | `phase-36-v7-polish-docs` | – | pending | – |
| 37 | `phase-37-v7-deploy-prep` | – | pending | – |

Last updated: 2026-10-23 (phase 29 reviewed, PR opening)

## History: phases 1–28 (merged)

| Phase | Branch | PR | State | Verify rounds |
|---|---|---|---|---|
| 1 | `phase-1-toolchain` | [#1](https://github.com/geekplux/reasontrail/pull/1) | merged | 1 |
| 2 | `phase-2-identity` | [#2](https://github.com/geekplux/reasontrail/pull/2) | merged | 1 |
| 3 | `phase-3-garden-encoding` | [#4](https://github.com/geekplux/reasontrail/pull/4) | merged | 1 |
| 4 | `phase-4-explore-share` | [#5](https://github.com/geekplux/reasontrail/pull/5) | merged | 1 |
| 5 | `phase-5-keyboard-a11y` | [#6](https://github.com/geekplux/reasontrail/pull/6) | merged | 1 |
| 6 | `phase-6-recorded-samples` | [#7](https://github.com/geekplux/reasontrail/pull/7) | merged | 1 |
| 7 | `phase-7-temperature-sampling` | [#8](https://github.com/geekplux/reasontrail/pull/8) | merged | 1 |
| 8 | `phase-8-worker-core` | [#9](https://github.com/geekplux/reasontrail/pull/9) | merged | 1 |
| 9 | `phase-9-worker-limits` | [#10](https://github.com/geekplux/reasontrail/pull/10) | merged | 1 |
| 10 | `phase-10-design` | [#11](https://github.com/geekplux/reasontrail/pull/11) | merged | 1 |
| 11 | `phase-11-session-model` | [#12](https://github.com/geekplux/reasontrail/pull/12) | merged | 1 |
| 12 | `phase-12-structure-redact` | [#13](https://github.com/geekplux/reasontrail/pull/13) | merged | 2 |
| 13 | `phase-13-cli-viewer` | [#14](https://github.com/geekplux/reasontrail/pull/14) | merged | 1 |
| 14 | `phase-14-skill` | [#15](https://github.com/geekplux/reasontrail/pull/15) | merged | 1 |
| 15 | `phase-15-samples` | [#16](https://github.com/geekplux/reasontrail/pull/16) | merged | 2 |
| 16 | `phase-16-map-glance` | [#17](https://github.com/geekplux/reasontrail/pull/17) | merged | 2 |
| 17 | `phase-17-map-details` | [#18](https://github.com/geekplux/reasontrail/pull/18) | merged | 2 |
| 18 | `phase-18-codex-grok` | [#19](https://github.com/geekplux/reasontrail/pull/19) | merged | 1 |
| 19 | `phase-19-site-showcase` | [#20](https://github.com/geekplux/reasontrail/pull/20) | merged | 1 |
| 20 | `phase-20-ai-structure-worker` | [#21](https://github.com/geekplux/reasontrail/pull/21) | merged | 1 |
| 21 | `phase-21-ai-labels-ui` | [#22](https://github.com/geekplux/reasontrail/pull/22) | merged | 1 |
| 22 | `phase-22-zoom-lens` | [#23](https://github.com/geekplux/reasontrail/pull/23) | merged | 2 |
| 23 | `phase-23-chat-import` | [#24](https://github.com/geekplux/reasontrail/pull/24) | merged | 2 |
| 24 | `phase-24-share-cards` | [#25](https://github.com/geekplux/reasontrail/pull/25) | merged | 2 |
| 25 | `phase-25-polish` | [#26](https://github.com/geekplux/reasontrail/pull/26) | merged | 2 |
| 26 | `phase-26-readme-community` | [#27](https://github.com/geekplux/reasontrail/pull/27) | merged | 2 |
| 27 | `phase-27-gallery-launch` | [#28](https://github.com/geekplux/reasontrail/pull/28) | merged | 2 |
| 28 | `phase-28-deploy-prep` | [#29](https://github.com/geekplux/reasontrail/pull/29) | merged | 1 |

## Follow-ups

- Move `ci/github-workflow.yml` to `.github/workflows/` (needs `workflow` token scope).
- Provide a valid Cloudflare API token (for live-mode checks and deploy).
- npm publish of the CLI waits for Sean's approval, like deploy (D36).
- Grok Build: supported (all 58 local sessions parse with 0 skipped lines). `--current` via `GROK_SESSION_ID` is unverified: Grok documents it for hook processes only; without it the CLI falls back to the newest session for the folder and says so (open item, not a blocker).
- Codex: adapter built from the public source and a synthetic fixture; Codex is not installed on this box, so it is not verified against a real session (open item). Skill installs to `~/.agents/skills/reasontrail/`; `--current` uses `CODEX_THREAD_ID`.
- Polish backlog for phase 25: `--list` mixes two time formats; Grok fixture delegate episode shows 2 steps in Outline vs 8 on the Map; Map/Outline toggle looks clipped at 390 px; AI wording with one request/link ("1 request, one after another", "1 claim links"); AI tags crowd at 12 episodes; flaky `src/App.test.tsx` copy-link test under load; lens footer still says nothing leaves the browser after live opt-in; initial JS at 150 KB (lazy-load lens chips if the first view grows); chat maps say "the agent's own account" and label a user correction "Interrupted:" (chat-specific wording).
- Go-public checklist (Sean): enable private vulnerability reporting (SECURITY.md / issue config link); upload the social preview image in repo settings (phase 27); review CLAUDE.md and docs/ for internal notes before making the repo public; demo links now point at `https://reasontrail.geekplux.com` (custom domain declared in `wrangler.jsonc`).

