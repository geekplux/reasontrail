# Examples: three real sessions

These are the sample maps on the Reasontrail website. Each is a real Claude Code session of the agents that built Reasontrail, trimmed and redacted (see [`tools/session-samples.json`](../tools/session-samples.json)). They are bundled with the site, so they open offline and with no API key.

Each link opens the map with the step worth reading first selected: its path from the root in blue, its row in the list, and its panel beside the list. The links open the live demo at `reasontrail.geekplux.com`. To open the same view locally:

```sh
pnpm install && pnpm dev
# then open http://localhost:5173/ followed by the part of the link after the domain,
# e.g. http://localhost:5173/?session=implementer-checks&step=s52
```

## 1. Lint and typecheck fail, then pass

**Build keyboard navigation and a screen-reader table (phase 5).** An implementer: 142 steps and 51 tool calls, 11 minutes active over about 49 minutes.

![The implementer-checks map with the failed command s52 selected: in the one-lane tree the path from the root to its orange twig on episode 4 is blue, with the callout "Add CSS, run lint and typecheck, Exit code 1, 16 min"; the list has episode 4 open with that step highlighted, and the step panel beside it shows the command, its recorded output with the lint findings, and the source file and line.](img/implementer-checks.webp)

Open it: [implementer-checks map at the first failed run](https://reasontrail.geekplux.com/?session=implementer-checks&step=s52) (`?session=implementer-checks&step=s52`)

What to notice:

- **An error streak.** Two runs that end in checks fail in a row: first lint (oxlint reports `eslint(no-shadow)`), then typecheck (`TS2339` in `src/garden/keyboard.ts`). Both are orange twigs with ✕ in the tree and "1 failed command" under episodes 4 and 5 in the list. The link opens the first one, the last step of episode 4; for the second, open episode 5.
- **One lane, still a tree.** No subagents, so every episode is a branch off the trunk. Reading, editing and checking alternate; the verify episodes (◇) are where the agent ran its checks before moving on.
- **The outcome.** The last check, `pnpm lint`, passed; one trouble spot (the streak); six files changed, one of them new (`scripts/browser/flows/keyboard.mjs`). In its final answer the agent reports three commits and a diff over its line budget.

## 2. A verifier fails, a fix passes

**Verify phase 12, fix the audit gap, re-verify.** The main agent and three subagents: 166 steps and 60 tool calls over about 47 minutes.

![The verify-fail-fix map with the failed command s41 selected: the blue path runs from the root up the first subagent's limb to an orange twig on episode 6, with the callout "Inspect vitest config for log suppression, Exit code 2, 16 min"; the list has episode 6 open with that step highlighted, and the step panel shows the command, "Exit code 2, no output", the next step and the source line.](img/verify-fail-fix.webp)

Open it: [verify-fail-fix map at the first verifier’s failed command](https://reasontrail.geekplux.com/?session=verify-fail-fix&step=s41) (`?session=verify-fail-fix&step=s41`)

What to notice:

- **Three limbs.** The main agent spawns a verifier, an implementer and a second verifier; each grows as a limb with its own episodes, ends in its verdict, and hands back to the trunk (the dotted line) where the main agent resumed. "Main agent waits, 33 min" sits on the trunk while the first one runs.
- **A failure that is not a failed command.** The first verifier's answer is "VERDICT: FAIL": `pnpm audit:samples` could miss a secret inside nested JSON. Its tip in the tree and its verdict row in the list read "Failed: 1 gap". The link opens the one command that failed on the way, a config check that exits 2; it is not the reason for the verdict.
- **A small, checked fix.** The implementer changes one file, `scripts/audit-samples.mjs`, and commits it ("Committed cceb2d5"); the re-verify passes. The outcome box says "Passed on re-verify", "1 failed review, fixed in cceb2d5" and the one changed file.

## 3. A change request rewrites the plan

**Plan the reasoning-map pivot.** The main agent and two planner runs: 113 steps and 37 tool calls over about 17 minutes.

![The planner-pivot map with step s56 selected, a failed command in the second planner run: the blue path runs from the root along the trunk and down that run's limb to episode 7, where the step's ring carries an orange ✕ and its callout, "Inspect a subagent transcript and Grok install" over "Failed, 2 min", sits beside it; the first planner run's limb above ends in an orange "Failed" verdict; the list has episode 7 highlighted with "1 failed command", and the step panel says "Command failed" with the command, its output and the next step.](img/planner-pivot.webp)

Open it: [planner-pivot map at a failed command in the second planner run](https://reasontrail.geekplux.com/?session=planner-pivot&step=s56) (`?session=planner-pivot&step=s56`)

What to notice:

- **A retry.** The first planner run is cut off before it reports back, so its limb ends in an orange verdict. The main agent notices that `docs/PLAN.md` is unchanged and runs the planner again with the addendum folded in: the second limb, and "1 trouble spot, 1 resolved" in the outcome box.
- **Two requests, one trunk.** The change request and its addendum are both main-agent episodes (▶), so you can see where the agent changed course: the second ▶ is where the addendum arrives.
- **Reading before writing.** The second planner reads the plan, the README and more before it edits `docs/PLAN.md`. The outcome lists `docs/PLAN.md` and the new `.claude/agents/lead-designer.md`; nothing was tested, and it says "No check run found" rather than guessing.

## Map your own session

In a project folder where you have used Claude Code, Codex or Grok Build:

```sh
npx reasontrail
```

It maps the newest session for that folder into one HTML file and opens it. **Not on npm yet:** until it is published, run `node cli/dist/cli.mjs` from a clone instead, as in [From a clone](../README.md#from-a-clone). Add `--share` for a copy with secrets, emails and paths replaced by pattern; read it before you send it.

Have a session that would make a good example? Propose it with the session-sample issue template; [Add a sample](../CONTRIBUTING.md#add-a-sample) says how samples are made and checked.
