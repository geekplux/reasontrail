**Nothing in this file has been posted anywhere. Posting is Sean's decision.**

# Launch kit

Drafts and scripts for sharing Reasontrail. Every link uses the demo origin `https://reasontrail.geekplux.com`.

## What the images show

- **Hero still** (`docs/brand/hero.webp`, the README hero, made by `pnpm check:browser --flows hero`): the website's first screen at 1440×900, the tree of a real session (a verifier fails, an implementer fixes, a second verifier passes) under the headline.
- **Hero GIF** (`docs/brand/hero.gif`, made by `pnpm brand:hero-gif`): the same screen; the pointer moves to the failed command's orange twig (its path stays dark, a tooltip names the episode), clicks it (the path from the root turns blue, the callout says "Exit code 2, 16 min"), and Esc returns to the tree. The skill itself runs in the agent's terminal, which a browser cannot record, so the GIF shows the map only.
- **Social preview** (`docs/brand/social-preview.png`, 1280×640, from `docs/brand/social-preview.html`): the wordmark, the headline and the same tree.
- **Examples** (`examples/img/*.webp`): one map per sample, with the step worth reading first selected: its blue path in the tree, its row in the list and its panel.

## Show HN draft

**Title** (68 characters): Show HN: Reasontrail – see how your coding agent got there, as a map

**Body:**

> When a coding agent works for 40 minutes, the transcript is thousands of lines: reads, edits, test runs, subagents. I wanted the one-page version: what was asked, how it went about it, where it got stuck, and what it changed.
>
> Reasontrail reads a Claude Code, Codex or Grok Build session from your disk and writes one self-contained HTML file. The session is drawn as a tree grown left to right: the main agent is the trunk, subagents are limbs that end in their verdict, episodes are branches and every tool call is a twig, orange with an x where it failed. Under it, a git-style list of the same session, and an outcome box: the last check, the trouble found (error streaks, retries, reverts, failed reviews) and the files changed. Click any twig to see the actual command, its output and the file and line it came from.
>
> It is local: no account, no API key, nothing uploaded. The structure comes from fixed rules, not a model, so the same session always gives the same map. Optional AI titles are opt-in and show what would be sent first. `--share` writes a redacted copy.
>
> The website shows maps of the agents that built it, and works offline: https://reasontrail.geekplux.com
>
> There is a skill too, so you can ask your agent to "map this session". Code (MIT): https://github.com/geekplux/reasontrail

**First comment (how it works):**

> How it works: an adapter per agent turns its transcript records into one neutral step format; a step graph groups the steps into episodes (exploring, changing files, verifying, delegating) and runs detection rules over them, and every step keeps a pointer to its source line. The viewer is a React app inlined into one HTML file, so a map opens from file:// with no requests.
>
> Two honesty notes: written reasoning is the model's own account, not a record of how it computed, and a thinking step's panel says so. Trouble is found by fixed rules ("detected patterns"), not judged by a model.
>
> There is also a next-token lens: see an open model's next-token choices for a sentence as a tree of branches whose thickness is probability. Recorded sentences work offline; others grow through a Worker only when you ask.
>
> Codex support is built from the public session format and not yet checked against a real Codex session. Reports welcome.

## X post draft

**Post** (≤ 280 characters), attach `docs/brand/hero.gif`:

> What did your coding agent actually do for 40 minutes?
>
> Reasontrail draws a Claude Code, Codex or Grok Build session as a tree: subagents are limbs, episodes are branches, tool calls are twigs. Where it got stuck, what it changed. Local, no API key, nothing uploaded.
>
> https://reasontrail.geekplux.com

**Thread:**

1. Attach `examples/img/implementer-checks.webp`. "Every failed call is an orange twig, and a click shows its evidence. This implementer failed lint, then typecheck, in a row: https://reasontrail.geekplux.com/?session=implementer-checks&step=s52"
2. Attach `examples/img/verify-fail-fix.webp`. "Subagents are limbs. Here a verifier fails the phase, an implementer fixes one file and commits, a second verifier passes: https://reasontrail.geekplux.com/?session=verify-fail-fix&step=s41"
3. Attach `examples/img/planner-pivot.webp`. "One self-contained HTML file, built by fixed rules (no model), with a redacted --share copy. A skill lets you ask your agent to map its own session. MIT: https://github.com/geekplux/reasontrail"

## Three demo scenarios

### 1. "What did my agent do for 40 minutes?"

1. Open https://reasontrail.geekplux.com/?session=implementer-checks (or the tab "Lint and typecheck fail, then pass").
2. Read the meta line: 49 min total, 51 tool calls. One lane, so every episode is a branch off the trunk.
3. Read the outcome box: "Passed", `pnpm lint` passed; one trouble spot; six files changed.
4. Point at the orange twigs on episodes 4 and 5: lint failed, then typecheck. Click the first: the path turns blue and the panel shows the command and its output. Press Esc to go back.
5. Keyboard: Tab into the list, ↓ to episode 4, → to open it, ↓ to the failed step, Enter for its panel.
6. Then the same for a real session, in any project folder: `npx reasontrail` (until it is on npm, `node cli/dist/cli.mjs` from a clone, see the README).

### 2. "Review an agent-written PR"

1. In the PR's repository, run `npx reasontrail --list` and pick the session that wrote the branch, then `npx reasontrail <path or id>`.
2. Compare the outcome box's changed files with the PR's diff, and read the last check: was it a test run, and did it pass?
3. Look for orange in the tree: failed calls, and limbs that end in a failed verdict. A retry or revert next to a file in the PR is where to look first.
4. On the demo site, show the same review on https://reasontrail.geekplux.com/?session=verify-fail-fix&step=s41: the first verifier's limb ends in "Failed: 1 gap", the implementer's in "Committed cceb2d5" (one file, `scripts/audit-samples.mjs`), and the re-verify passes.
5. To share the map with the reviewer, run `npx reasontrail --share`: it writes a redacted copy in the current folder and says how many secrets, emails and paths it replaced.

### 3. "Watch the agents that built this app"

1. Open https://reasontrail.geekplux.com. The first tree is a real session from building Reasontrail itself; the tabs under it hold the other two.
2. Pick "A change request rewrites the plan" (https://reasontrail.geekplux.com/?session=planner-pivot&step=s17): the first planner run was cut off (its limb ends orange), the main agent retried it, and the second run rewrote `docs/PLAN.md`.
3. Pick "A verifier fails, a fix passes": three subagents as limbs, ending in failed, committed and passed.
4. Open the next-token garden from the footer to see an open model's next-token branches for a sentence. Recorded sentences work offline.
5. Close with the PR history on GitHub: each phase of the app was built and verified by agents, and these maps are their sessions.

## Comparison with alternatives

Researched on **2026-10-22** from each project's README or documentation (linked). Features change; check the links before quoting this.

| Tool | What it is | Where it is strong | How Reasontrail differs |
|---|---|---|---|
| [claude-code-transcripts](https://github.com/simonw/claude-code-transcripts) (Simon Willison, Apache-2.0) | A Python CLI that converts Claude Code session files into paginated, mobile-friendly HTML, with an index timeline of prompts and commits | The complete transcript, readable on a phone; `--gist` publishes it with a preview link; a whole-archive mode | Reasontrail summarises instead of paginating: the session as one tree with a list and an outcome on one page, with the full steps one Enter away. It also reads Codex and Grok Build sessions |
| [claude-code-log](https://github.com/daaain/claude-code-log) (daaain, MIT) | A Python CLI and TUI that converts Claude Code transcripts into HTML and Markdown, with archive search, token usage and a timeline | Browsing and searching every project and session; watch and serve modes for live sessions; folding of sub-agents and rewind forks; experimental Codex (beta) export | Reasontrail is built for one session at a glance rather than the archive, and finds trouble patterns by rule. claude-code-log is better for search across history and for live sessions |
| [Langfuse](https://langfuse.com/integrations/developer-tools/claude-code) ([repo](https://github.com/langfuse/langfuse), MIT core) | An open-source LLM and agent observability platform; its Claude Code integration uses hooks to send prompts, responses and tool calls to a Langfuse project | Team-wide tracing over time, evaluations and dashboards; can be self-hosted | Reasontrail needs no server, account or keys, and works after the fact on files already on disk. Langfuse is the better choice for continuous, shared monitoring |
| [LangSmith](https://docs.langchain.com/langsmith/trace-claude-code) (LangChain) | A hosted tracing and evaluation platform; a Claude Code plugin traces user messages, tool calls, compaction, subagent runs and responses | Hosted traces across many sessions and people, with the rest of the LangSmith tooling | Needs a LangSmith API key and sends traces to the service. Reasontrail stays on your machine |
| [Arize Phoenix](https://arize.com/docs/phoenix/integrations/coding-agents/claude-code) ([repo](https://github.com/Arize-ai/phoenix), Elastic License 2.0) | A self-hostable, source-available AI observability platform; the [coding-harness-tracing](https://github.com/Arize-ai/coding-harness-tracing) plugin (Apache-2.0) traces Claude Code, Cursor and Codex turns as OpenInference spans | Model calls, tool calls and token cost per turn, grouped by session, in a standard tracing format | Phoenix records sessions as they run once set up; Reasontrail reads sessions afterwards with no setup and adds the tree, list and outcome view |
| [logitloom](https://github.com/vgel/logitloom) (vgel) | A tool for exploring token trajectory trees on instruct and base models; [hosted version](https://vgel.me/logitloom) | Any model behind an API with logprobs; base models and assistant prefill; keys stay in the browser | For the lens only: Reasontrail's garden opens offline from recorded sentences with no key and grows one click at a time. logitloom is the power tool for big trees and arbitrary models |
| [Transformer Explainer](https://github.com/poloclub/transformer-explainer) (Polo Club, Georgia Tech, MIT) | An interactive visualisation that runs a live GPT-2 model in the browser to show how a transformer predicts the next token | Teaching the model's internals, with a [live demo](https://poloclub.github.io/transformer-explainer/) and a CHI 2026 paper | The lens shows choices over several steps for an agent's own sentence, not the architecture. Transformer Explainer is better for learning how the model works inside |
| [loom](https://github.com/socketteer/loom) (socketteer) | An experimental tree-based writing interface for GPT-3, with read mode, a tree view, hotkeys and bookmarks | Writing and steering long branching text with a model | The lens is for reading probabilities, not for writing. loom is better for collaborative writing |

## Pre-launch checklist

- [ ] **Deploy approval:** Sean approves and runs the deploy ([DEPLOY.md](DEPLOY.md)). Nothing is deployed before that.
- [ ] **npm publish approval (D36):** Sean approves the package name and runs `npm publish` ([PUBLISH.md](PUBLISH.md)). Until then the README's "Not on npm yet" note and the from-a-clone commands stay.
- [x] **Demo URL** set to `https://reasontrail.geekplux.com` everywhere (was the `reasontrail.example` placeholder, PLAN D20).
- [ ] **Upload the social preview:** GitHub repository Settings → General → Social preview → `docs/brand/social-preview.png` (the API cannot do this).
- [ ] **Enable private vulnerability reporting:** Settings → Code security, so the route in `SECURITY.md` works.
- [ ] Repository description and topics set (e.g. `claude-code`, `codex`, `ai-agents`, `visualization`, `developer-tools`).
- [ ] `CHANGELOG.md`: add the release date to the `[0.1.0]` heading.
- [ ] `.github/workflows/ci.yml` green on `main`.
- [ ] Re-check the comparison table above against the linked pages on the day of posting.
- [ ] Open each demo link in a fresh browser on the deployed site: the tree loads and the panel opens on the linked step.
- [ ] **Make the repository public** (Settings → General → Danger zone), after a final secrets scan (`pnpm audit:samples` and a search of the git history).
- [ ] Publish 0.1.0 to npm by hand and add the trusted publisher (docs/PUBLISH.md 3a); later releases are a pushed `v<version>` tag.
- [ ] Re-render `hero.gif`, `hero.webp`, `social-preview.png` and `examples/img/*.webp` if the UI changed after phase 35 (all four were made for redesign v7).
- [ ] If possible, check Codex support against a real Codex session before posting; otherwise keep the note in the first comment.
