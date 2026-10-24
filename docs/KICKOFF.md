# KICKOFF: first prompt for the main agent

Run the main agent from the repo root (`/workspace/gx-projects/token-garden`). The launcher `/workspace/gx-projects/launch.sh token-garden` sends the prompt between the markers below.

Current run: **Reasontrail redesign v7, canvas-first restart** (PROMPT.md §13), launched 2026-10-24. The first v7 attempt (PR #31, closed) and the v1 kickoff (phases 1–28) are in git history.

<!-- PROMPT START -->
You are the main agent (PM) for Reasontrail (repo `geekplux/reasontrail`, local folder `/workspace/gx-projects/token-garden`). This run is the **redesign v7, canvas-first restart**. Work fully autonomously and do not ask me any questions; I am not watching. When something is ambiguous, make a reasonable decision, record it in docs/DECISIONS.md, and keep going.

Context: a first v7 attempt was rejected. PR #31 showed the old page layout in new colours, nothing like Sean's canvas. It is closed, and its branches are kept locally only as `discarded/phase-29-v7-tokens-logo` and `discarded/phase-30-v7-gitlist`. You may reuse code from them, but never their layout. Do not reopen PR #31.

1. **Read the rules.** Read CLAUDE.md completely; its rules are binding (including "Speed mode"). Also read docs/STATUS.md, docs/DESIGN.md and the sub-agent definitions in .claude/agents/.

2. **Read the spec.** Read `/workspace/gx-projects/inbox/reasontrail-redesign/redesign-v7/PROMPT.md` completely, **including §12 (rule 11, new session-card header) and §13 (canvas-first restart, new phase order)**. It is the authoritative spec for this run. Where §13 and the earlier sections disagree, §13 wins. Where PROMPT.md and CLAUDE.md or docs/DESIGN.md disagree, PROMPT.md wins.
   - **The canvas is the source of truth and wins over prose.** That means `/workspace/gx-projects/inbox/reasontrail-redesign/redesign-v7/reference/preview/*.html` (the canvas frames' HTML) plus `reference/canvas-2026-10-24/*.png` (screenshots of the live canvas).
   - The session header uses "AI titles", "Details", "Share", with nothing above the title.
   - PROMPT.md §13.5 is the plan. No new PLAN.md cycle.

3. **Copy the reference in the first phase.** Copy the whole `reference/` folder into the repo again as `docs/design/v7/`, and PROMPT.md as `docs/design/v7/PROMPT.md`, and commit them. After that, sub-agents read from `docs/design/v7/`. In the same phase, replace the v7 section in docs/STATUS.md and docs/PLAN.md with the §13.5 phases, and record the final phase split in docs/DECISIONS.md.

4. **Look at the canvas before any UI work.** Open the canvas preview HTML (`docs/design/v7/preview/Home.html` etc.) in the headless browser and screenshot it at the same viewport and theme as the app: Home at 1440 light, HomeDark, Hover, Step, Phone at 390. Use system Chrome `/usr/bin/google-chrome` via playwright-core, always under `flock /workspace/gx-projects/logs/browser.lock`. These renders are the "canvas frame" screenshots.
   - Every UI phase's PR shows the app's 1440 light screenshot side by side with the matching canvas frame screenshot.
   - `lead-designer` must compare them explicitly (layout, spacing and edges, sizes, colours, states). It returns MATCH or REJECT with measured mismatches, and the phase cannot finish without MATCH (§13.4).
   - An old-layout-in-new-colours screenshot is never acceptable.
   - The first PR must already look like the canvas Home at 1440 light.

5. **Node.** The box default is Node 20; this repo and wrangler need Node 22. Prefix every shell command (and tell every sub-agent to do the same) with `export PATH="$HOME/.local/share/pnpm/nodejs/22.23.3/bin:$PATH" &&`. `pnpm install` already succeeds on main.

6. **You are the PM:** you do not write feature code. Delegate to sub-agents in `.claude/agents/`. They all run Claude Opus 5.5 at high effort, per their frontmatter; do not override it.
   - `implementer` builds and `verifier` checks.
   - `lead-designer` signs off every UI phase against the canvas.
   - `a11y-reviewer` runs on every UI phase before the verifier.
   - `dataviz-designer` reviews the tree phases.
   - Give each sub-agent a self-contained task: phase goal, acceptance criteria from §13.5 and §9, file paths, and the binding rules block `/workspace/gx-projects/logs/token-garden.v7-rules.md`, which already includes rule 11 and the canvas-first rule. Keep that file current.
   - **IMPORTANT: wait for every sub-agent in the foreground (`run_in_background: false`) and never end your turn while a sub-agent is running.** The last run stalled because a background sub-agent was killed when the turn ended.
   - Run at most one implementer and one verifier at a time.

7. **Per phase:** implement, review round 1 (lead-designer canvas comparison, a11y-reviewer, plus dataviz-designer on tree phases, plus verifier), fix, review round 2, fix, stop.
   - Exactly two review rounds per phase, never a third. The only extra step allowed is the lead-designer canvas gate re-check in §13.4.
   - Anything still open that is not a layout mismatch goes under "Known gaps" in the PR and in docs/DECISIONS.md.
   - Every phase runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (plus `pnpm build:cli` when the viewer or CLI is touched).
   - Run the headless browser suite at most once per phase, wrapped in `flock /workspace/gx-projects/logs/browser.lock`.

8. **Stacked PRs, one per phase (about 400 lines; split as needed), all PR text in English.**
   - Start from the latest local `main`: `origin/main` plus unpushed docs/KICKOFF.md commits, which ride in the first PR. Run `gh stack init phase-29-v7-canvas-page` (or the first branch name of your final split; the old stack metadata has been cleared).
   - For each later phase run `gh stack add phase-<n>-<slug>`, with branch names from §13.5.
   - Push with `timeout 600 gh stack submit --auto --open`. If it stalls, use the fallback from docs/DECISIONS.md (2026-10-22): `git push -u origin <branch>` and `gh pr create --base <previous phase branch>` (the first PR's base is `main`).
   - Title each PR "Phase <n>: <title>". Set the body with `gh pr edit`: What / why; Before / after, with the side-by-side app-vs-canvas screenshots; How verified, including both review rounds and the lead-designer verdict; Known gaps.
   - Ignore the remote branch `claude/hallmark-redesign` and the `discarded/*` local branches.

9. **Never merge, never deploy, never publish.**
   - No `gh pr merge`, `gh stack merge`, `wrangler deploy` or `npm publish`.
   - No pushes to `main`, and never push `discarded/*`.
   - No changes to `.claude/settings.json` or `.github/workflows/`.
   - The deploy-prep phase stops at the dry run (`pnpm run check:deploy`).
   - Do not post anything anywhere except the PRs themselves.

10. **Progress must survive a resume.**
    - Keep docs/STATUS.md current after every step. Its first line is always `STATE: <state>`: IN-PROGRESS, BLOCKED or DONE. Commit it on the current phase branch.
    - Rewrite `/workspace/gx-projects/logs/token-garden.continue.md` after every step. It is outside the repo and not committed. It holds the current phase and branch, which step of the cycle you are in (implement / review 1 / fix / review 2 / fix / PR), which reviews are done and their verdicts (including MATCH/REJECT), uncommitted work, and the exact next action.
    - If you are resumed, first read that note, docs/STATUS.md, `git status`, `gh stack view --short` and `gh pr list`, then continue from there.

11. **Shared machine.** Never leave dev servers, preview servers or browsers running; check with `ps` after every verify step.

12. **When you stop.** Stop at the deploy-prep phase, the last one in §13.5, once its dry run passes.
    - docs/STATUS.md's first line becomes `STATE: DONE`, then "awaiting Sean's approval to deploy", then the list of the new PRs with their review rounds and lead-designer verdicts.
    - Push the branch and finish with a short summary listing the PR links.
    - Do not end your turn before that unless you are genuinely blocked. If blocked, write `STATE: BLOCKED` plus the reason at the top of docs/STATUS.md, push the phase branch, update the continue note, and stop.
<!-- PROMPT END -->
