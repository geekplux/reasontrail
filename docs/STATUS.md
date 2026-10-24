STATE: IN-PROGRESS
Redesign v7, canvas-first restart (docs/design/v7/PROMPT.md §13). Phases 1–28 are merged; PR #31 (first v7 attempt) is closed and discarded.

# Status (Reasontrail)

## Redesign v7 (phases 29–36)

- Current phase: 32a `phase-32a-v7-tree-render`, step: implement
- Canvas frames: `docs/design/v7/frames/` (rendered with `scripts/design/canvas.mjs frames`)

| Phase | Branch | PR | State | Review rounds | lead-designer |
|---|---|---|---|---|---|
| 29 | `phase-29-v7-canvas-page` | [#32](https://github.com/geekplux/reasontrail/pull/32) | done, PR open | 2 | MATCH (R1, R2) |
| 29b | `phase-29b-v7-brand-cleanup` | [#33](https://github.com/geekplux/reasontrail/pull/33) | done, PR open | 2 | MATCH (R1, R2) |
| 30 | `phase-30-v7-gitlist` | [#35](https://github.com/geekplux/reasontrail/pull/35) | done, PR open | 2 | REJECT (R1, one sub-line gap), MATCH (R2) |
| 31 | `phase-31-v7-tree-engine` | [#36](https://github.com/geekplux/reasontrail/pull/36) | done, PR open | 2 | REJECT (R1), MATCH (R2); dataviz approved after fix 2 |
| 32a | `phase-32a-v7-tree-render` | – | implementing | 0 | – |
| 32b | `phase-32b-v7-step-detail` | – | pending | – | – |
| 33 | `phase-33-v7-phone-dark` | – | pending | – | – |
| 34 | `phase-34-v7-viewer-features` | – | pending | – | – |
| 35 | `phase-35-v7-polish-docs` | – | pending | – | – |
| 36 | `phase-36-v7-deploy-prep` | – | pending | – | – |

Last updated: 2026-10-24 (phase 31 reviewed: lead-designer MATCH, dataviz one API fix (done), verifier PASS)

Carry-overs to 29b: "·" in `src/intake/DropZone.tsx:183` and the viewer AI label (`src/ai/AiControl.tsx:50`); brand link line-height 20 vs 21px (0.5px); `file` browser flow needs a `--file` guard. Suspended browser flows (map, details, site, lens, ai, share) return in phases 30/32/34.

Budget watch: initial JS 169.2/170 KB gzip after phase 30; phase 32 must drop the static tree port (`TREE_SVG`) when the renderer lands.

Follow-up: move `ci/github-workflow.yml` to `.github/workflows/` (needs workflow scope).

## History: phases 1–28

# Status (Reasontrail, formerly token-garden)

- Current phase: none — finished; final phase 28 (`phase-28-deploy-prep`, PR #29) stops for Sean's approval
- Plan: `docs/PLAN.md` (28 phases after the 2026-10-20 pivot and the 2026-10-21 polish phase; final = Cloudflare deploy prep, stops for Sean's approval)
- Blockers:
  - Live Workers AI not verifiable on this box: `CLOUDFLARE_API_TOKEN` is a placeholder, not a real token. Needed only for live calls, re-recording samples via Workers AI, and the real deploy. Recorded samples, tests and the deploy dry run work without it.

| Phase | Branch | PR | State | Verify rounds |
|---|---|---|---|---|
| 1 | `phase-1-toolchain` | [#1](https://github.com/geekplux/reasontrail/pull/1) | PASS, PR open | 1 |
| 2 | `phase-2-identity` | [#2](https://github.com/geekplux/reasontrail/pull/2) | PASS, PR open | 1 |
| 3 | `phase-3-garden-encoding` | [#4](https://github.com/geekplux/reasontrail/pull/4) | PASS, PR open | 1 |
| 4 | `phase-4-explore-share` | [#5](https://github.com/geekplux/reasontrail/pull/5) | PASS, PR open | 1 |
| 5 | `phase-5-keyboard-a11y` | [#6](https://github.com/geekplux/reasontrail/pull/6) | PASS, PR open | 1 |
| 6 | `phase-6-recorded-samples` | [#7](https://github.com/geekplux/reasontrail/pull/7) | PASS, PR open | 1 |
| 7 | `phase-7-temperature-sampling` | [#8](https://github.com/geekplux/reasontrail/pull/8) | PASS, PR open | 1 |
| 8 | `phase-8-worker-core` | [#9](https://github.com/geekplux/reasontrail/pull/9) | PASS, PR open | 1 |
| 9 | `phase-9-worker-limits` | [#10](https://github.com/geekplux/reasontrail/pull/10) | PASS, PR open | 1 |
| 10 | `phase-10-design` | [#11](https://github.com/geekplux/reasontrail/pull/11) | PASS, PR open | 1 |
| 11 | `phase-11-session-model` | [#12](https://github.com/geekplux/reasontrail/pull/12) | PASS, PR open | 1 |
| 12 | `phase-12-structure-redact` | [#13](https://github.com/geekplux/reasontrail/pull/13) | PASS, PR open | 2 |
| 13 | `phase-13-cli-viewer` | [#14](https://github.com/geekplux/reasontrail/pull/14) | PASS, PR open | 1 |
| 14 | `phase-14-skill` | [#15](https://github.com/geekplux/reasontrail/pull/15) | PASS, PR open | 1 |
| 15 | `phase-15-samples` | [#16](https://github.com/geekplux/reasontrail/pull/16) | PASS, PR open | 2 |
| 16 | `phase-16-map-glance` | [#17](https://github.com/geekplux/reasontrail/pull/17) | PASS, PR open | 2 |
| 17 | `phase-17-map-details` | [#18](https://github.com/geekplux/reasontrail/pull/18) | PASS, PR open | 2 |
| 18 | `phase-18-codex-grok` | [#19](https://github.com/geekplux/reasontrail/pull/19) | PASS, PR open | 1 |
| 19 | `phase-19-site-showcase` | [#20](https://github.com/geekplux/reasontrail/pull/20) | PASS, PR open | 1 |
| 20 | `phase-20-ai-structure-worker` | [#21](https://github.com/geekplux/reasontrail/pull/21) | PASS, PR open | 1 |
| 21 | `phase-21-ai-labels-ui` | [#22](https://github.com/geekplux/reasontrail/pull/22) | PASS, PR open | 1 |
| 22 | `phase-22-zoom-lens` | [#23](https://github.com/geekplux/reasontrail/pull/23) | PASS, PR open | 2 |
| 23 | `phase-23-chat-import` | [#24](https://github.com/geekplux/reasontrail/pull/24) | PASS, PR open | 2 |
| 24 | `phase-24-share-cards` | [#25](https://github.com/geekplux/reasontrail/pull/25) | PASS, PR open | 2 |
| 25 | `phase-25-polish` | [#26](https://github.com/geekplux/reasontrail/pull/26) | PASS, PR open | 2 |
| 26 | `phase-26-readme-community` | [#27](https://github.com/geekplux/reasontrail/pull/27) | PASS, PR open | 2 |
| 27 | `phase-27-gallery-launch` | [#28](https://github.com/geekplux/reasontrail/pull/28) | PASS, PR open | 2 |
| 28 | `phase-28-deploy-prep` | [#29](https://github.com/geekplux/reasontrail/pull/29) | PASS, PR open | 1 |

## Follow-ups

- Move `ci/github-workflow.yml` to `.github/workflows/` (needs `workflow` token scope).
- Provide a valid Cloudflare API token (for live-mode checks and deploy).
- npm publish of the CLI waits for Sean's approval, like deploy (D36).
- Grok Build: supported (all 58 local sessions parse with 0 skipped lines). `--current` via `GROK_SESSION_ID` is unverified: Grok documents it for hook processes only; without it the CLI falls back to the newest session for the folder and says so (open item, not a blocker).
- Codex: adapter built from the public source and a synthetic fixture; Codex is not installed on this box, so it is not verified against a real session (open item). Skill installs to `~/.agents/skills/reasontrail/`; `--current` uses `CODEX_THREAD_ID`.
- Polish backlog for phase 25: `--list` mixes two time formats; Grok fixture delegate episode shows 2 steps in Outline vs 8 on the Map; Map/Outline toggle looks clipped at 390 px; AI wording with one request/link ("1 request, one after another", "1 claim links"); AI tags crowd at 12 episodes; flaky `src/App.test.tsx` copy-link test under load; lens footer still says nothing leaves the browser after live opt-in; initial JS at 150 KB (lazy-load lens chips if the first view grows); chat maps say "the agent's own account" and label a user correction "Interrupted:" (chat-specific wording).
- Go-public checklist (Sean): enable private vulnerability reporting (SECURITY.md / issue config link); upload the social preview image in repo settings (phase 27); review CLAUDE.md and docs/ for internal notes before making the repo public; demo links now point at `https://reasontrail.geekplux.com` (custom domain declared in `wrangler.jsonc`).

Last updated: 2026-10-22 12:48 UTC (STATE: DONE, awaiting approval to deploy)
