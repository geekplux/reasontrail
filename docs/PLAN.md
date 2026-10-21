# Reasontrail: plan

Written by `planner` on 2026-10-19 and revised on 2026-10-20 for the **repositioning**. Binding inputs: `CLAUDE.md` (including "Repositioning 2026-10-20" and its addendum), `/workspace/gx-projects/logs/token-garden.change-request.md` (including the addendum at its end), `docs/llm-provider.md` and `docs/DECISIONS.md`.

**What changed on 2026-10-20.** The project (now **Reasontrail**) is a **reasoning map of AI sessions**. You run one skill in a Claude Code, Codex or Grok Build session, and a local page opens. It shows what the task was, the route the agent took, where it got stuck or backtracked, and what it finally changed or answered. Chat transcripts come later. The next-token garden built in phases 1–9 stays as a **zoom-in lens** ("zoom into this sentence"). Its encoding, keyboard and accessibility work is reused, not deleted.

- Phases 1–8 are open PRs and stay exactly as written (§6).
- Phase 9 describes what its branch already contains, now justified as shared infrastructure.
- Phases 10–27 are new.
- Superseded items are kept only where open PRs refer to them, and are marked **[superseded]**: the live prompt box (old phase 10, criteria F9–F12), the garden as the first view, and "no CLI or agent skill".
- **Renamed 2026-10-20: the product is Reasontrail** (repo `geekplux/reasontrail`, `npx reasontrail`, skill `/reasontrail`). The local folder and historical phases 1–8 keep `token-garden`; the code rename (package name, page title, wordmark, CLI and skill names) lands in phase 13.

Contents:

1. Users first
2. Product goal and the first 30 seconds
3. Design direction (superseded by `docs/DESIGN.md` from phase 10)
4. Product acceptance criteria (4.1 reasoning map, 4.2 lens criteria retained from phases 1–9)
5. Architecture (5.1–5.7 lens and Worker as built; 5.8–5.15 reasoning map)
6. Phases (27 PRs; the last one is Cloudflare deployment prep)
7. Out of scope (and what was cut)
8. Risks

---

## 1. Users first

### 1.1 Who it is for

| User | The moment they reach for it | What they need within seconds | What they leave with |
|---|---|---|---|
| **Developer who just ran a long coding-agent session** (Claude Code, Codex, Grok Build) | Right after a 20–90 minute session: "What did it actually do? Did it test anything? Why did it touch that file?" | The task, the main route, where it got stuck or went back, what it changed | Enough confidence to review or commit, or a precise pointer to the step that needs checking |
| **Reviewer of an agent-written PR** | Before reading the diff | What the agent tried and dropped, which commands verified the change, which steps led to each edited file | A faster, better-targeted review |
| **Teammate, lead or educator** explaining how an agent solved something | In a PR comment, a chat thread or a talk | A single shareable, redacted HTML file that opens anywhere without an install | A map that does the explaining |
| **Curious visitor** on the website or a launch post | Five seconds after landing | A real map of the agents that built this app, with no key and no install | The one-line skill install |

Not the user: teams who need production agent observability, tracing, cost analytics or evaluation dashboards, and researchers studying model internals.

### 1.2 The fastest path to the first "wow"

- **Skill (primary).** The user is in a local session and types `/reasontrail`. The skill runs `npx reasontrail --current`. The CLI finds this session, parses it on the machine, writes a self-contained HTML file and opens it. Target: the map is on screen **≤ 5 s** after the command for a 10 MB session. There is no config, account or key, and nothing is uploaded. The agent's reply contains the file path.
- **Shell.** `npx reasontrail` maps the latest session for the current directory. `npx reasontrail path/to/session.jsonl` maps a specific file. `--share` writes a redacted copy you can send to someone.
- **Website (showcase).** The page opens straight onto a real, redacted map of the session that built a phase of this app. Target: **≤ 2 s**, no key. Dragging your own `.jsonl` onto it is a secondary path, parsed entirely in the browser.
- **First wow, with zero clicks:** the glance view. A task card; the main route as one line of named episodes; "stuck here" markers that use shape plus text (for example "test failed 3×, then passed"); and an outcome card with the changed files and the final answer.
- **Second wow, one click:** any step opens its raw tool call or text, with provenance (`<file>:<line>`).
- **Opt-in extras:** AI labels (sub-question, hypothesis, evidence, dead end, decision, answer) and "zoom into this sentence", which opens the next-token garden.

### 1.3 How the plan stays user-first

Every phase has a **User value** line that answers: what does the user get, and how does it save them time or effort? Features that could not answer it were cut or moved to good-first-issue candidates (§7).

---

## 2. Product goal

Reasontrail turns an AI session into a **reasoning map** you can understand at a glance. A coding-agent transcript is long and linear: hundreds of messages, tool calls and results. Reasontrail parses it deterministically on your machine into a typed step graph of turns, tool calls, file touches, errors, retries, edits and subagents. It draws that graph as a map:

- what the task was;
- the main route the agent took, as a handful of episodes;
- where it got stuck, retried or backtracked;
- what it finally changed or answered.

Every node keeps its provenance, so the raw text or tool call behind it is one click away. Written reasoning is labelled honestly as the model's own account, not a record of how it computed. The primary entry point is a skill backed by one small local CLI, with zero config, no account, no key and nothing uploaded. The hosted website is the showcase: real redacted sample maps, install instructions, and drag-and-drop viewing. An optional, budgeted AI pass through the Cloudflare Worker can label steps and link final claims to the steps that support them. The product is fully useful without it. The next-token garden becomes a lens: from any sentence, zoom in to see what a model might have said instead.

### 2.1 The first 30 seconds (skill, the primary path)

1. **0 s:** The user has just finished a Claude Code session that fixed a failing build. They type `/reasontrail`.
2. **~1 s:** The skill runs the kit command, `npx reasontrail --current`. The CLI reads `CLAUDE_CODE_SESSION_ID`, finds `~/.claude/projects/<encoded-cwd>/<id>.jsonl` and its `subagents/`, and parses them locally.
3. **~3 s:** The browser opens `file:///tmp/reasontrail/claude-code-<id>.html`, and the agent replies with the path.
   - Glance view: a task card ("Fix the failing CI build", 41 min, 212 steps, 2 subagents).
   - Seven episodes along the route: Read the error → Explore config → Try pinning the version → **stuck: tests failed 3×** → Revert the pin → Patch the import → Verify.
   - The outcome card lists `vite.config.ts` and `src/main.ts`, 4 edits, the last `pnpm test` passing, and an excerpt of the final answer.
   - Under the title: "Written reasoning is the agent's own account, not a record of how the model computed."
4. **10 s:** The user clicks the "stuck" marker. The detail panel shows the three failing `pnpm test` calls, their stderr excerpts, `…jsonl:418`, and "Show raw".
5. **25 s:** They run `npx reasontrail --current --share` (or press "Save shareable copy"), which writes a redacted `reasontrail-<id>.html` and shows a redaction summary. They attach it to the PR.

### 2.2 The first 30 seconds (website, the showcase)

1. **0 s:** The page opens on "Watch the agents that built this app": the map of the implementer session that built a phase of Reasontrail, rendered from committed JSON with no network call beyond static assets.
2. **5 s:** The visitor clicks a trouble marker and reads the raw command and result.
3. **15 s:** They switch to another sample: a verifier round that failed and was fixed, or a planner's research session.
4. **25 s:** "Map your own session" shows the one-line skill install and `npx reasontrail`. "Or drop a .jsonl here" parses a file in the browser, and nothing is uploaded.

URL entry points:

- `?session=<id>[&step=<stepId>]` opens a sample map (phase 16).
- `?view=open` opens the drop zone (phase 19).
- Garden links (`?sample=…&path=…&t=…&seed=…`) keep working and open the lens (phase 22).
- A local HTML file uses `#step=<stepId>`.

---

## 3. Design direction

> **Superseded from phase 10 by `docs/DESIGN.md`** (owned by `lead-designer`) for the reasoning map and for any identity change. This section remains the spec for the lens (garden) and the baseline identity tokens, type and logo until DESIGN.md records a reasoned change.

The identity is **"specimen plate"**: the garden is drawn like a plate from a botanical field notebook. Warm paper, moss-ink branches whose thickness is the data, token labels set like typewritten specimen tags, and an italic serif for titles in the way Latin species names are set. Each garden carries a **specimen label** card (prompt, "recorded with", k, date) so the provenance of every distribution is always visible. This metaphor is specific to token-garden: the product literally grows and collects specimens of model behaviour. It is not a SaaS template: no gradients, no glass, no card grids, no stock illustrations, no decorative 3D.

`dataviz-designer` turns this section into the exact encoding spec `docs/viz/garden.md` at the start of phase 3, before any tree-rendering work beyond the phase 1 skeleton. Phase 2 implements the identity itself (tokens, type, logo, shell), so every screenshot from phase 2 onward looks like the real product.

### 3.1 Typography

| Role | Face | Delivery | Payload |
|---|---|---|---|
| Token labels, probabilities, code, the "token" half of the wordmark | **IBM Plex Mono 500**, `font-variant-numeric: tabular-nums` | Self-hosted via `@fontsource/ibm-plex-mono/latin-500.css` (Vite bundles the file, same origin) | ~15 KB woff2 |
| Wordmark "garden", garden titles, section headings | **Instrument Serif Italic** | Self-hosted via `@fontsource/instrument-serif/latin-400-italic.css` | ~22 KB woff2 |
| UI text (buttons, notes, body copy) | System UI stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif` | none | 0 KB |

- Fallbacks: mono `ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace`; serif `"Iowan Old Style", "Palatino Linotype", Georgia, serif`.
- `font-display: swap` (fontsource default). Only the latin subset files are imported. Text outside latin falls back to the system stacks through `unicode-range`, which is fine.
- Garden layout never measures rendered text. Label widths are estimated as `chars × 0.6em` (a monospace advance), so the layout is the same before and after the font arrives and no reflow happens on swap.
- Type scale: base 16 px, ratio 1.25 (12.8 / 16 / 20 / 25 / 31 px). Token labels 14 px desktop, never under 12 px on mobile. Probability labels 12.8 px.
- Total font budget for the first view: **≤ 45 KB**, two files (Q3).

### 3.2 Colour

Colour is a **secondary, redundant channel**. Probability is carried by thickness plus a number; state is carried by marker shape, line style and text; the selected or sampled path by outline and markers. Values below were checked with WCAG 2.x relative luminance and Machado et al. (2009) severity-1.0 simulation; ΔE is CIE76 between the simulated colours.

Light theme, "paper" (default; follows `prefers-color-scheme`):

| Token | Hex | Contrast on `--tg-paper` | Use |
|---|---|---|---|
| `--tg-paper` | `#F6F3EA` | n/a | page background |
| `--tg-surface` | `#FFFDF7` | 1.09 | specimen label card, popovers |
| `--tg-ink` | `#1C2620` | 14.1 | text, outlines, focus-ring halo |
| `--tg-ink-muted` | `#4D5A52` | 6.5 | secondary text, not-recorded and remainder strokes |
| `--tg-rule` | `#D9D3C3` | 1.35 | hairlines only (decorative, never carries meaning) |
| `--tg-branch-lo` | `#5F7D6C` | 4.1 | branches with p < 10% |
| `--tg-branch-mid` | `#3D6150` | 6.3 | branches with 10% ≤ p < 40% |
| `--tg-branch-hi` | `#1F4535` | 9.7 | branches with p ≥ 40% |
| `--tg-accent` ("pollen") | `#B4530A` | 4.5 | selected or sampled path, always with outline and diamond markers |
| `--tg-focus` ("cornflower") | `#2F55D4` | 5.6 | 2 px focus ring with a 2 px paper gap |
| `--tg-error` ("brick") | `#A3292B` | 6.5 | error notes, always with a "!" glyph and text |

Dark theme, "night garden" (`prefers-color-scheme: dark`):

| Token | Hex | Contrast on `--tg-paper` |
|---|---|---|
| `--tg-paper` | `#111813` | n/a |
| `--tg-surface` | `#18211B` | 1.09 |
| `--tg-ink` | `#E9EEE7` | 15.3 |
| `--tg-ink-muted` | `#A8B4AA` | 8.4 |
| `--tg-rule` | `#2C372F` | 1.46 (decorative) |
| `--tg-branch-lo` | `#7FA48F` | 6.5 |
| `--tg-branch-mid` | `#A9CDB8` | 10.4 |
| `--tg-branch-hi` | `#D4EBDC` | 14.4 |
| `--tg-accent` | `#F0A04B` | 8.5 |
| `--tg-focus` | `#8DB0FF` | 8.4 |
| `--tg-error` | `#FF8F87` | 8.2 |

CVD check (ΔE between simulated colours; ≥ 20 reads as clearly different):

| Pair | Theme | normal | protan | deutan | tritan |
|---|---|---|---|---|---|
| accent / branch-hi | light | 75 | 43 | 57 | 81 |
| accent / branch-lo | light | 70 | 42 | 51 | 74 |
| focus / branch-hi | light | 91 | 76 | 78 | 27 |
| accent / branch-hi | dark | 63 | 52 | 55 | 59 |
| focus / branch-hi | dark | 54 | 49 | 53 | 28 |
| error / branch-hi | light | 72 | **10** | 34 | 88 |
| accent / error | dark | 37 | 38 | 29 | **9** |

The two bold pairs are close under one CVD type. That is acceptable only because error and accent never rely on colour: error has the "!" glyph, a text note and a dashed stroke; accent has an ink outline and diamond markers. `tokens.test.ts` (phase 2) asserts every contrast in the tables and the ΔE ≥ 20 rows, so palette edits cannot silently regress. All text pairs pass WCAG AA (≥ 4.5:1) and all graphical marks pass ≥ 3:1, on both `--tg-paper` and `--tg-surface`.

### 3.3 Layout

- **Desktop (1280×800):** a slim header (wordmark left; mode switch "Samples | Your prompt" centre; "Copy link" and a GitHub link right). Under it, a single control row: sample picker, temperature slider with presets, "Sample a path", "Table view". Then the specimen label card on the left edge of the garden, with the garden growing to the right, full width. The path readout sits directly under the garden. The footer holds "How to read this garden" (a `<details>`), "Runs offline; nothing you do with samples leaves your browser", and the source link. The whole default garden is visible without scrolling.
- **Mobile (390×844):** header collapses to the mark plus mode switch; controls wrap to two rows; the garden lives in a horizontal scroll container with the specimen label above it; the path readout is sticky at the bottom.
- Max text width 72ch; the garden is full-bleed. Spacing scale 4/8/12/16/24/32/48 px. Corners 2 px (paper, not pills). Hairline rules instead of shadows.

### 3.4 Motion

- **Growth:** new branches extend from the parent tip in 180 ms with `cubic-bezier(0.2, 0.7, 0.2, 1)`; their labels fade in over 120 ms after a 60 ms delay. Ancestors never move (fixed `nodeSize`).
- **Reshape (temperature):** stroke widths transition over 120 ms; labels change without animation.
- **Sampled path:** the highlight walks edge by edge, 80 ms per edge, capped at 600 ms in total.
- **Loading:** a "growing…" stub at the branch tip with three dots that fade in sequence for at most 3 cycles, then stay static.
- No looping animation, no parallax, no auto-play.
- **Reduced motion** (`prefers-reduced-motion: reduce`): every duration is 0 ms, the sampled path appears at once, and the loading dots are static.

### 3.5 Logo and wordmark

- **Mark:** a seed (filled circle, r = 3) at the left of a 32×32 viewBox, a short stem, and a fork into three branches of stroke width 4, 2.5 and 1.25, each ending in a small round node. It is the product's own encoding (thicker = more likely) as a glyph. Pure paths and circles, `fill`/`stroke="currentColor"`, so it follows the theme; no text, so it renders identically everywhere (README, favicon, social preview).
- **Wordmark:** the mark followed by "token" in IBM Plex Mono 500 and "garden" in Instrument Serif Italic, baseline-aligned, 0.25em apart. The type pairing is the concept: machine tokens and an organic garden.
- Delivered as React components (`src/brand/LogoMark.tsx`, `src/brand/Wordmark.tsx`) and static files (`public/favicon.svg` with an embedded `prefers-color-scheme` style, `public/logo.svg`). All hand-built in code; no image editors needed.

### 3.6 States (each is designed, not default)

| State | Where | Visual | Text |
|---|---|---|---|
| First view | whole app | the default garden, already grown one level | none needed |
| Empty (live mode before Grow) | garden area | the logo mark as a lone seed, a sentence and 3 example chips that fill the prompt box (no call) | "Type a beginning. token-garden shows what the model might say next." |
| Loading (live expansion) | at the branch tip | hollow circle marker + "growing…" stub, `aria-busy` on the treeitem | announced politely |
| Not recorded | at the branch | dashed muted stroke + hollow circle | "Not in this recording." + "Grow it live" button |
| Depth limit | at the branch | muted stroke + bar marker (⊣) | "Depth limit (12 tokens)" |
| Error | at the branch, or a banner for app-level errors | brick "!" glyph + text + dashed stroke | calm, specific message + "Retry" where useful |
| Live unavailable / offline | under the prompt box | inline note with info glyph | "Live mode isn't available here; the sample gardens still work." |
| Unknown sample or broken share link | top of the garden | inline note | "That garden isn't here, so here is the lighthouse." / "Part of this link isn't in the recording." |
| No JavaScript | `<noscript>` | plain text on paper | what the app is and a link to the README |

---

## 4. Product acceptance criteria

Numbered for reference from phases and PRs. "Headless check" means the Playwright flows run by `pnpm check:browser` with system Chrome, either against `vite preview` or against a `file://` HTML file written by the CLI. §4.1 holds the reasontrail criteria, from phase 10 on. §4.2 keeps the criteria phases 1–9 were built against; the lens still meets them.

### 4.1 Reasoning map criteria (from phase 10)

#### Map (M)
- **M1 Glance.** For every committed sample, and for any parsed session, the top-level view shows four regions without any interaction:
  - **(a) task card:** the first user request (≤ 280 chars, "more" for the rest), source, agent, model, duration, and counts of steps and subagents;
  - **(b) main route:** the ordered episodes (≤ 12 shown; the rest fold into a labelled "+n more" group);
  - **(c) trouble markers** on the route: each detected pattern (§5.11) with a shape, a count and a text label;
  - **(d) outcome card:** changed files with edit counts, the last verification command and its result, and an excerpt of the final answer.
- **M2 Glance answers are checkable.** Each sample has an `expect` block in its graph JSON (task first words, top changed files, number of trouble markers, final status). The headless flow reads the rendered text and asserts it matches. The lead-designer also runs a 5-second review of the screenshots against the four questions in DESIGN.md.
- **M3 Details on demand.** Selecting an episode, step or marker (click, Enter) opens a detail panel. It shows the kind, timestamp, lane (main or subagent name), tool and input summary, result status, and a text preview. It also shows provenance (`<file>:<line>`, plus the record uuid where there is one). "Show raw" reveals the verbatim record in one action; it is redacted in samples and shared files.
- **M4 Subagents** are lanes linked to the call that spawned them. They are collapsed by default, show their description and final status, and can be expanded in place.
- **M5 Honesty.** A persistent one-line label in the task card reads: "Written reasoning is the agent's own account, not a record of how the model computed." It links to "How to read this map". The detail panel repeats it for assistant text and thinking steps. Deterministic patterns say "detected pattern". AI labels say "suggested by <model>" (X3).
- **M6 Unstored thinking.** Thinking blocks with no stored text (current Claude Code transcripts on this box keep only a signature) appear as "thinking (text not stored)". No text is ever invented for them.
- **M7 Determinism, no AI by default.** The same input gives byte-identical graph JSON (unit test). The default path makes no model calls.
- **M8 Errors are calm.**
  - Malformed lines are skipped and counted ("3 lines could not be read").
  - Unknown record types are ignored.
  - A partial last line, from a session that is still being written, is skipped.
  - An unsupported file names the supported formats.
  - An empty session gets a designed empty state.
- **M9 Links.** `?session=<id>&step=<stepId>` on the website, and `#step=<stepId>` in a local file, reopen the selection. Back and Forward behave as expected.

#### CLI and skills (C)
- **C1** Run with no arguments in a project directory, `npx reasontrail`:
  - finds the latest session for that directory across Claude Code, Codex and Grok Build;
  - parses it locally and writes a self-contained HTML file;
  - opens it, or prints the path when there is no opener or `--no-open` is given;
  - exits 0 and leaves no process of its own running.
- **C2** Flags:
  - `--current` (the calling agent's session, §5.12), `--latest`, an explicit path or session id;
  - `--list` (the 10 most recent, with source, title, start time and size), `--source claude-code|codex|grok-build`;
  - `--out <file>`, `--share` (redacted, §5.13), `--json` (graph JSON to stdout);
  - `--no-open`, `--help` and `--version`.
  - Exit codes are documented: 0 ok, 2 no session found, 3 unreadable or unsupported file.
- **C3** The HTML file works from `file://` with zero network requests and no external resources. It is ≤ 300 KB plus the session data, and ≤ 1 MB for the largest committed sample.
- **C4** The CLI has zero runtime dependencies (Node built-ins only) and needs Node ≥ 20.19. It finishes in ≤ 3 s for a 10 MB session on this box, median of 3.
- **C5** Nothing is uploaded. The CLI makes no network request unless the user passes `--ai` (X5).
- **C6** `skills/reasontrail/` meets the wheresryan22/anatomy bar: `SKILL.md` + `kit/` + `references/` + `audit/` + `evals/`.
  - `pnpm skill:audit` and `pnpm skill:evals` pass.
  - One command (`npx reasontrail install-skill`) installs it for Claude Code (`~/.claude/skills/`, which Grok Build also scans), Grok Build (`~/.grok/skills/` when `~/.claude` is absent) and Codex.
  - The installer never overwrites a changed skill without `--force`, and supports `--dry-run`.
- **C7** Invoking the skill in a session returns the map's file path in the agent's reply and opens the page. Evals cover this with fixture sessions, a sandboxed `HOME` and `--no-open`.

#### Privacy and intake (V)
- **V1** On the website, drag-and-drop or file-pick parses the file in a Web Worker in the browser. A request listener asserts zero network requests during and after parsing.
- **V2** The drop zone says "Parsed in your browser. Nothing is uploaded." The local viewer says "This file was generated on your machine."
- **V3** AI structuring is opt-in for each session, through a dialog that lists exactly what is sent (redacted step summaries, how many, to which endpoint) and what is cached.
- **V4** Sharing (`--share`, "Save shareable copy") always applies redaction and first shows a summary of what was replaced (n secrets, n emails, n paths). The local private view shows unredacted text, with a toggle to preview the redacted version.
- **V5** Files up to 50 MB are accepted. Larger files get a clear message that suggests the CLI.

#### Redaction (R)
- **R1** `redact()` replaces each of the following with a typed placeholder (`[secret:github-token]`, `[email]`, `~/…`):
  - known secret formats: `sk-…`, `sk-ant-…`, `ghp_`/`gho_`/`ghs_`/`github_pat_`, `xox[abprs]-`, `AKIA…`, `AIza…`, JWTs, PEM private-key blocks;
  - `Authorization: Bearer|Basic …`;
  - `NAME=value` and `"name": "value"` pairs whose name matches `/(key|token|secret|passw|auth|cookie|session)/i`;
  - credentials and token-like query parameters in URLs;
  - emails;
  - home paths (`/home/<u>`, `/Users/<u>`, `C:\Users\<u>`, which become `~`);
  - high-entropy strings of 32 or more characters.
- **R2** A synthetic test corpus with no real secrets has ≥ 40 cases, including false-positive guards: git SHAs (7–40 hex), UUIDs, package integrity hashes in lockfile excerpts, and ordinary long words.
- **R3** `pnpm audit:samples` scans every committed sample and fixture and fails on any R1 match. It also fails on any term in an optional, gitignored local denylist (`.redact-denylist`).
- **R4** Samples and shared files drop records that are not conversation: API request blobs, attachments, system prompts, cost and usage state, and environment dumps.

#### AI structuring (X), optional
- **X1** `POST /api/structure` takes ≤ 200 redacted step summaries (≤ 300 chars each) per batch. It returns labels from the fixed set {sub-question, hypothesis, evidence, dead end, decision, answer} and claim→step links. The output is schema-validated. A link to an unknown step id, or an invalid label, is dropped rather than shown.
- **X2** Cached in KV by a SHA-256 of the batch. It reuses `RL_ALL`/`RL_MISS` and the daily budget from phase 9. Each session is capped at 5 batches.
- **X3** Labels are an overlay that can be switched off. They never change the deterministic graph, and every one says which model suggested it.
- **X4** The user needs no key. The default is Workers AI; the OpenAI-compatible upstream is optional for self-hosters.
- **X5** The CLI's `--ai` sends the same redacted batches to a configurable endpoint (`--api <url>`) and prints what it sends first. Verification uses fakes only.

#### Lens (Z)
- **Z1** On assistant-text steps, "Zoom into this sentence" opens the garden for that sentence. Recorded lens data for the samples works offline. For anything else, live growth is an explicit opt-in through `/api/next-tokens`.
- **Z2** The lens clearly says it shows what an open model would predict for that text, not what the session's model computed.
- **Z3** Back returns to the same map selection. The garden keeps F1–F8, F14 and A1–A6.

#### Chat transcripts (T), later
- **T1** Pasting text with role markers (`User:`/`Assistant:`, `You said:`/`ChatGPT said:`, Markdown headings, and similar) produces a map.
- **T2** ChatGPT `conversations.json` and Claude export files open a picker of conversations and then a map. Reasoning or thinking text is included when present.
- **T3** Share links are best effort. When one fails, the message says: "We couldn't read that link. Paste the conversation text instead." The paste box gets focus.
- **T4** Parsing is client-side. Share-link fetching, if it is built at all, goes only through the Worker with a host allowlist.

#### General (G)
- **G1 Accessibility.** The map meets A1–A6 in spirit:
  - Tab reaches the map. Arrow keys move along the route and into lanes, Enter opens details, Esc closes them, and Home/End work.
  - An **outline view** (ordered list of episodes and steps) is an equivalent text alternative.
  - Accessible names include kind, status and time.
  - Trouble and status always pair a shape with text, never colour alone.
  - Reduced motion is respected. axe finds 0 serious or critical issues. CVD screenshots are reviewed.
- **G2 Performance.** Website `tg:map-ready` ≤ 2000 ms on `vite preview` (median of 3). The initial JS is ≤ 170 KB gzip, including the default sample; other samples load lazily. A 10 MB `.jsonl` parses in the browser in ≤ 3 s. Glance layout for 5,000 steps takes ≤ 300 ms.
- **G3 No key.** Everything except X and live lens growth works with no credentials. After the first load, the website works offline for the samples.
- **G4 Typed public API.** `shared/session/types.ts` exports `SessionGraph` and its parts, with TSDoc. `shared/session/adapterContract.ts` is the executable spec for new adapters. `docs/EXTENDING.md` gains "Add a session adapter".
- **S1'** The README pitch becomes the reasoning map. The hero is a map, and the quick start is the skill one-liner plus `npx reasontrail`. S5' examples are sample maps. S6' launch drafts are about the reasoning map. S1–S7 otherwise stand.

### 4.2 Lens (garden) criteria, retained from phases 1–9

Phases 1–9 were built and verified against these. **F9–F12 [superseded]:** the live prompt box was dropped. Live growth survives only inside the lens (Z1, phase 22), using the same limits and messages. P1 and P2 are superseded for the website first view by G2 from phase 16; the lens keeps P3 and P4. S1, S5 and S6 are restated as S1'.

Numbered for reference from phases and PRs. "Headless check" means the Playwright flows run by `pnpm check:browser` against `vite preview` with system Chrome.

#### Functional (F)

- **F1** The first view (no query string) renders a recorded sample garden with no user action. It shows the prompt, the root's top-k branches (k = 5), and the most probable child already expanded one level.
- **F2** A sample picker offers 6 recorded gardens, each with a title and prompt. Choosing one replaces the garden and updates the URL (`history.replaceState`). Loading `?sample=<id>` opens that garden; an unknown id falls back to the default garden with a short notice.
- **F3** Clicking a branch, or pressing Enter or Space on it, expands it when its continuation key exists in the recording. Doing the same on an expanded branch collapses it.
- **F4** Expanding a branch with no recorded data makes zero network requests. It shows an inline note at that branch ("Not in this recording.") with a button to grow it live from that text.
- **F5** Branch thickness is a deterministic function of that token's conditional probability (spec in `docs/viz/garden.md`). Every branch shows its probability as a number (e.g. `44.7%`) on hover and on keyboard focus.
- **F6** A path readout shows the prompt plus the continuation of the selected or focused branch, with token boundaries visible.
- **F7** The temperature control (0 to 2, step 0.1, default 1.0, where 0 = greedy) reshapes every visible branch's thickness and label client-side with zero network requests. It shows a clear "approximate (top-k only)" note when T ≠ 1.
- **F8** "Sample a path" walks the visible or recorded garden from the root using the tempered probabilities and a displayed seed. It highlights the path with outline and markers (not colour alone), spells out the sampled sentence, and stops with a stated reason ("end of recording", "depth limit", or "not grown yet") without network calls.
- **F9** Live mode: one prompt box (1 to 280 chars, with a counter). "Grow" makes exactly one `POST /api/next-tokens` call for the root. After that, each click on an ungrown branch makes at most one call. Re-expanding, collapsing and re-opening, or repeating the same prefix makes zero further calls (client prefix cache).
- **F10** Live caps: width k = 5, depth at most 12 tokens beyond the prompt (the branch shows "depth limit"), and at most 150 live calls per tab session (then a calm message). No prefetch and no speculative expansion.
- **F11** Live errors are calm and inline, and the recorded gardens stay fully usable:
  - `unavailable` (no model connected, offline, or 404 from a static host): "Live mode isn't available here; the sample gardens still work."
  - `rate_limited` shows the retry-after seconds.
  - `budget_exhausted`, `upstream_error` (with Retry), `prefix_too_long` and `invalid_input` each have their own message.
- **F12** Every garden is labelled with the model that produced it on its specimen label: "Recorded with SmolLM2-135M (q8)", or "Live: @cf/zai-org/glm-4.7-flash (a chat model asked to continue your text)". Live mode includes a one-line privacy note: the text is sent to Cloudflare Workers AI and the cache key is a hash of it.
- **F13** Worker `POST /api/next-tokens` implements the contract in `docs/llm-provider.md` §5–6: input limits; error envelope and status codes; KV cache per prefix (`cached: true` on hit); rate limits (20 misses/60 s, 120 total/60 s per IP); daily upstream cap (`DAILY_UPSTREAM_CAP`, default 1000); 10 s upstream timeout with at most one retry on 5xx.
- **F14** Share links: for recorded gardens the URL always reflects the current view (`sample`, `path` as dot-separated rank indices from the root, `t`, `seed`; defaults omitted) via `replaceState`. "Copy link" copies it (with a select-the-text fallback when the Clipboard API is unavailable) and announces "Link copied". Opening such a link restores the expansion along the path, the selection, temperature and sampled path with zero network requests. A path that is not fully recorded restores the longest valid prefix with a notice. Live gardens share only `?prompt=` (pre-fill, never auto-grow).

#### Accessibility (A)

- **A1** Everything is keyboard-operable. The garden is a single tab stop with roving focus: arrow keys move between branches per the WAI-ARIA tree pattern; Enter or Space expands or collapses; Home and End jump to the first and last visible branch. Every branch is reachable regardless of probability, including the thinnest. All controls are reachable in logical order, each with a visible focus indicator of at least 3:1 contrast.
- **A2** Screen readers get tree semantics. The garden is `role="tree"` with an accessible name; each branch is a `role="treeitem"` with an accessible name of the form `"<token>", 44.7 percent, path 12.0 percent`, plus `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` when expandable, and "not recorded" in the description when relevant. A polite live region announces expansions, errors, copied links and sampled paths.
- **A3** A "Table view" toggle shows an HTML table of all visible branches (path, token, probability, path probability, state), a full text alternative to the drawing.
- **A4** Meaning is never carried by colour alone (§3.2, §3.6). The palette passes protanopia, deuteranopia and tritanopia simulation (screenshots reviewed, ΔE asserted in tests). Text contrast ≥ 4.5:1 and graphical marks ≥ 3:1 in both themes.
- **A5** With `prefers-reduced-motion: reduce`, all growth and reshape transitions are disabled (computed `transition-duration` is `0s`). Nothing flashes.
- **A6** An automated axe-core pass of every flow reports 0 `serious` or `critical` violations.

#### Performance (P), measured in the headless check on `vite preview`, median of 3 runs

- **P1** Budgets checked by `pnpm check:size` on `dist/` (gzip for JS/CSS, raw for fonts): initial JS ≤ **130 KB** gzip (samples included); CSS ≤ **15 KB** gzip; fonts requested by the first view ≤ **45 KB** in at most 2 files.
- **P2** Navigation start to the `tg:garden-ready` mark ≤ 1500 ms ("seconds to first wow").
- **P3** Expanding a recorded branch puts its children in the DOM within 200 ms of the click.
- **P4** One temperature step re-renders the largest fully expanded sample (about 200 branches) in ≤ 100 ms.

#### Offline sample (O)

- **O1** In sample mode the app makes no requests other than same-origin static assets (self-hosted fonts are same-origin; no third-party fonts, CDNs, analytics or `/api/*`). Asserted by a request listener in the headless check.
- **O2** After the first load, `context.setOffline(true)` still lets the user switch samples, expand recorded branches, change temperature, sample a path and open a share link, with no errors.

#### No-key operation (N)

- **N1** With no Cloudflare credentials, no `.dev.vars` and no API keys, `pnpm install --frozen-lockfile && pnpm build && pnpm check:browser` passes and the full sample experience works.
- **N2** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:size`, `pnpm check:docs` and `pnpm run check:deploy` all pass with no valid credentials. Worker tests use fakes for `AI`, KV and rate-limit bindings. Nothing in verification requires live Workers AI (the box's `CLOUDFLARE_API_TOKEN` is a placeholder).
- **N3** When live mode is unavailable, the prompt box stays visible with a note (F11). No secrets are ever committed: `.dev.vars` is gitignored and `.dev.vars.example` holds empty values.

#### Quality signals (Q)

- **Q1 Typed public APIs.** `shared/llm/types.ts` exports `TokenChoice`, `ProviderErrorCode`, `ProviderError` and `LogprobProvider` with TSDoc on every member; `src/samples/types.ts` exports `SampleGarden`. All tsconfigs use `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. oxlint denies `typescript/no-explicit-any`. A reusable provider contract test suite (`src/llm/providerContract.ts`) is the executable spec for anyone adding a provider.
- **Q2 Small dependency footprint.** Runtime `dependencies` are exactly: `react`, `react-dom`, `d3-hierarchy`, `@fontsource/ibm-plex-mono`, `@fontsource/instrument-serif`. The Worker has **no** runtime dependencies. `pnpm check:size` fails if `package.json` `dependencies` differs from this allowlist (a new runtime dependency needs a DECISIONS.md entry and an allowlist edit in the same PR). Dev dependencies are listed in §5.6.
- **Q3 Fast load.** P1 and P2.
- **Q4 Tests and CI.** Unit tests for every pure module, component tests for interactive pieces, the headless flows, and `ci/github-workflow.yml` running install, lint, typecheck, test, build, check:size, check:docs, check:browser and check:deploy. (It lives in `ci/` until the token has `workflow` scope; follow-up in STATUS.md.)
- **Q5 Docs for extending.** `docs/EXTENDING.md` (adding a provider or Worker upstream, recording and adding samples, theming) and `tools/record-samples/README.md`.
- **Q6 Accessible.** A1–A6.

#### Open-source packaging (S)

- **S1** `README.md` sells in 10 seconds: above the fold (first ~25 lines rendered) it has the logo, the one-line pitch, a hero image or GIF from the real app, a "Live demo: coming soon" placeholder, and a 3-line quick start. Below: how it works, accessibility, a roadmap, contributing and licence.
- **S2** `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`, `CHANGELOG.md` (Keep a Changelog, updated by every phase), issue templates in `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`. Nothing under `.github/workflows/`.
- **S3** `docs/GOOD-FIRST-ISSUES.md` lists at least 8 scoped candidates, each with files to touch and a "done when".
- **S4** A committed social preview image `docs/brand/social-preview.png` (1280×640, < 1 MB) generated from the real app and the logo.
- **S5** An `examples/` gallery: every recorded garden with a screenshot, a share link and "what to notice", plus how to record your own.
- **S6** `docs/LAUNCH.md`: Show HN draft, X post draft, 3 demo scenarios, an honest comparison with alternatives, and an explicit statement that nothing has been posted anywhere.
- **S7** `pnpm check:docs` verifies that every relative link and image in `README.md`, `CONTRIBUTING.md`, `docs/*.md` and `examples/README.md` resolves to a committed file.

#### Design (D)

- **DS1** All colours come from `src/styles/tokens.css`; `tokens.test.ts` asserts the §3.2 contrasts and ΔE rows. oxlint/grep: no hex colours in `src/**/*.tsx`.
- **DS2** The two self-hosted fonts load from the same origin; the logo, favicon and wordmark match §3.5.
- **DS3** Every state in §3.6 that exists at a phase's end is implemented as designed and screenshotted, and `dataviz-designer` lists no open deviations.

---

## 5. Architecture

§5.1–5.7 describe the lens (garden) and the Worker as built in phases 1–9; they are kept because phases 1–9 reference them. Items about the live prompt box are **[superseded]** (D35). §5.8–5.15 describe the reasoning map from phase 10.

### 5.1 Modules

```
index.html                     no external resources; favicon, theme-color, description, <noscript>
public/
  favicon.svg, logo.svg        mark (paths only, currentColor / prefers-color-scheme)
  _headers                     security + cache headers (phase 13)
src/
  main.tsx, App.tsx            app shell: mode (Samples | Your prompt)
  app/urlState.ts              parse/serialize sample, path, t, seed, prompt (pure)
  styles/
    tokens.css                 §3.2 colour tokens (light + dark), type scale, spacing
    base.css                   layout, focus ring, reduced-motion rule
    colorMath.ts               WCAG contrast + Machado CVD simulation (test-only import)
    tokens.test.ts             asserts §3.2 contrasts and ΔE rows
  brand/LogoMark.tsx, Wordmark.tsx
  samples/
    <id>.json  x6              recorded gardens (schemaVersion 1, flat prefix map)
    index.ts, types.ts, validate.ts
  llm/
    recordedProvider.ts        LogprobProvider over a SampleGarden (throws not_recorded)
    cachedProvider.ts          in-memory prefix cache, in-flight dedupe, k slicing
    workerProvider.ts          fetch POST /api/next-tokens, AbortSignal, error mapping
    temperature.ts             applyTemperature(choices, T) -> tempered probs + remainder
    providerContract.ts        reusable contract test suite for every provider
  garden/
    buildTree.ts, layout.ts, scales.ts, linkPath.ts      pure
    state.ts, keyboard.ts, samplePath.ts, entropy.ts     pure
    GardenView.tsx, TableView.tsx, Legend.tsx, PathReadout.tsx
  live/
    LivePrompt.tsx, useLiveGarden.ts, limits.ts, messages.ts
  components/
    AppShell.tsx, SpecimenLabel.tsx, SamplePicker.tsx, TemperatureControl.tsx,
    ShareButton.tsx, LiveRegion.tsx, HowToRead.tsx
    states/InlineNote.tsx, EmptyState.tsx, GrowingStub.tsx
shared/llm/                    DOM-free, used by app, Worker and tests
  types.ts, normalize.ts, parseOpenAiLogprobs.ts
worker/
  index.ts, handler.ts, validate.ts, errors.ts, cache.ts, limits.ts, budget.ts
  upstream/workersAi.ts, upstream/openaiCompatible.ts, upstream/select.ts
  test/fakes.ts, test/fixtures/glm-response.json
tools/record-samples/          standalone recorder (own package.json + lockfile)
scripts/
  check-browser.mjs            preview server + system Chrome + flows + cleanup
  browser/lib.mjs, cvd.mjs, axe.mjs, flows/*.mjs
  check-size.mjs               JS/CSS/font budgets + runtime dependency allowlist
  check-docs.mjs               relative links and images in docs resolve
  smoke-workers-ai.mjs         one real Workers AI call (only with a valid token)
  brand/hero-gif.mjs           dev-only: screenshot sequence -> system ffmpeg -> hero.gif
ci/github-workflow.yml         CI definition (not under .github/workflows/)
.github/ISSUE_TEMPLATE/*.yml, .github/pull_request_template.md
wrangler.jsonc                 Worker + static assets + AI + KV + ratelimits + vars
docs/viz/garden.md             visual encoding spec (dataviz-designer, phase 3)
docs/EXTENDING.md, docs/GOOD-FIRST-ISSUES.md, docs/LAUNCH.md, docs/DEPLOY.md
docs/brand/hero.png, hero.gif, social-preview.html, social-preview.png
examples/README.md, examples/img/<id>.png
README.md, LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md
```

### 5.2 Data flow

1. **Boot:** `samples/index.ts` statically imports the JSON and `validate.ts` checks it. `urlState.parse(location.search)` picks the garden, path, T and seed (or defaults). `App` creates a `RecordedProvider`. The garden reducer starts with the default expansion (root + most probable child) or the shared path. `layout.ts` turns the visible tree into coordinates and `GardenView` draws SVG. Then `performance.mark('tg:garden-ready')`.
2. **Expand (sample mode):** a click or Enter dispatches `expand(key)`. The provider lookup is synchronous (`nodes[key]`). A hit adds the children; a miss throws `not_recorded` and the node gets status `not-recorded` with an inline note. No network.
3. **Temperature and sampling:** pure transforms over probabilities already held (`temperature.ts`, `samplePath.ts`), applied at render time. No provider calls.
4. **URL state:** every change of sample, selection path, T or seed calls `history.replaceState(urlState.serialize(...))`. No history entries are pushed, so Back leaves the app as expected.
5. **Expand (live mode):** `useLiveGarden` keeps a node map with the same shape as a sample. An expand calls `CachedProvider(WorkerProvider)`: in-memory map, then in-flight dedupe, then `POST /api/next-tokens {prefix, k: 5}`. In the Worker: validate, `RL_ALL`, KV get; on a miss `RL_MISS`, budget check, `env.AI.run` (or the OpenAI-compatible adapter), normalize, KV put via `waitUntil`, respond. The client merges the result and the same render path draws it.

### 5.3 Cloudflare pieces

| Piece | Binding | Use |
|---|---|---|
| Workers + static assets | `assets` (`./dist`, `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*"]`) | One Worker serves the SPA and `/api/*` |
| Workers AI | `AI` | `@cf/zai-org/glm-4.7-flash`, `max_tokens: 1`, `logprobs`, `top_logprobs: 8`, thinking disabled |
| Workers KV | `TG_CACHE` | Per-prefix cache `nt:v1:<MODEL_ID>:<sha256(prefix)>` (30-day TTL); daily budget counter `budget:<YYYY-MM-DD>` |
| Rate Limiting | `RL_MISS` (20/60 s), `RL_ALL` (120/60 s) | Keyed by `CF-Connecting-IP` |
| Vars and secrets | `MODEL_ID`, `UPSTREAM` (`workers-ai` \| `openai-compatible`), `DAILY_UPSTREAM_CAP`, `OPENAI_BASE_URL`, `OPENAI_MODEL`; secret `OPENAI_API_KEY` (fallback upstream only) | |

No D1 or R2: nothing needs relational data or blob storage. Share links are pure URL state, so no server storage.

### 5.4 Where AI is used (and only there)

- **Live expansion:** exactly one upstream call per uncached prefix, triggered only by an explicit click or keypress on an ungrown branch, or by Grow for the root.
- **Recording samples:** an offline, one-time developer step (`tools/record-samples`, local SmolLM2-135M). The output is committed JSON; nothing calls a model at runtime for samples.

Everything else is deterministic code: layout, thickness, temperature, sampling, entropy, share links, the table view and validation.

### 5.5 Caching

- **Build time:** samples are bundled into the JS, so the first view needs no fetch. Hashed assets get long-cache headers (phase 13).
- **Client:** `CachedProvider` holds a `Map<prefix, TokenChoice[]>` per tab, dedupes in-flight requests and serves smaller k by slicing.
- **Edge:** the Worker's KV cache stores the full `K_FETCH = 8` list per prefix. The key is a SHA-256 hash, so raw text is not stored in the key. Bump `v1` when the system prompt or parser changes.

### 5.6 Toolchain (pinned for this box)

The box has **Node 20.19.2** and **pnpm 9.15.9**. Several current majors need Node 22+ (`vitest@5`, `wrangler>=4.87`, `@axe-core/playwright@4.14`). Pins:

| Tool | Version | Kind |
|---|---|---|
| `react` / `react-dom` | `^19` | runtime |
| `d3-hierarchy` | `^3` | runtime |
| `@fontsource/ibm-plex-mono`, `@fontsource/instrument-serif` | `^5` | runtime (font files only) |
| `vite` | `^8` (Rolldown-based) | dev |
| `@vitejs/plugin-react` | `^6` | dev |
| `typescript` | `^7` (`tsc --noEmit`); fall back to `~6.0` if its install or `tsc` misbehaves and record why | dev |
| `vitest` | `~4.1` (Node 20 compatible) | dev |
| `oxlint` | `^1` | dev |
| `playwright-core` | `^1.64` | dev |
| `axe-core` | `^4.11` (injected with `page.addScriptTag`) | dev |
| `happy-dom`, `@testing-library/react` | latest compatible | dev |
| `@types/d3-hierarchy`, `@types/react`, `@types/react-dom` | | dev |
| `wrangler` | `~4.86` (last line supporting Node 20) | dev, from phase 8 |
| `@cloudflare/workers-types` | | dev, from phase 8 |

`package.json` has `"packageManager": "pnpm@9.15.9"`, `"engines": {"node": ">=20.19"}`, `"license": "MIT"`, `"private": true`; the repo has `.nvmrc` = `20.19`. Vitest uses `environment: 'node'` by default (component tests opt in with `// @vitest-environment happy-dom`) and `maxWorkers: 2`. `pnpm typecheck` runs `tsc --noEmit -p` over each tsconfig (app, node, and worker from phase 8).

### 5.7 Open technical decisions (recommendations; the main agent records them in `docs/DECISIONS.md`)

| # | Decision | Recommendation | Alternatives |
|---|---|---|---|
| D1 | Toolchain on Node 20.19.2 | Pin Node-20-compatible versions (§5.6). Revisit when the box gets Node 22 | pnpm `use-node-version=22.x` (downloads a Node runtime; another moving part on a shared box) |
| D2 | How the Worker and the SPA are built | Separate builds: `vite build` produces `dist/`; `wrangler.jsonc` points `main` at `worker/index.ts` with `assets.directory: ./dist`. `vite preview` serves the SPA alone, and headless checks mock `/api/*` with `page.route` | `@cloudflare/vite-plugin` (preview runs workerd, wants AI auth, more RAM) |
| D3 | Worker tests | Plain Vitest in Node with a pure `handle(request, env, ctx)` and fakes | `@cloudflare/vitest-pool-workers` (workerd per run, version coupling, more RAM) |
| D4 | Shared code | Top-level `shared/llm/` with no DOM types, included by app and worker tsconfigs | Duplicate the types; import from `src/` into the Worker |
| D5 | Thickness scale | Stroke width linear in the **conditional** probability: `w = 1.5 + 18.5·p` px (1.5 px floor), transparent hit target ≥ 24 px per branch. Path probability goes in the label. Final numbers in `docs/viz/garden.md` | sqrt or area scale; cumulative-path thickness |
| D6 | Role of colour | Secondary and redundant only: a 3-step moss ramp echoing probability bands, an accent for the selected/sampled path always with outline and markers, state by marker shape and dash pattern (§3.2) | Categorical colour for state (rejected: it would carry meaning) |
| D7 | Screen-reader model | SVG branches are the tree: `<svg role="tree">` with flat `<g role="treeitem" tabindex>` + roving tabindex + WAI-ARIA tree keys. Table view is the full text alternative | A hidden HTML `<ul role="tree">` mirroring the SVG (two focus models) |
| D8 | Temperature with only top-k known | `p_i' = p_i^(1/T) / Z` over the shown k plus the remainder `r = 1 − Σp_i`, modelled as n = ceil(r / p_k) equal hidden tokens with weight n·(r/n)^(1/T) (revised 2026-10-20, see DECISIONS.md; one pseudo-token made "other" dominate at low T). T = 0 is greedy. "approximate (top-k only)" note when T ≠ 1 | Renormalise over k only; fetch the full distribution (impossible over the API) |
| D9 | Recorder output validation | The recorder (plain `.mjs`) does structural checks before writing; `src/samples/validate.ts` + its Vitest test over all sample files is the authoritative gate (slight deviation from llm-provider.md §8) | Compile the validator for the recorder; run it under a TS loader |
| D10 | KV namespace id in `wrangler.jsonc` | Omit `id` (optional in wrangler 4.86; deploy auto-provisions), so the dry run needs no account. `docs/DEPLOY.md` documents the explicit `wrangler kv namespace create` path | Commit a placeholder id |
| D11 | Default expansion of a sample | Root + its most probable recorded child (2 levels, ~10 branches visible) | Root only; the whole recording expanded |
| D12 | Deep links and share links | **Build it** (F14): `?sample=&path=&t=&seed=` for recorded gardens, kept current with `replaceState`, plus "Copy link"; `?prompt=` pre-fill for live (never auto-calls). `path` is dot-separated **rank indices** (e.g. `0.2.1`), which are unambiguous and short; token text could be ambiguous at token boundaries. Cost ≈ 70 lines across phases 4, 6, 7, 10. Value: educators link to an exact fork, the gallery and launch posts link to striking views, and it is fully offline with no server storage | Hash routing; text paths; server-stored shares (rejected: storage, privacy, cost); no URL state |
| D13 | Worker `Env` types | Hand-written `Env` interface + `@cloudflare/workers-types` | `wrangler types` (generated-file churn) |
| D14 | Phase 10 size contingency | If the phase 10 diff exceeds ~450 lines, split at the provider/UI seam: 10 = `workerProvider` + `cachedProvider` + tests, 11 = live UI; later phases shift by one and deployment stays last. Record the split in DECISIONS.md | Accept a larger PR |
| D15 | When the visual identity lands | **Phase 2**, right after the toolchain and before the tree encoding, so every screenshot from phase 2 on (and the README/gallery/social images later) shows the real identity and the encoding spec builds on final tokens | Fold into phase 1 (too big); land with packaging at the end (every earlier screenshot and review would be against a throwaway look) |
| D16 | Fonts | Self-host two subsets via `@fontsource` (Plex Mono 500 latin ~15 KB, Instrument Serif Italic latin ~22 KB); UI text uses the system stack | System stacks only (0 KB but no distinctive identity, and screenshots differ per OS); subsetting fonts ourselves (needs fonttools + brotli in the toolchain) |
| D17 | Counting phase size | Exclude lockfiles, sample/fixture JSON, images, and **verbatim standard texts** (`LICENSE`, `CODE_OF_CONDUCT.md` = Contributor Covenant 2.1) from the ~400-line budget; the verifier diffs those against the upstream text instead | Count them (would push the packaging phase over budget for no review value) |
| D18 | Hero GIF | Dev-only script `scripts/brand/hero-gif.mjs` takes a screenshot sequence with the one headless browser and encodes it with the system `ffmpeg` (present on this box; not a project dependency). The output is committed; CI never runs it. If ffmpeg is missing it exits with a clear message and README keeps the PNG hero | Playwright `recordVideo` (needs Playwright's own ffmpeg download); an npm GIF encoder dependency |
| D19 | Social preview | Rendered from a static template `docs/brand/social-preview.html` (logo + pitch + the real hero screenshot inlined as a data URL) at 1280×640 by a harness flow. Uploading it in GitHub settings is manual for Sean (STATUS follow-up; the API does not support it) | Hand-drawn image; generated by an external service |
| D20 | Live demo link | Placeholder `https://reasontrail.example` (reserved TLD) everywhere a demo URL is needed; `docs/DEPLOY.md` lists the files to update after Sean deploys | Guess a workers.dev URL (would be wrong or misleading) |
| D21 | Code of conduct contact | Contributor Covenant 2.1 with the contact "the maintainers, via a private report to @geekplux on GitHub" (no email address invented) | A new email address (none exists) |

### 5.8 Reasoning map: modules (from phase 11)

```
shared/session/                  DOM-free TypeScript; used by the app, the CLI, the Worker and tests
  types.ts                       SessionGraph, Step, Edge, Lane, Episode, Trouble, Outcome, LabelOverlay (TSDoc)
  jsonl.ts                       tolerant line reader: counts malformed lines, skips a partial last line
  adapter.ts                     SessionAdapter interface, registry, sniff(firstLines) -> adapter id
  adapterContract.ts             reusable contract suite every adapter must pass
  adapters/claudeCode.ts         phase 11
  adapters/codex.ts, grokBuild.ts   phase 18
  adapters/chat.ts, chatExports.ts  phase 23
  build/steps.ts                 normalized events -> steps + edges (+ provenance)
  build/tools.ts                 tool name -> category (read|search|edit|write|run|web|agent|plan|other), file touches, exit status
  build/episodes.ts              deterministic segmentation into episodes (§5.11)
  build/trouble.ts               retry / error streak / revert / rewind / interrupt / churn (§5.11)
  build/outcome.ts               changed files, last verification, final answer
  build/graph.ts                 buildGraph(events, opts) -> SessionGraph (the one entry point)
  redact.ts                      §5.13
src/map/                         renderer (phases 13, 17, 18)
  Outline.tsx                    text-first view (the first local viewer and the permanent text alternative)
  layout.ts, keyboard.ts         pure, unit-tested
  MapView.tsx, TaskCard.tsx, RouteView.tsx, LaneView.tsx, TroubleMarker.tsx, OutcomeCard.tsx
  DetailPanel.tsx, RawRecord.tsx, HonestyLabel.tsx, HowToReadMap.tsx
  loadGraph.ts                   embedded <script type="application/json"> | bundled sample | parsed file
src/viewer/main.tsx + viewer.html   second Vite entry: the local viewer (no site chrome)
src/site/                        website-only: Showcase.tsx, Gallery.tsx, Install.tsx (phase 19)
src/intake/                      DropZone.tsx, parse.worker.ts (Web Worker using shared/session), messages.ts
src/sessions/samples/<id>.graph.json   redacted, trimmed real samples (generated, committed)
src/lens/                        LensLink.tsx, sentences.ts, lens samples index (phase 22)
fixtures/sessions/               small synthetic raw transcripts per source (adapter tests, skill evals)
cli/                             own package.json; zero runtime dependencies
  src/main.ts, args.ts, locate/{claudeCode,codex,grokBuild}.ts, html.ts, open.ts, installSkill.ts
  dist/cli.mjs, dist/viewer.html  build output (not committed)
skills/reasontrail/            anatomy bar: SKILL.md, kit/, references/, audit/, evals/, codex/
tools/session-samples.json       which local sessions become samples (ids, trim ranges, titles)
scripts/inline-viewer.mjs        dist-viewer/ -> one self-contained viewer.html
scripts/audit-samples.mjs        R3
worker/structure/                handler.ts, prompt.ts, schema.ts (phase 20)
```

### 5.9 Data flow

1. **CLI (primary).**
   1. `locate` picks a session (§5.12), and `jsonl.ts` streams it in lines.
   2. `sniff` picks the adapter, which emits normalized events.
   3. `buildGraph` adds steps, edges, lanes, episodes, trouble and outcome.
   4. `--share` runs `redact` over every string field.
   5. `html.ts` injects the graph into the `viewer.html` template as `<script type="application/json" id="tg-session">`, escaping `<`, U+2028 and U+2029.
   6. It writes the file and opens it. No server is started.
2. **Website.** A sample's `graph.json` is bundled (the default) or lazy-imported (the others). A dropped file goes to `parse.worker.ts`, which runs the same `shared/session` code, and the result is drawn by the same `MapView`.
3. **AI (opt-in).** The client builds redacted summaries, sends them in batches to `POST /api/structure`, and merges the response as a `LabelOverlay` keyed by step id.
4. **Lens.** `LensLink` passes the selected sentence (prefix ≤ 1000 chars) to the garden. It uses recorded lens data when present, and otherwise the opt-in `workerProvider` against `/api/next-tokens`.

### 5.10 Step-graph model (recommendation; final in phase 11, D22)

```ts
interface SessionGraph {
  schemaVersion: 1;
  source: { kind: 'claude-code' | 'codex' | 'grok-build' | 'chat'; sessionId: string; file?: string;
            agent?: string; model?: string; cwd?: string; startedAt?: string; endedAt?: string };
  title: string;                  // first user request, trimmed
  lanes: Lane[];                  // 'main' + one per subagent {id, name, agentType, spawnedBy: stepId, status}
  steps: Step[];                  // in time order
  edges: Edge[];                  // next | result-of | spawned | retry-of | reverts | forks (+ supports, from AI overlay only)
  episodes: Episode[];            // {id, title, kind: explore|change|verify|delegate|answer|discuss, stepIds, laneId}
  trouble: Trouble[];             // {id, kind, stepIds, count, resolved: boolean, summary}
  outcome: Outcome;               // {files: {path, edits, created}[], lastVerification?: {stepId, command, ok}, answerStepId?}
  stats: { steps: number; skippedLines: number; unknownRecords: number; durationMs?: number };
  expect?: { task: string; files: string[]; trouble: number; final: 'ok'|'error'|'unknown' };  // samples only (M2)
}
interface Step {
  id: string; seq: number; t?: string; laneId: string;
  kind: 'user' | 'assistant' | 'thinking' | 'tool-call' | 'tool-result' | 'system' | 'compaction';
  text?: string;                  // preview ≤ 2000 chars
  textStored?: false;             // thinking with signature only (M6)
  tool?: { name: string; category: ToolCategory; summary: string; files: string[]; callId?: string };
  status?: 'ok' | 'error' | 'interrupted';
  raw: { file: string; line: number; uuid?: string; excerpt?: string };   // provenance, mandatory
}
```

Rules:
- Provenance is mandatory on every step.
- AI labels never live in the graph. They are a separate `LabelOverlay { model, createdAt, labels: {stepId, label, confidence}[], links: {claimStepId, supportStepIds[]}[] }`.
- The schema is versioned; bump `schemaVersion` on any breaking change.

### 5.11 Deterministic structuring (no AI)

**Episodes.** A new episode starts at:
- every real user message (not a tool result);
- every subagent spawn (a `delegate` episode in the main lane, with its own lane);
- a change of dominant tool category after ≥ 3 steps (for example read/search → edit/write → run);
- the final assistant text after the last tool call (`answer`).

The title is deterministic: the user request's first line, or "<Verb> <main file or command>" (for example "Edit src/garden/state.ts", "Run pnpm test ×3"). An episode holds at most 40 steps; longer stretches split by file.

**Trouble patterns.** Each is labelled "detected pattern" and lists its evidence steps:

| Kind | Rule |
|---|---|
| `error-streak` | ≥ 2 consecutive failed tool results (`is_error`, non-zero exit, or `status: failed`). `resolved` if a later run of the same command succeeds |
| `retry` | The same tool, with normalized input, called again after a failure within 10 steps |
| `revert` | An edit whose new text restores a previous edit's old text on the same file, or a `git checkout/restore/revert/reset` of a touched file |
| `rewind` | A Claude Code `parentUuid` with more than one child (an edited or rewound prompt). The abandoned branch is shown as a dead-end side path |
| `interrupt` | A user interruption (`[Request interrupted by user]`, Codex/Grok cancel events) or a user message correcting the course right after an error |
| `churn` | ≥ 4 edits to the same file within one episode |

**Outcome.**
- Files: edits and writes, minus files whose net change was reverted.
- Last verification: the last `run` step whose command matches test, build, lint or typecheck patterns, and its result.
- Answer: the last assistant text in the main lane.

### 5.12 Locating sessions

| Source | Store (verified on this box unless noted) | `--current` | Latest for cwd |
|---|---|---|---|
| Claude Code | `~/.claude/projects/<cwd with every non-alphanumeric char replaced by "-">/<sessionId>.jsonl`, plus `<sessionId>/subagents/agent-*.jsonl`, each with a `.meta.json` holding `agentType`, `description` and the spawning `toolUseId`. Large tool outputs are in `<sessionId>/tool-results/*.txt` | `CLAUDE_CODE_SESSION_ID` (present in the agent's Bash environment on this box) | the newest `*.jsonl` by mtime in the encoded-cwd directory |
| Grok Build | `${GROK_HOME:-~/.grok}/sessions/<url-encoded cwd>/<sessionId>/`, with `updates.jsonl` as the authoritative log, `summary.json` (title, model, `created_at`, `last_active_at`) and `subagents/`. Documented in Grok's local README "Session Persistence" and seen on this box | `GROK_SESSION_ID` (documented for hook processes; phase 18 checks whether tool processes get it too) | the highest `summary.json.last_active_at` in the encoded-cwd directory. IDs are UUIDv7 and sort by time |
| Codex CLI | `${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl` (public format; **no Codex install or session on this box**) | no documented env var; uses "latest for cwd" | the newest rollout whose first `session_meta` record has `cwd` equal to the current directory |

The session file may still be growing while the CLI reads it, so the reader stops at the last complete line. `--list` shows candidates from all three stores.

### 5.13 Redaction policy (D24)

- **Where it applies:**
  - **On:** committed samples, `--share` files, "Save shareable copy", and everything sent to `/api/structure`.
  - **Off:** the local private view (it is the user's own machine and session), which has a "Preview redacted" toggle.
- **Rules:** R1 patterns, R4 record drops, and long tool outputs truncated to 2,000 chars in previews and 4 KB in raw excerpts.
- **Samples:** after automatic redaction, the main agent reads every sample's task, episode titles and outcome before committing it. `pnpm audit:samples` runs in CI. The optional local `.redact-denylist` (gitignored) lets Sean add names that must never appear, without the names being written anywhere in the repo.

### 5.14 Cloudflare pieces, AI and caching added for the map

- **Worker.** One more route, `POST /api/structure` (phase 20), in the same Worker and `run_worker_first: ["/api/*"]`. It reuses `TG_CACHE` (key `st:v1:<model>:<sha256(batch)>`, 30-day TTL), `RL_ALL`/`RL_MISS`, the daily budget (one batch counts as one upstream call), the 10 s timeout with one retry on 5xx, and the upstream selector from phase 9.
- **Model.** `llm-integration` picks a Workers AI instruct model that supports JSON-schema output (`response_format`) in phase 20, from the docs, and records it in DECISIONS.md. The OpenAI-compatible upstream works too.
- **Where AI is used, and only there:**
  1. the optional labelling pass (X);
  2. optional live growth in the lens;
  3. offline, dev-time recording of lens samples with the existing recorder.

  Parsing, episodes, trouble, outcome, redaction, layout and the CLI are deterministic code.
- **Caching.** Samples are bundled or lazy chunks with long-cache headers. The client caches label overlays per session hash in memory. KV caches structure batches and next-token prefixes. The CLI does not cache, since parsing is fast and deterministic.
- **Not used:** D1, R2, Durable Objects and any server-side session storage.

### 5.15 Open decisions for the reasoning map (recommendations; the main agent records them in `docs/DECISIONS.md`)

| # | Decision | Recommendation | Alternatives |
|---|---|---|---|
| D22 | Step-graph schema | §5.10: flat `steps` + typed `edges`, with lanes, episodes, trouble and outcome derived deterministically. Provenance is mandatory. AI labels are a separate overlay. `schemaVersion: 1` | A nested tree per turn (cannot express rewinds or retries); storing raw records in the graph (size, privacy) |
| D23 | Dead-end and backtrack detection | The deterministic rules in §5.11, each labelled "detected pattern" with evidence steps and unit tests per rule. "Dead end" as a semantic claim is left to the optional AI overlay | AI-only detection (violates "deterministic first"); no trouble markers (fails the glance goal) |
| D24 | Redaction policy | §5.13: on for samples, sharing and AI; off for the private local view, with a preview toggle; regex + entropy + record drops; CI audit; local untracked denylist | Always redact (hurts the private debugging use); never redact locally *and* when sharing (unsafe) |
| D25 | npm package name | Placeholder. `cli/package.json` is `"name": "reasontrail"`, `"private": true` until Sean approves publishing. Bin is `reasontrail`. Docs write `npx reasontrail` through one constant, `PKG_NAME`, in `cli/src/meta.ts` and `docs/_pkg.md`. Before publishing, the skill kit falls back to `REASONTRAIL_CLI` or `node <repo>/cli/dist/cli.mjs` | Pick and reserve a name now (the rename is pending); a scoped name (decide together with the rename) |
| D26 | CLI default output | **A self-contained static HTML file**, opened with the system opener. No server, so no process is left behind on a RAM-tight machine. It is also shareable as is and works from `file://`. A `--serve` mode is a good-first-issue (watch mode) | A local HTTP server (lingering process, port conflicts, nothing to share) |
| D27 | How the skill finds the *current* session | Environment first (`CLAUDE_CODE_SESSION_ID`, `GROK_SESSION_ID`), then "latest for cwd" per §5.12, and always print which file was used. Claude Code's SKILL.md can also pass `${CLAUDE_SESSION_ID}` if the substitution is supported; phase 14 checks this and keeps the env var as the primary path | Ask the user (breaks zero config); always "latest" (wrong when two sessions run in one directory) |
| D28 | Sample selection | Three Claude Code sessions from **this project**: (1) an implementer phase with failing tests that were fixed; (2) a verifier round that returned FAIL and a fix round; (3) a planner research session with subagents. Plus one Grok Build sample, only if a session on the box is neutral and non-finance after redaction (otherwise a synthetic Grok fixture), and one synthetic Codex sample. Each is trimmed to ≤ 400 steps and ≤ 250 KB of graph JSON. The main agent reads each before commit | Synthetic samples only (loses "watch the agents that built this app"); full untrimmed sessions (size, privacy) |
| D29 | Where the honesty label lives | In the task card (always visible, one line + "How to read"); repeated in the detail panel for assistant and thinking steps; "detected pattern" and "suggested by <model>" on derived markers; a sentence on the website showcase and in the README | A one-time dismissible banner (forgotten after one view); footer only (never read) |
| D30 | Grok Build status | **Supported in phase 18** from the documented local format: ACP `session/update` records with `sessionUpdate` ∈ {`user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `turn_completed`, …}, `rawInput`/`rawOutput`, and `status` `completed`/`failed`. Grok scans `~/.claude/skills/`, so one skill install serves Claude Code and Grok. Open item, not a blocker: the format has no published stability guarantee, and `GROK_SESSION_ID` in tool processes is unverified | Pluggable interface only, no adapter (the format is known, so this would waste it) |
| D31 | Codex status | Build the adapter from the public rollout format (`session_meta`, `turn_context`, `response_item` of type message / reasoning / function_call / function_call_output / custom_tool_call, and `event_msg`) with a hand-written fixture. STATUS.md says "Codex: not verified against a real session (no Codex on this box)" until one is available | Skip Codex (it is in the brief) |
| D32 | Viewer packaging | A second Vite entry (`viewer.html`) built to `dist-viewer/`, then `scripts/inline-viewer.mjs` inlines the one JS chunk, the CSS and the two woff2 fonts (base64) into a single template. No new dependency | `vite-plugin-singlefile` (a dependency); a viewer without fonts (identity lost) |
| D33 | Running TypeScript for the CLI and tools on Node 20 | Build with Vite/Rolldown in SSR mode (`vite build --ssr cli/src/main.ts`, `vite.cli.config.ts`) to `cli/dist/cli.mjs`. Tools call the built CLI, so there is no TS loader dependency | `tsx` (a dependency); Node 22 type stripping (not on this box) |
| D34 | Website routing | Query parameters on the existing `urlState` (`?session=`, `?view=open|install|lens`), with garden links (`?sample=`) still opening the lens. No router dependency | `react-router` (a dependency for 4 views); hash routing |
| D35 | The old live prompt box (old phase 10) | Dropped. Its provider half (`workerProvider` + `cachedProvider`, client caps and messages) is built inside the lens phase 22 and runs only on explicit opt-in | Build it as planned (no user for it in the new product) |
| D36 | npm publish | Treated like deploy: the final phase verifies `pnpm --dir cli pack` and documents `npm publish`. Publishing waits for Sean's approval | Publish early (irreversible name and version) |
| D37 | Where the CLI writes by default | `<os.tmpdir()>/reasontrail/<source>-<sessionId>.html`: private, outside the repo, overwritten on re-run. `--share` writes `./reasontrail-<shortId>.html` in the current directory | Always the current directory (litters repos with unredacted transcripts) |


---

## 6. Phases

### 6.0 Conventions that apply to every phase

- **Branch / PR:** `phase-<n>-<slug>`, one PR per phase, stacked with `gh stack`. Size estimates count changed lines excluding lockfiles, sample/fixture JSON, images and verbatim standard texts (D17). Docs are listed separately because they review quickly.
- **CHANGELOG:** every phase adds a line under `## [Unreleased]` in `CHANGELOG.md` describing the user-visible change.
- **Who does what:**
  - `implementer` builds each phase.
  - `llm-integration` owns the provider interface, recorder, Worker, live client and `docs/EXTENDING.md` provider sections (phases 4 provider part, 6 recorder, 8, 9, 10 provider part). For mixed phases the main agent runs `llm-integration` first for its files, then `implementer` for the UI, sequentially.
  - `dataviz-designer` reviews identity screenshots in phase 2, writes `docs/viz/garden.md` at the start of phase 3 from §3, adds temperature/sampled-path rows in phase 7, and reviews screenshots after the implementer in phases 2, 3, 4, 7, 10 and 12 (gallery, hero, social preview).
  - `a11y-reviewer` reviews every UI phase (1, 2, 3, 4, 5, 6, 7, 10) after the implementer and before the verifier, and checks alt text and template wording in phases 11–12.
  - `verifier` signs off every phase.
- **Test hooks (stable selectors, set in phase 1 and kept):**
  - `[data-testid="garden"]` on the `<svg>` gets `data-ready="true"` after the first layout.
  - Each branch `<g>` has `data-key` (continuation key), `data-p` (conditional probability, 4 decimals) and `data-state` (`expandable` | `expanded` | `leaf` | `not-recorded` | `loading` | `error` | `depth-limit`).
  - Thickness is readable from `[data-role="branch-stroke"]` `stroke-width`.
- **Browser check harness** (`pnpm check:browser [--flows a,b|all] [--out <dir>] [--no-build] [--fail-after-launch]`):
  1. Builds unless `--no-build` is passed.
  2. Starts `vite preview --host 127.0.0.1 --port ${TG_PORT:-4317} --strictPort` **detached in its own process group** and records the PID.
  3. Waits for HTTP 200 (20 s timeout).
  4. Launches `playwright-core` `chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--disable-dev-shm-usage','--disable-gpu','--no-first-run'] })`.
  5. Runs flows sequentially in **one** browser. Each flow is a module in `scripts/browser/flows/` exporting `run({ page, context, baseURL, shot, log })`.
  6. Collects console errors, page errors, failed requests and non-same-origin requests, and exits non-zero on any of them.
  7. Always closes the browser and kills the process group (SIGTERM, then SIGKILL after 3 s) in `finally` and on SIGINT/SIGTERM.
  8. Prints `cleanup: browser closed, server pgid <n> terminated`.

  The default out dir is `.tmp/screenshots/` (gitignored). The verifier passes `--out docs/screenshots/phase-<n>`. Each phase adds its own flow; `--flows all` runs every flow so far. Brand flows (`hero`, `gallery`, `brand`) write to their committed destinations and are excluded from `all`.
- **Common verifier steps:**
  1. `pnpm install --frozen-lockfile`.
  2. `pnpm lint`, `pnpm typecheck`, `pnpm test` (single run), `pnpm build`.
  3. `pnpm check:size` (from phase 2), `pnpm check:docs` (from phase 11), and `pnpm build && pnpm run check:deploy` (from phase 8).
  4. `pnpm check:browser --flows all --out docs/screenshots/phase-<n>`, then look at every screenshot.
  5. The phase-specific checks below.
  6. Hard-rule greps:
     - secrets: `git grep -nE "(sk-[A-Za-z0-9]{20,}|CLOUDFLARE_API_TOKEN=|OPENAI_API_KEY=.+)"`;
     - no `next`/`remix` in `package.json`;
     - nothing under `.github/workflows/`;
     - no finance content (prompts, samples, docs, launch copy);
     - no mention of Sean's employer;
     - no deploy executed.
  7. `ps -eo pid,cmd | grep -E "vite|chrome|wrangler|workerd|ffmpeg|node .*record" | grep -v grep` shows nothing the verifier started.
  8. Commit the screenshots.

  Every UI phase's flow screenshots both 1280×800 and 390×844 viewports. The CVD and axe helpers are used from the phase that introduces them onward.

### 6.0a Conventions from phase 10 on (they add to or override 6.0)

- **Sign-off order for every UI phase:**
  1. `implementer`;
  2. `lead-designer`, who must return `DESIGN: APPROVED`, together with `a11y-reviewer` (axe, keyboard, screen reader, CVD, reduced motion);
  3. `verifier`, who may only PASS after both sign-offs, recorded in the PR body.

  `dataviz-designer` contributes to DESIGN.md's map encoding in phase 10 and reviews phases 17 and 21. `llm-integration` owns phases 20 and 21 (Worker/AI parts) and the lens provider half of phase 22. For mixed phases, the owners run sequentially on the branch.
- **Size, honestly:** the target is ≤ ~450 changed lines, excluding lockfiles, fixtures, sample JSON, images and verbatim standard texts (D17). Past phases came in at ~2× their estimates, so the estimates below include that history. Each phase names a **split seam**. If the diff passes ~550 lines, the main agent splits at that seam, renumbers the later phases and records it in DECISIONS.md.
- **Map test hooks:**
  - `[data-testid="map"]` gets `data-ready="true"`, and `performance.mark('tg:map-ready')` fires.
  - Steps and episodes carry `data-step-id` / `data-episode-id`, `data-kind`, `data-status` and `data-lane`.
  - Trouble markers carry `data-trouble-kind` and `data-count`.
  - The four glance regions carry `data-region="task|route|trouble|outcome"`.
- **New harness capabilities:**
  - `check:browser` gains `--file <path>`, which opens a `file://` URL in the one browser, and the request listener fails on *any* request for `file://` pages.
  - CLI flows run the built CLI with `--no-open` and `HOME`/`GROK_HOME`/`CODEX_HOME` pointed at a temporary sandbox under `.tmp/`, never the real home directories.
- **Extra common verifier steps:**
  - `pnpm build:cli` and `pnpm test:cli` (from 13);
  - `pnpm audit:samples` (from 12);
  - `pnpm skill:audit && pnpm skill:evals` (from 14);
  - `pnpm check:docs` (from 25);
  - no real session file, `.redact-denylist` or home path is committed (`git grep -nE "/home/[a-z]|/Users/[A-Za-z]"` clean outside the redaction tests' synthetic corpus).
- **Screenshots** go under `docs/screenshots/phase-<n>/`, at 1280×800 and 390×844, light and dark, plus CVD variants wherever a phase adds colour.

<!-- Phases 1-8: unchanged (open PRs). -->

### Phase 1: Toolchain and the built-in sample path
- **Branch:** `phase-1-toolchain`
- **Goal:** a working pnpm + Vite 8 + React 19 + TS project with lint, typecheck, tests, build, CI definition and a self-cleaning headless-browser check, rendering a tiny bundled sample garden as a basic tree. The repo is MIT-licensed from the first commit.
- **User value:** opening the app already shows a real distribution (five branches of different thickness) with no key and no network; contributors get a one-command check (`pnpm check:browser`) that never leaves processes behind.
- **Scope:**
  - **Project config:** `package.json` (license MIT; scripts `dev`, `build`, `preview`, `lint` = `oxlint --deny-warnings`, `typecheck`, `test` = `vitest run`, `check:browser`), `pnpm-lock.yaml`, `.nvmrc`, `vite.config.ts` (with the Vitest `test` block), `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` (Q1 flags), `.oxlintrc.json` (plugins `react`, `typescript`, `jsx-a11y`, `vitest`; deny `no-explicit-any`), `index.html` (`lang="en"`, title, description, no external resources).
  - **App:** `src/main.tsx`, `src/App.tsx`, `src/styles.css` (system font stack; phase 2 replaces it), `src/samples/types.ts`, `src/samples/index.ts`, `src/samples/lighthouse.json` (tiny hand-checked fixture: root = the 5 real spike tokens from llm-provider.md §4, two illustrative child lists, `"model": {"provider": "fixture", ...}`; phase 6 replaces it), `src/garden/buildTree.ts` (+ test), `src/garden/GardenView.tsx` (minimal horizontal `d3-hierarchy` `tree()`, `<path>` links with `stroke-width = 1.5 + 18.5·p`, token labels, `<title>` with the percentage, the §6.0 test hooks), `src/App.test.tsx` (happy-dom: prompt + 5 branch labels), `performance.mark('tg:garden-ready')`.
  - **Browser harness:** `scripts/check-browser.mjs`, `scripts/browser/lib.mjs`, `scripts/browser/axe.mjs` (inject `axe-core/axe.min.js`, fail on serious/critical), `scripts/browser/flows/smoke.mjs`.
  - **CI and repo files:** `ci/github-workflow.yml` (ubuntu, pnpm 9, Node 20.19: install, lint, typecheck, test, build, check:browser), `.gitignore` (`node_modules`, `dist`, `.tmp/`, `.wrangler/`, `.dev.vars`), `LICENSE` (MIT, "Copyright (c) 2026 geekplux and token-garden contributors"), `CHANGELOG.md` (Keep a Changelog skeleton with an `[Unreleased]` entry), minimal `README.md` (one-line pitch + "Develop" section; phase 11 rewrites it).
- **Acceptance criteria:**
  1. On Node 20.19.2 / pnpm 9.15.9: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (≥ 3 tests) and `pnpm build` all exit 0. Vite is v8.
  2. `pnpm check:browser --out <dir>` exits 0, writes `smoke-desktop.png` and `smoke-mobile.png`, prints the cleanup line, and afterwards no preview or Chrome process from it remains.
  3. `pnpm check:browser --fail-after-launch` exits non-zero **and** leaves no preview or Chrome process behind.
  4. The page shows the prompt and the root's 5 branches. `[data-p]` order matches label order, and `stroke-width` strictly increases with `data-p`.
  5. No console errors; no requests except same-origin assets (O1); axe reports 0 serious/critical.
  6. `ci/github-workflow.yml` exists, nothing is under `.github/workflows/`, `LICENSE` is the verbatim MIT text, `package.json` `license` is `MIT`.
- **Verifier checks:** the common steps; the cleanup-on-failure run (AC3) followed by `ps`; flow `smoke`; `a11y-reviewer` light pass (landmarks, title, lang, SVG has a name).
  - **Screenshots** (`docs/screenshots/phase-1/`): `smoke-desktop.png`, `smoke-mobile.png`.
- **Risks:** TypeScript 7 (native compiler) may break `tsc` or plugins: fall back to `~6.0` (D1). Chrome may need `--no-sandbox` in this container: add it only if launch fails and note it. Port collisions with other agents: `TG_PORT` + `--strictPort`.
- **Size:** ~400 lines (~130 config/CI, ~150 harness, ~120 app and tests); LICENSE excluded.

### Phase 2: Visual identity and app shell
- **Branch:** `phase-2-identity`
- **Goal:** implement §3: colour tokens for light and dark, self-hosted type, the logo mark, wordmark and favicon, and the app shell layout with the specimen label, plus the size budget and CVD harness that guard them.
- **User value:** the first view looks like a crafted, recognisable product rather than a dev page, reads well in light and dark and for colour-blind users, and stays fast (budgets enforced from now on).
- **Scope:**
  - `src/styles/tokens.css` (all §3.2 hex values, type scale, spacing; light default + `@media (prefers-color-scheme: dark)`), `src/styles/base.css` (layout grid, focus ring: 2 px `--tg-focus` + 2 px paper offset; global reduced-motion rule), delete `src/styles.css`.
  - `src/styles/colorMath.ts` (contrast + Machado matrices) and `src/styles/tokens.test.ts` (parses `tokens.css`; asserts every §3.2 contrast row and the ΔE ≥ 20 rows for both themes).
  - Fonts: add `@fontsource/ibm-plex-mono` and `@fontsource/instrument-serif`; import only `latin-500.css` and `latin-400-italic.css` in `main.tsx`.
  - `src/brand/LogoMark.tsx`, `src/brand/Wordmark.tsx` (§3.5), `public/favicon.svg`, `public/logo.svg`; `index.html` gets favicon links, `<meta name="theme-color">` for both schemes, `og:title`/`og:description`, and a `<noscript>` note.
  - `src/components/AppShell.tsx` (header with wordmark, `main`, footer with the offline/privacy line and source link) and `src/components/SpecimenLabel.tsx` (prompt, "recorded with", k, date); `GardenView` uses tokens and the mono font (label width estimate `chars × 0.6em`).
  - `scripts/check-size.mjs` + `check:size` script (P1 budgets, Q2 runtime dependency allowlist).
  - `scripts/browser/cvd.mjs` (Machado matrices as an SVG `feColorMatrix` filter on `<html>`; protan, deutan, tritan) and `scripts/browser/flows/identity.mjs`.
- **Acceptance criteria:**
  1. DS1: `tokens.test.ts` passes; `git grep -nE "#[0-9a-fA-F]{3,6}\b" -- 'src/**/*.tsx'` finds nothing.
  2. DS2: the first view requests exactly two font files, both same-origin, ≤ 45 KB total; the favicon is served; the header shows the wordmark (mono "token", serif-italic "garden") next to the mark.
  3. Light and dark (`emulateMedia({colorScheme:'dark'})`) screenshots show the specimen label, wordmark and garden with no element under the §3.2 contrast targets (axe colour-contrast clean).
  4. `pnpm check:size` passes and fails when an extra runtime dependency is added to `package.json` (checked by the verifier on a scratch copy, not committed).
  5. At 1280×800 the whole default garden, the specimen label and the header are above the fold; at 390×844 nothing overflows horizontally except the garden's scroll container.
  6. `dataviz-designer` reviews the screenshots against §3 and lists no open deviations; `a11y-reviewer` passes contrast, landmarks and focus ring.
- **Verifier checks:** the common steps + `check:size`; flow `identity`: font request audit, landmark roles, wordmark element screenshot at `deviceScaleFactor: 3`, dark and CVD screenshots.
  - **Screenshots:** `identity-desktop.png`, `identity-mobile.png`, `identity-dark.png`, `identity-cvd-protanopia.png`, `identity-cvd-deuteranopia.png`, `identity-cvd-tritanopia.png`, `wordmark@3x.png`, `favicon-tab.png` (the favicon rendered at 64×64 via an `<img>` on `about:blank`).
- **Risks:** font swap shifting the header (mitigated by fallback stacks with similar metrics and fixed header height); the identity drifting into decoration (designer review against §3; no gradients, no 3D).
- **Size:** ~340 lines (~110 CSS, ~90 brand/shell components, ~80 tests, ~60 scripts).

### Phase 3: Garden visual encoding
- **Branch:** `phase-3-garden-encoding`
- **Prep (before the implementer):** `dataviz-designer` writes `docs/viz/garden.md`, committed as the first commit on this branch, derived from §3 and D5/D6. It must contain: the question the visualization answers; a data-to-encoding table (horizontal tidy tree with root left and fixed `nodeSize` so growth never reflows ancestors; thickness per D5; token labels with visible whitespace (`·` for spaces, `↵` for newlines); numeric label on hover/focus; an "other tokens" remainder stub (dashed, non-interactive, labelled with its share); marker shapes and dash patterns per §3.6 state; the 3-step colour ramp as a secondary channel); a thickness legend with direct labels (5%, 25%, 75%); the path readout; interaction and motion per §3.4; empty/loading/error states per §3.6; mobile behaviour; label truncation and minimum spacing rules; checkable acceptance criteria. The palette must pass the dataviz skill's validator.
- **Goal:** render the garden exactly as specified, from pure, unit-tested layout and scale modules.
- **User value:** the distribution is readable at a glance (thick = likely, exact numbers on demand, the "everything else" share is visible), which is the core "aha" of the product.
- **Scope:**
  - `src/garden/layout.ts` (+ test: deterministic positions; ancestors don't move when a leaf is added).
  - `src/garden/scales.ts` (+ test: thickness values, probability band → colour token, `formatPct` (`44.7%`, `<0.1%`), visible-whitespace formatting).
  - `src/garden/linkPath.ts` (+ test).
  - Rewrite `src/garden/GardenView.tsx`; add `src/garden/Legend.tsx` and `src/garden/PathReadout.tsx`; hover label driven by a `selectedKey` prop that phase 5 reuses for focus.
  - `scripts/browser/flows/garden.mjs`.
- **Acceptance criteria:**
  1. Every row of the spec's encoding table is implemented; the designer lists no open deviations.
  2. Thickness for p = 0.05/0.25/0.75 equals the spec values (unit test); rendered `stroke-width` matches `scales.ts` for every branch.
  3. Hovering a branch shows its percentage computed from `data-p` (never hard-coded); the path readout shows prompt + continuation.
  4. The remainder stub shows `1 − Σp` and is not focusable or clickable.
  5. Light and dark meet A4 contrast; CVD screenshots keep all state cues distinguishable without colour (a11y-reviewer confirms).
- **Verifier checks:** the common steps; flow `garden`: hover the thinnest branch and compare label text with `data-p`, measure stroke widths, dark-mode and CVD screenshots.
  - **Screenshots:** `garden-desktop.png`, `garden-mobile.png`, `garden-hover-thin.png`, `garden-dark.png`, `garden-cvd-protanopia.png`, `garden-cvd-deuteranopia.png`, `garden-cvd-tritanopia.png`.
- **Risks:** label collisions on dense levels (spec defines `nodeSize` and truncation); spec scope creep (the designer limits the spec to what phases 3–7 build).
- **Size:** ~380 lines of code and tests, plus ~150 lines of spec.

### Phase 4: Explore recorded gardens and share links
- **Branch:** `phase-4-explore-share`
- **Goal:** click to grow or collapse branches from recorded data through the provider interface, with a calm "not in this recording" state, gentle motion, and a URL that always reopens the current fork.
- **User value:** the user can follow the story the model might tell, branch by branch, at no cost, and can send someone a link to exactly the fork they are looking at.
- **Scope:**
  - **`llm-integration`:** `shared/llm/types.ts` (exactly as llm-provider.md §3, with TSDoc, Q1); `src/llm/recordedProvider.ts`; `src/llm/providerContract.ts` (reusable contract suite: sorted desc, length ≤ k, `logprob ≤ 0`, deterministic, k clamped to [1, 8]); `src/test/fixtures/tiny-garden.json` (depth 3 on one path plus an unrecorded branch; unit tests stop depending on `src/samples/`).
  - **`implementer`:**
    - `src/garden/state.ts` (+ test): reducer with `expanded` set, per-node status, `selectedKey`; actions `expand`, `collapse`, `toggle`, `select`, `openPath`; default expansion per D11.
    - Click wiring in `GardenView`; `src/components/states/InlineNote.tsx` (info / not-recorded / error variants: glyph + text, §3.6) anchored at the branch.
    - Growth and reshape transitions in CSS per §3.4, zeroed under reduced motion.
    - `src/app/urlState.ts` (+ test): `path` as rank indices (D12), parse/serialize round-trip, invalid input tolerated; `replaceState` on selection change.
    - `src/components/ShareButton.tsx` ("Copy link", Clipboard API with select-text fallback, live-region announcement).
    - `performance.mark` around expansion for P3; `scripts/browser/flows/explore.mjs`.
- **Acceptance criteria:**
  1. F1 default expansion; F3 expand/collapse by click; F4 no-request note for unrecorded branches; F6 readout follows the selection.
  2. The provider contract suite passes for `RecordedProvider`; `not_recorded` is a `ProviderError` with that code.
  3. F14 for the tiny sample: selecting a depth-3 branch updates `?path=`; reloading that URL restores expansion and selection with 0 requests; `?path=9.9` restores the longest valid prefix with the notice; "Copy link" writes the URL (checked via `context.grantPermissions(['clipboard-read','clipboard-write'])`).
  4. A5: with reduced motion emulated, computed `transition-duration` on branches is `0s`, non-zero otherwise.
  5. P3 holds (median of 3 ≤ 200 ms); `check:size` passes.
  6. The dataviz-designer approves the motion, not-recorded and share screenshots; the a11y-reviewer passes (axe clean).
- **Verifier checks:** the common steps; flow `explore`: expand a recorded branch and assert the new `data-key`s, collapse it, click an unrecorded branch and assert the note plus 0 requests, share-link round-trip, broken link, reduced-motion check, timing.
  - **Screenshots:** `explore-default.png`, `explore-expanded.png`, `explore-not-recorded.png`, `explore-shared-link.png`, `explore-broken-link.png`, `explore-mobile.png`.
- **Risks:** SVG `d` interpolation is not universal (fallback: transition opacity and stroke-width only); `replaceState` on every selection is cheap but must not fire during keyboard repeat storms (debounce 100 ms).
- **Size:** ~390 lines.

### Phase 5: Keyboard navigation and screen-reader alternative
- **Branch:** `phase-5-keyboard-a11y`
- **Goal:** the garden is fully operable and understandable without a mouse or without sight.
- **User value:** keyboard and screen-reader users get the same experience, and speakers can drive the demo from the keyboard on stage.
- **Scope:**
  - `src/garden/keyboard.ts` (+ test), pure `(visibleTree, focusedKey, key) -> action`: Up/Down previous/next visible branch; Right expand or first child; Left collapse or parent; Home/End; Enter/Space toggle. (Type-ahead is cut: a good-first-issue, §7.)
  - `GardenView`: roving `tabindex` and ARIA per D7; focus shows the numeric label (reuses `selectedKey`); visible focus ring from phase 2; pointer hit targets ≥ 24 px.
  - `src/garden/TableView.tsx` plus a toggle button (A3).
  - `src/components/LiveRegion.tsx`: polite announcements ("Grew ‘ looked’: 5 branches, top ‘ out’ 30.1 percent", not-recorded notes, link copied).
  - `scripts/browser/flows/keyboard.mjs`: keyboard-only, never uses the mouse.
- **Acceptance criteria:**
  1. A1: from page load, Tab reaches the garden; arrow keys reach the least probable branch at every level; Enter expands and collapses; focus is never lost after a collapse (it moves to the collapsed node).
  2. A2: accessible names and `aria-*` values are correct (checked with `page.accessibility.snapshot()` or role queries, spot-checked by the a11y-reviewer).
  3. A3: the Table view lists exactly the visible branches with the same percentages as the SVG.
  4. A6: axe clean in the default view and the Table view.
  5. The a11y-reviewer passes keyboard, screen-reader and contrast checks.
- **Verifier checks:** the common steps; flow `keyboard`: Tab, ArrowDown to the last sibling and assert the focus label, Enter, ArrowRight, Left, Left, toggle the Table view, axe.
  - **Screenshots:** `keyboard-focus-thin.png`, `keyboard-expanded.png`, `table-view.png`, `table-view-mobile.png`.
- **Risks:** screen-reader support for ARIA roles inside SVG varies. If the a11y-reviewer finds the tree unusable, keep the visual SVG focus model and make the Table view the primary SR path; record it in DECISIONS.md.
- **Size:** ~360 lines.

### Phase 6: Sample recorder and six recorded gardens
- **Branch:** `phase-6-recorded-samples`
- **Goal:** real recorded gardens for 6 everyday prompts, a reproducible recorder with a one-command entry point, and a sample picker with `?sample=` links.
- **User value:** six genuinely different gardens to explore offline (confident vs. uncertain forks), each honestly labelled with the model that grew it; contributors can record their own garden with one command.
- **Scope:**
  - **`llm-integration`:** `tools/record-samples/`:
    - `package.json` (`@huggingface/transformers` pinned exactly) plus its own `pnpm-lock.yaml`.
    - `record.mjs` with flags `--provider local-onnx|worker`, `--url`, `--prompts`, `--only <id>`, `--prompt <text> --id <id> --title <title>` (single garden), `--k 5`, `--full-depth 2`, `--spine-depth 6`, `--spine-paths 2`, `--out`, `--cache-dir`. The worker provider is implemented but not run (no token). Recording: fetch the top 20 per position, decode each id singly, drop empty/special/U+FFFD tokens, take the top k, round to 3 decimals, tie-break by token, write stable key order.
    - `prompts.json` (the 6 prompts and ids from llm-provider.md §4).
    - `README.md`: install with `pnpm install --ignore-workspace --ignore-scripts` (skips onnxruntime-node's CUDA download; verify CPU inference still works, otherwise use the documented onnxruntime install flag), run, add the garden to the app, clean up (`rm -rf node_modules .cache`).
    - Root script `samples:record` = install-if-needed + `node tools/record-samples/record.mjs "$@"`.
  - **The recording run:** once, ≤ ~700 MB RSS, with no browser running. Commit `src/samples/{lighthouse,robot,language,autumn,recipe,cat}.json`. Then `rm -rf tools/record-samples/node_modules <cache-dir>`. `.gitignore` adds `tools/record-samples/.cache/`.
  - **`implementer`:** `src/samples/validate.ts` (+ `validate.test.ts` over every file in `src/samples/`, rules from llm-provider.md §4); `src/samples/index.ts` (6 samples, default `lighthouse`); `src/components/SamplePicker.tsx` (radio-group semantics, keyboard operable); `sample` in `urlState` (F2, F14); the specimen label shows the model attribution and recording date (F12); `scripts/browser/flows/samples.mjs`.
- **Acceptance criteria:**
  1. Six sample files pass validation; each has ≥ 31 recorded nodes (depth 2 fully expanded), 2 spines to depth 6, and is ≤ 15 KB; `check:size` still passes.
  2. Re-running `--only cat --out /tmp/tg-rerecord` produces output byte-identical to the committed file (or ≤ 0.002 logprob difference with the reason documented).
  3. `git ls-files tools/` lists only the source, lockfile, `prompts.json` and README; no `node_modules` or model files.
  4. F2: the picker switches gardens; `?sample=cat` opens the cat garden; `?sample=nope` falls back with the §3.6 notice; `?sample=cat&path=0.1` restores that fork.
  5. O2: after load, going offline still lets the user switch samples, expand branches and open a share link.
  6. Content: all prompts and visible top branches are neutral, everyday and non-finance. The implementer skims every root list and replaces any prompt whose top branches are inappropriate (recorded in DECISIONS.md).
- **Verifier checks:** the common steps; re-record one prompt **before** any browser run, then delete its node_modules and cache (skip with a documented reason only if the download fails); flow `samples`: picker by mouse and keyboard, deep link, offline toggle, expand a depth-5 spine node.
  - **Screenshots:** `samples-picker.png`, `samples-cat-deeplink.png`, `samples-spine-depth5.png`, `samples-offline.png`, `samples-mobile.png`.
- **Risks:** ~750 MB install and ~600 MB RSS on a RAM-tight box (run alone, then clean up); Hugging Face download needs network (retry once, then blocker); tokenizer artefacts (decode-and-filter); onnxruntime thread nondeterminism (pin `intraOpNumThreads: 1`).
- **Size:** ~400 lines (recorder ~220, app and tests ~180); sample JSON excluded.

### Phase 7: Temperature, sampling and uncertainty
- **Branch:** `phase-7-temperature-sampling`
- **Goal:** make temperature and sampling visible with zero model calls, and explain how to read it.
- **User value:** the "second wow": one drag shows what temperature does, one click shows what a sampler does, reproducibly (seed) and shareably (`t`, `seed` in the link), with a short explanation for learners.
- **Scope:**
  - The dataviz-designer first adds temperature and sampled-path rows to `docs/viz/garden.md` (docs change in this PR).
  - `src/llm/temperature.ts` (+ test, D8): T = 1 identity; T = 0 all mass on the argmax; probabilities sum to 1 including the remainder (tempered as hidden tokens, D8); lowering T sharpens monotonically and never grows "other".
  - `src/garden/entropy.ts` (+ test): entropy in bits over the shown k plus the remainder, low/medium/high bands from the spec.
  - `src/garden/samplePath.ts` (+ test): seeded mulberry32; walks expanded and recorded nodes; returns the path and a stop reason; same seed, same path.
  - `src/components/TemperatureControl.tsx`: native `<input type="range">` with `<label>` and `<output>`, presets "0 (greedy)", "1.0", "1.5".
  - "Sample a path" and "New seed" buttons; sampled-path highlight (outline + diamond markers, §3.4 walk); entropy in the focus label and Table view.
  - `src/components/HowToRead.tsx` (`<details>`, ≤ 120 words: thickness, numbers, temperature, the top-k approximation, what "recorded" means).
  - `t` and `seed` in `urlState`; live-region announcements; `scripts/browser/flows/temperature.mjs`.
- **Acceptance criteria:**
  1. F7: moving the slider changes `stroke-width` and labels for every visible branch with 0 network requests.
  2. F8: sampling with a fixed seed is reproducible; the sentence and stop reason are shown and announced.
  3. F14: `?sample=recipe&t=1.5&seed=7` reopens with that temperature and the same sampled path.
  4. P4: with the largest sample fully expanded, a one-step slider change re-renders in ≤ 100 ms (median of 3).
  5. The keyboard alone operates the slider, presets, sampling and the details panel; the a11y-reviewer and dataviz-designer pass it.
- **Verifier checks:** the common steps; flow `temperature`: T = 0.2/1/1.8 width comparison, seeded sample twice (equal), request count 0, link round-trip, P4 timing.
  - **Screenshots:** `temp-0.2.png`, `temp-1.0.png`, `temp-1.8.png`, `sampled-path.png`, `sampled-path-cvd-deuteranopia.png`, `how-to-read.png`, `temp-mobile.png`.
- **Risks:** users misreading the top-k approximation (explicit note + HowToRead); re-render cost (memoize layout, which does not depend on T; recompute widths only).
- **Size:** ~390 lines.

### Phase 8: Worker core: `/api/next-tokens` with KV cache
- **Branch:** `phase-8-worker-core`
- **Owner:** `llm-integration`
- **Goal:** a tested Worker endpoint that turns a prefix into a normalized top-k list through Workers AI, cached in KV, with the full error envelope.
- **User value:** the foundation for growing your own text without any key in the browser; repeated prefixes are free and fast thanks to the cache.
- **Scope:**
  - `wrangler.jsonc`: `name: "token-garden"`, `main: "worker/index.ts"`, a recent `compatibility_date`; `assets: {directory: "./dist", not_found_handling: "single-page-application", run_worker_first: ["/api/*"]}`; `ai: {binding: "AI"}`; `kv_namespaces: [{binding: "TG_CACHE"}]` (D10); `vars: {MODEL_ID: "@cf/zai-org/glm-4.7-flash", UPSTREAM: "workers-ai"}`.
  - `tsconfig.worker.json` and the `Env` interface (D13).
  - `worker/index.ts`, `worker/handler.ts`, `worker/validate.ts` (body ≤ 4 KB, JSON, NFC, 1–1000 chars, control chars, k 1–8), `worker/errors.ts`, `worker/cache.ts` (SHA-256 key, slice to k, `waitUntil` put, put failure logged not surfaced), `worker/upstream/workersAi.ts` (system prompt and params from llm-provider.md §1.4/§5; thinking-token-first response → `upstream_error`).
  - `shared/llm/normalize.ts`, `shared/llm/parseOpenAiLogprobs.ts`.
  - `worker/test/fakes.ts` and tests for every status code in llm-provider.md §5.
  - Package: devDeps `wrangler@~4.86`, `@cloudflare/workers-types`; script `check:deploy` = `wrangler deploy --dry-run --outdir .wrangler/dry-run`; script `dev:worker` = `wrangler dev` (documented as needing valid Cloudflare auth); `typecheck` includes the worker tsconfig; `check:size` asserts the Worker has no runtime deps.
  - `scripts/smoke-workers-ai.mjs`: exactly one REST call to `.../ai/run/@cf/zai-org/glm-4.7-flash` with `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`; prints the `top_logprobs` length and first token; with a missing or invalid token exits 0 with `SKIPPED: no valid Cloudflare token`, never printing the token.
- **Acceptance criteria:**
  1. Unit tests cover: 200 on a miss (`cached: false`, KV entry exists after `waitUntil`) and a hit (`cached: true`, AI fake not called); 400/413/405; 502 for null, empty or thinking-first logprobs; 503 when `AI` is missing; smaller k sliced from the cached 8; `normalize` merges duplicates with log-sum-exp and drops special/empty tokens.
  2. `parseOpenAiLogprobs` is tested on `worker/test/fixtures/glm-response.json` (hand-written from the published schema).
  3. `pnpm build && pnpm run check:deploy` succeeds with no valid token and lists the `AI`, `TG_CACHE` and `ASSETS` bindings and the vars.
  4. `node scripts/smoke-workers-ai.mjs` prints `SKIPPED...` on this box; the live-call blocker stays in STATUS.md.
  5. Sample mode is unchanged (`check:browser --flows all` passes).
- **Verifier checks:** the common steps + `check:deploy` + the smoke script; inspect `.wrangler/dry-run/` for the bundle and grep it for secrets; regression `check:browser --flows all --out docs/screenshots/phase-8` (screenshots may equal phase 7's). No live Workers AI call is required.
- **Risks:** Workers AI logprob behaviour unverified (smoke script, OpenAI-compatible fallback in phase 9); wrangler may try to authenticate during the dry run because of the placeholder token (blank `CLOUDFLARE_API_TOKEN` inside the script and record it); wrangler + workerd ~100 MB on disk.
- **Size:** ~400 lines (~200 source, ~200 tests).

### Phase 9: Worker limits, budget, OpenAI-compatible upstream and extending docs (built; shared infrastructure)
- **Branch:** `phase-9-worker-limits` (already built on this branch: `85923a7`, `7bd93c2`)
- **Owner:** `llm-integration`
- **Goal:** protect any upstream model call with per-IP rate limits, a daily budget, a timeout and a single retry, and make the upstream swappable. This was planned for the old live prompt box. It is kept because the same Worker serves the two AI uses that remain: the optional AI structuring pass (`/api/structure`, phase 20) and opt-in live growth in the zoom-in lens (`/api/next-tokens`, phase 22).
- **User value:** the showcase's optional AI features stay up and free for everyone without a user key. Self-hosters can point their deployment at any OpenAI-compatible server, following `docs/EXTENDING.md`.
- **Scope (as built):**
  - `worker/limits.ts`: `RL_ALL` on every request (checked before the method check, so it also counts 405s), and `RL_MISS` only before an upstream call. Keyed by `CF-Connecting-IP`; 429 with `Retry-After: 60`; a limiter failure fails open and is logged.
  - `worker/budget.ts`: KV `budget:<UTC date>`, read before the upstream call and incremented via `waitUntil` after success. TTL 2 days; 503 `budget_exhausted` at the cap; cache hits never count; the cap is soft.
  - `worker/upstream/openaiCompatible.ts`, `worker/upstream/chat.ts` (shared chat-request shaping) and `worker/upstream/select.ts` (by `UPSTREAM`). The OpenAI-compatible body omits `chat_template_kwargs`.
  - Upstream `AbortSignal.timeout(10_000)` and one retry, only on an HTTP 5xx from an HTTP upstream.
  - `wrangler.jsonc`: `ratelimits` `RL_MISS` (20/60 s) and `RL_ALL` (120/60 s), plus `vars.DAILY_UPSTREAM_CAP: "1000"`. `.dev.vars.example` has an empty `OPENAI_API_KEY=`.
  - Tests with fakes and a mocked `fetch`.
  - `docs/EXTENDING.md`: the provider interface and contract suite, adding a Worker upstream, recording a garden, theming. Phase 18 adds "Add a session adapter".
- **Acceptance criteria:** (unchanged)
  1. The 21st miss within one window from the same IP returns 429 with `Retry-After`; hits are only limited by `RL_ALL`.
  2. At `DAILY_UPSTREAM_CAP` the response is 503 `budget_exhausted`; hits still return 200.
  3. A timeout gives `upstream_error`; a 5xx is retried once; a 4xx is not retried.
  4. `UPSTREAM=openai-compatible` without a key returns 503 `unavailable`; with a mocked fetch it parses into the same response.
  5. `check:deploy` lists both ratelimit bindings; no secret values in any committed file.
  6. Every code path, command and file named in `docs/EXTENDING.md` exists.
- **Verifier checks:** the common steps + `check:deploy`; regression `check:browser --flows all --out docs/screenshots/phase-9`; read-through of `docs/EXTENDING.md`. The PR description adds a paragraph explaining why this phase survived the repositioning.
- **Risks:** KV counters are not atomic, so the cap is soft (accepted). The free tier allows ~1,000 KV writes a day, which fits a cap of 1000.
- **Size:** about 477 insertions and 52 deletions against phase 8, docs included.

### Phase 10: Design audit and `docs/DESIGN.md` (docs phase)
- **Branch:** `phase-10-design`
- **Owners:** `lead-designer` (writes it), `dataviz-designer` (map encoding section review), `a11y-reviewer` (reviews the accessibility sections). There is no implementer.
- **Goal:** a buildable design spec for the reasoning map, so that every later UI phase has one reference and checkable design acceptance criteria.
- **User value:** the map answers its four questions in seconds and has a distinctive identity people want to share. It is designed once, not improvised phase by phase.
- **Scope:**
  - `docs/DESIGN.md`:
    - concept and the "understand it at a glance" brief (the four questions);
    - references studied, as principles only;
    - type, keeping Plex Mono and Instrument Serif unless a reasoned change is recorded;
    - colour: extends `tokens.css` with lane, status and trouble tokens. Each pair lists WCAG contrast and protan/deutan/tritan ΔE, and the tokens pass the dataviz skill's validator. Colour is never alone: every hue is paired with a shape, line style or label;
    - spacing and grid; motion with a reduced-motion fallback;
    - the **map's visual grammar**: node kinds, episodes, lanes and subagents, edges, the trouble glyphs (retry loop, revert arrow, rewind fork, error streak, interrupt, churn), the outcome card, provenance and "Show raw", and where the honesty label sits (D29);
    - glance layouts at 1280×800 and 390×844;
    - the detail panel and the outline view;
    - empty, loading (parsing progress), error, partial-parse, unsupported-file and huge-file states;
    - local viewer vs website chrome; the showcase home; the drop zone; the lens transition;
    - logo and wordmark (kept, with a note for the pending rename);
    - numbered design acceptance criteria `DM1…DMn` that the lead-designer uses at each sign-off.
  - Audit of the current UI: `pnpm check:browser --flows all --out docs/screenshots/phase-10`, an annotated list of what to keep or change, and an "audit" section in DESIGN.md.
  - Wireframes: hand-written SVGs, `docs/design/glance.svg`, `docs/design/glance-mobile.svg` and `docs/design/detail.svg`, drawn with counts from a real session on this box (redacted, with no text that could identify anything private).
  - A note at the top of PLAN.md §3, already present: DESIGN.md supersedes §3 from phase 10.
- **Acceptance criteria:**
  1. DESIGN.md has every section listed above, and each `DM` criterion can be checked from a screenshot or the DOM.
  2. Every new colour token has its contrast and ΔE rows. Text is ≥ 4.5:1 and marks ≥ 3:1 in both themes. Any CVD pair under ΔE 20 is justified by a non-colour cue.
  3. The glance wireframe visibly answers the four questions, and the lead-designer's 5-second protocol is written down.
  4. `a11y-reviewer` approves the keyboard model, outline view, focus order and reduced-motion rules. `dataviz-designer` approves the encoding.
  5. No finance content, no copying of Sean's study sites, no decorative 3D, no employer mention.
- **Verifier checks:** headings present (`grep`); every referenced file exists; the audit screenshots are committed; no application code in the diff (`git diff --stat` shows only `docs/`).
  - **Screenshots:** `audit-*.png` (current garden UI, desktop, mobile, dark) and the wireframe SVGs rendered to PNG in the one browser.
- **Risks:** a spec too large to build. The lead-designer marks each item with the phase that builds it (13, 17, 18, 19, 22, 24).
- **Size:** ~450 lines of docs plus SVGs; 0 code.

### Phase 11: Session model and Claude Code adapter
- **Branch:** `phase-11-session-model`
- **Owners:** `implementer`.
- **Goal:** a typed, deterministic step-graph model and a Claude Code adapter that turns a real transcript into steps, edges and lanes, with no AI.
- **User value:** the foundation of everything. A session you never have to reread is turned into structured data on your machine, and nothing leaves it.
- **Scope:**
  - `shared/session/{types.ts, jsonl.ts, adapter.ts, adapterContract.ts}`.
  - `shared/session/adapters/claudeCode.ts`:
    - Records to use: `user` (string content = a user turn; `tool_result` parts with `is_error`), and `assistant` (`text`, `thinking` with empty text → `textStored: false`, `tool_use`). Uses `uuid`, `parentUuid`, `isSidechain`, `timestamp`, `cwd`, `gitBranch` and `toolUseResult` (stdout/stderr/interrupted).
    - Records to ignore and count: `api-request*`, `attachment`, `atis-latch`, `cost-state`, `mode`, `queue-operation`, `custom-title`/`agent-name` (used for the title only), `pr-link`, `last-prompt`.
    - Subagents: `subagents/agent-*.jsonl` + `.meta.json` become lanes linked by `toolUseId`. Large outputs referenced in `tool-results/` are noted as such and not inlined.
  - `shared/session/build/{steps.ts, tools.ts, graph.ts}`: tool categories and file touches for `Read`, `Edit`, `Write`, `Bash`, `Grep`, `Glob`, `Agent`, web tools and unknown tools.
  - Synthetic fixtures `fixtures/sessions/claude-code/*.jsonl` (hand-written, ≤ 60 lines each). They cover a user prompt, text, empty thinking, a tool call and its result, an error, an interrupt, a rewind fork, a subagent with meta, unknown record types, a malformed line and a partial last line.
  - The tsconfigs include `shared/session`.
  - Real-session smoke test `shared/session/real.test.ts`, skipped unless `TG_REAL_SESSIONS` lists paths. It parses them and logs counts and timings; it never prints content.
- **Acceptance criteria:**
  1. The adapter contract suite passes: deterministic output, time order, every step has provenance, unknown records are counted, malformed and partial lines are counted, and nothing throws on any fixture.
  2. Fixture assertions cover lanes and spawn edges, `thinking` with `textStored: false`, error and interrupted statuses, rewind `forks` edges, and file touches for Edit/Write/Read.
  3. Byte-identical JSON on two runs (M7).
  4. On this box, `TG_REAL_SESSIONS=<3 real paths incl. the 9 MB subagent file> pnpm vitest run shared/session/real.test.ts` passes. The 9 MB file parses in ≤ 1.5 s, and the verifier reports the counts only.
  5. `shared/session` has no DOM types and no Node-only imports (it must run in a Web Worker and in Node).
- **Verifier checks:** the common steps; the real-session run above; the sandbox greps (no real transcript content in fixtures). No UI change, so the `check:browser --flows all` regression only.
- **Risks:**
  - The undocumented Claude Code format drifts: tolerant reader, ignore-unknown, contract tests.
  - Fixtures accidentally copied from real sessions: synthetic only, reviewed by the verifier.
- **Size:** ~480 (types 120, adapter 160, build 90, tests 110). **Split seam:** `build/tools.ts` file-touch extraction moves to phase 12.

### Phase 12: Deterministic structuring and redaction
- **Branch:** `phase-12-structure-redact`
- **Owners:** `implementer`.
- **Goal:** episodes, trouble patterns and outcome (§5.11), plus the redaction module and sample audit (§5.13).
- **User value:** the step list becomes "what happened": a handful of named episodes, where it got stuck and what changed. Anything shared or committed is safe to share.
- **Scope:**
  - `shared/session/build/{episodes.ts, trouble.ts, outcome.ts}`, wired into `graph.ts`.
  - `shared/session/redact.ts` (R1, R4) with `redactGraph(graph) -> {graph, summary}`.
  - `shared/session/redact.test.ts`: the synthetic corpus (≥ 40 cases, R2). Synthetic secrets are built at runtime from fragments, so no literal secret-shaped string sits in the repo where it could trip scanners.
  - `scripts/audit-samples.mjs` + `pnpm audit:samples`. It scans `src/sessions/samples/`, `fixtures/` and `skills/**/evals/`, and reads `.redact-denylist` if present (gitignored).
  - Fixtures extended for each trouble rule.
- **Acceptance criteria:**
  1. Each trouble rule has a positive and a negative fixture test. `resolved` is computed correctly for error streaks.
  2. The episode rules give ≤ 12 top-level episodes for every fixture and for each real session in `TG_REAL_SESSIONS` (count only).
  3. Outcome: reverted files are excluded; the last verification and answer step are correct on fixtures.
  4. R1–R4 hold; `pnpm audit:samples` fails on a planted temporary file, checked by the verifier on a scratch copy and not committed.
  5. M7 still holds.
- **Verifier checks:** the common steps; the real-session counts (episodes, trouble by kind) for the 3 sessions, with no content printed.
- **Risks:**
  - Heuristics mislabel: they are labelled "detected pattern" with evidence and provenance, and thresholds live in one constants file.
  - Redaction false positives hide useful text: the guards in R2, and the local view is unredacted.
- **Size:** ~450. **Split seam:** redaction becomes its own phase.

### Phase 13: CLI and local viewer (outline first)
- **Branch:** `phase-13-cli-viewer`
- **Owners:** `implementer`; `lead-designer` + `a11y-reviewer` sign off the outline view.
- **Goal:** `npx reasontrail` turns the latest or current Claude Code session into a self-contained HTML file and opens it. The page shows the designed, text-first outline map (task card, numbered episodes with trouble glyphs, outcome, honesty label). This is the first working end-to-end path.
- **User value:** one command, a few seconds, and the user can see what their agent did. It works offline, makes no server or upload, and the file can be shared (`--share` redacts).
- **Scope:**
  - **Rename to Reasontrail (2026-10-20):** root and `cli/` `package.json` names `reasontrail`, bin `reasontrail`; `<title>`, meta/OG text, wordmark and logo `<title>` say Reasontrail (per DESIGN.md); README/CHANGELOG mentions; source URLs `github.com/geekplux/reasontrail`; tests and flows updated. Folder name and historical docs unchanged.
  - `cli/package.json` (D25, `private: true`, bins, `engines`, zero deps).
  - `vite.cli.config.ts` (SSR build → `cli/dist/cli.mjs`, D33).
  - `cli/src/{main.ts, args.ts, meta.ts, locate/claudeCode.ts, locate/index.ts, html.ts, open.ts}`, implementing C1–C5 for Claude Code. `--list`, `--current`, `--latest`, `--share`, `--json`, `--out` and `--no-open` all work. Exit codes as in C2.
  - Viewer: `viewer.html`, `src/viewer/main.tsx`, `src/map/{loadGraph.ts, Outline.tsx, HonestyLabel.tsx}`, `vite.viewer.config.ts`, `scripts/inline-viewer.mjs` (D32).
  - Root scripts `build:viewer`, `build:cli` (viewer first, then the CLI; copies `viewer.html` into `cli/dist/`) and `test:cli`.
  - `cli/test/*.test.ts`: argument parsing, location in a sandbox `HOME` with fixture sessions, HTML escaping (a `</script>` inside a transcript), and redaction under `--share`.
  - Harness: `--file` mode; flow `scripts/browser/flows/cli.mjs` runs the CLI on a fixture with `--no-open`, opens the file and asserts the glance text regions (M1 a, b, d as text) and zero requests.
- **Acceptance criteria:**
  1. C1, C2 (Claude Code), C3, C4 and C5. The CLI dist has no `node_modules` requirement (`node cli/dist/cli.mjs --version` works from a clean copy of `cli/dist`).
  2. On this box, `node cli/dist/cli.mjs --latest --no-open` from the project directory writes the HTML for the newest token-garden session, and the verifier opens it and screenshots it. The verifier keeps the file in `.tmp/` and does **not** commit it (it is unredacted), so for this run the screenshots must also not be committed. Committed screenshots come from fixtures or `--share` output only.
  3. A transcript containing `</script><script>alert(1)</script>` renders as text.
  4. The outline view meets G1 (outline part) and M5; `lead-designer`: `DESIGN: APPROVED`; `a11y-reviewer` passes.
- **Verifier checks:** the common steps; `pnpm build:cli`; CLI unit tests; flow `cli`; `ps` shows no opener or browser left; output size check.
  - **Screenshots:** `cli-outline-desktop.png`, `cli-outline-mobile.png`, `cli-outline-dark.png`, `cli-share-redacted.png` (fixture-based).
- **Risks:**
  - `file://` restrictions (module scripts and fonts): use an inline classic script and inline data-URL fonts.
  - The opener misbehaves in headless or SSH sessions: no opener without `DISPLAY`/`WAYLAND_DISPLAY` on Linux, and the path is printed.
  - The session file is being written during the run: the reader ignores the partial line.
- **Size:** ~550 (CLI 230, viewer + outline 170, inliner 50, tests 100). **Split seam:** 13a CLI + `--json` / 13b viewer + HTML.

### Phase 14: The `reasontrail` skill (Claude Code; Grok reads the same directory)
- **Branch:** `phase-14-skill`
- **Owners:** `implementer`; `lead-designer` reviews the skill's user-facing text.
- **Goal:** `/reasontrail` in Claude Code opens the current session's map and replies with its path. It is packaged to the wheresryan22/anatomy bar and installed with one command.
- **User value:** the primary entry point. The user never leaves their session or learns a command line.
- **Prep:** read the anatomy repository read-only in `/tmp` (then delete the clone) and follow its structure exactly. Record any deviation in DECISIONS.md.
- **Scope:**
  - `skills/reasontrail/SKILL.md`: frontmatter `name: reasontrail` and a `description` that says when to use it ("show how this session reasoned / map this session"). Steps: run the kit; report the path; offer `--share`. Privacy statement. Honesty statement.
  - `skills/reasontrail/kit/run.mjs`: resolves the CLI (`npx --yes reasontrail@<version>` once published; until then `REASONTRAIL_CLI` or the repo's `cli/dist/cli.mjs`). It passes `--current` and prints exactly one line, `MAP: <path>`, for the agent to relay.
  - `references/`: `formats.md` (the three stores, §5.12), `privacy.md` (what is read and written, nothing uploaded, `--share`), `troubleshooting.md` (no session found, wrong session, no browser).
  - `audit/audit.mjs` (`pnpm skill:audit`): frontmatter fields and length limits; every referenced file exists; the kit makes no network calls (static check plus a sandbox run); no absolute home paths; no secrets.
  - `evals/cases.json` + `evals/run-evals.mjs` (`pnpm skill:evals`): ≥ 8 cases, each running the kit in a sandbox `HOME` with fixture sessions and `--no-open`. Covered: current via env, latest fallback, two sessions in one directory, no session, a malformed file, `--share`, a path with spaces, and a subagent session. Trigger-phrase cases are listed for manual model-in-the-loop runs (no key on this box), and the README of evals says so.
  - `cli/src/installSkill.ts`: `npx reasontrail install-skill [--target claude|grok|codex|all] [--dry-run] [--force]`. Claude → `~/.claude/skills/reasontrail/`. Grok → nothing extra when `~/.claude/skills` exists, because Grok scans it; otherwise `~/.grok/skills/`. Codex → phase 18.
  - Check whether Claude Code substitutes `${CLAUDE_SESSION_ID}` in SKILL.md, and record the result (D27).
- **Acceptance criteria:**
  1. C6 (Claude and Grok targets) and C7. `skill:audit` and `skill:evals` pass.
  2. `install-skill --dry-run` in a sandbox `HOME` lists the exact files. A real install into the sandbox, then a second install, reports "unchanged". A modified installed file blocks a reinstall without `--force`.
  3. Every evaluation runs with no network and leaves no process.
  4. The real `~/.claude/skills` on this box is untouched (the verifier compares listings before and after).
- **Verifier checks:** the common steps; audit; evals; sandbox install; one manual end-to-end run on this box. In a throwaway shell with `CLAUDE_CODE_SESSION_ID` set to a real token-garden session id, `node skills/reasontrail/kit/run.mjs --no-open` prints `MAP:`, and the HTML stays in `.tmp/`, not committed.
  - **Screenshots:** `skill-map-fixture.png` (the file from an eval case).
- **Risks:**
  - The skill formats differ or change: the audit pins the frontmatter rules; references are dated.
  - The skill triggers when it should not: a narrow description, with negative eval cases listed.
- **Size:** ~420 (SKILL + references ~150 docs, kit 60, audit 80, evals 90, installer 80).

### Phase 15: Real redacted samples ("watch the agents that built this app")
- **Branch:** `phase-15-samples`
- **Owners:** `implementer`; the main agent reviews every sample's content before commit.
- **Goal:** 3–5 committed, redacted, trimmed sample graphs from real sessions on this box (D28), generated reproducibly with the CLI.
- **User value:** the website and README show real agent work right away, without a key or a session of your own.
- **Scope:**
  - `tools/session-samples.json`: id, title, source, session id, step range and why it is interesting. These are local ids only; nothing private.
  - `pnpm samples:sessions`: runs `cli.mjs <file> --share --json --trim <from>:<to>` for each entry → `src/sessions/samples/<id>.graph.json`, then adds the `expect` block (M2).
  - `src/sessions/samples/index.ts` (default + lazy).
  - The samples' `expect` blocks are reviewed by hand.
- **Acceptance criteria:**
  1. Each sample is ≤ 250 KB, has ≤ 400 steps, has at least 1 trouble marker (at least one sample has a subagent lane), and passes `audit:samples` and schema validation.
  2. The main agent has read each sample's task, episode titles, raw excerpts and outcome: no secrets, emails, home paths, employer, finance or private content. Recorded in the PR body.
  3. Running `samples:sessions` again on this box gives byte-identical files.
- **Verifier checks:** the common steps; `audit:samples`; grep the samples for `@`, `/home/` and token prefixes; open each via the CLI `--json` round-trip.
  - **Screenshots:** `sample-<id>-outline.png` for each.
- **Risks:** private content slips through (automatic redaction + denylist + human read + small trims). The sessions mostly contain this project's own work, which is the intended demo.
- **Size:** ~200 lines plus sample JSON (excluded).

### Phase 16: Reasoning map v1, the glance view
- **Branch:** `phase-16-map-glance`
- **Owners:** `implementer`; `dataviz-designer` (encoding review), `lead-designer` + `a11y-reviewer` sign off.
- **Goal:** draw the map from DESIGN.md: task card, route of episodes with subagent lanes, trouble markers, outcome card and honesty label. It becomes the default view of both the local viewer and the website. The outline stays one toggle away.
- **User value:** the "wow". In about five seconds, without clicking, you see what the task was, how the agent went about it, where it struggled, and what it changed.
- **Scope:**
  - `src/map/layout.ts` (+ test): pure layout of episodes along the route and lanes below or above. The mono width estimate means no text measurement. Deterministic, and ≤ 300 ms for 5,000 steps (G2).
  - `src/map/{MapView.tsx, TaskCard.tsx, RouteView.tsx, LaneView.tsx, TroubleMarker.tsx, OutcomeCard.tsx, MapLegend.tsx}`. SVG for the route, HTML for the cards.
  - Tokens added to `tokens.css` per DESIGN.md, with `tokens.test.ts` rows.
  - `urlState`: `?session=` and `?view=outline`. The website's first view becomes the default sample map. `?sample=` (garden links) still opens the garden until phase 22 adds the lens frame.
  - The viewer uses `MapView`. The flow `map.mjs` asserts M1 and M2 against each sample's `expect` block, takes the 5-second-review screenshots, CVD and dark.
- **Acceptance criteria:**
  1. M1, M2, M4 (collapsed lanes visible), M5 and M6 for every sample and for the CLI fixtures.
  2. G1: Tab reaches the map; arrows move between episodes and markers; the outline toggle works; axe is clean.
  3. G2: `tg:map-ready` ≤ 2000 ms on the website, and the layout benchmark meets its limit.
  4. `DESIGN: APPROVED`; `dataviz-designer` lists no open deviations; `a11y-reviewer` passes.
- **Verifier checks:** the common steps; flows `map`, `cli` and `garden` (regression).
  - **Screenshots:** `map-<sample>-desktop.png` for each sample, `map-mobile.png`, `map-dark.png`, `map-cvd-{protanopia,deuteranopia,tritanopia}.png`, `map-local-file.png`.
- **Risks:** long sessions crowd the route (episode folding, "+n more"); labels collide (fixed slots, truncation rules from DESIGN.md).
- **Size:** ~560 (layout 150 + tests 80, components 250, flow 80). **Split seam:** 17a layout + route / 17b cards + legend.

### Phase 17: Details on demand and provenance
- **Branch:** `phase-17-map-details`
- **Owners:** `implementer`; `lead-designer` + `a11y-reviewer` sign off.
- **Goal:** any episode, step or marker opens a detail panel with the raw record one action away, full keyboard navigation and deep links.
- **User value:** trust. Every claim on the map can be checked against what the agent actually wrote or ran.
- **Scope:**
  - `src/map/{DetailPanel.tsx, RawRecord.tsx, StepList.tsx, keyboard.ts (+ test)}`. Episode → step list → step detail.
  - Tool input and output views for Bash (command, exit status, stdout/stderr excerpts), Edit (a small inline diff from old/new strings), Read/Grep (path and pattern) and Agent (link into the lane).
  - Provenance line and "Show raw"; the honesty label for assistant and thinking steps; "thinking (text not stored)".
  - `?step=` / `#step=` (M9); a live region; Esc returns focus to the map.
  - Mobile: the panel becomes a bottom sheet.
  - Flow `details.mjs`, keyboard-only.
- **Acceptance criteria:**
  1. M3, M9, and G1 (full keyboard model: arrows, Enter, Esc, Home/End; focus is never lost).
  2. An edit diff renders the old and new text as text, never as HTML. Raw records in samples are redacted.
  3. axe is clean with the panel open; reduced motion holds.
  4. `DESIGN: APPROVED`; `a11y-reviewer` passes.
- **Verifier checks:** the common steps; flows `details` and `map`.
  - **Screenshots:** `details-bash-error.png`, `details-edit-diff.png`, `details-thinking-not-stored.png`, `details-subagent.png`, `details-mobile-sheet.png`, `details-dark.png`.
- **Risks:** large outputs (truncate with "show more", capped at 4 KB in samples); diff noise (a line diff only, no dependency).
- **Size:** ~480. **Split seam:** tool-specific views become their own phase.

### Phase 18: Codex and Grok Build adapters
- **Branch:** `phase-18-codex-grok`
- **Owners:** `implementer`.
- **Goal:** the same CLI and skill work in Codex and Grok Build sessions, through adapters that normalize to the same step graph.
- **User value:** whichever of the three agents you use, `/reasontrail` (or `npx reasontrail`) gives the same kind of map.
- **Scope:**
  - `shared/session/adapters/grokBuild.ts`: reads `updates.jsonl` session updates (D30). Chunks merge into messages; `tool_call` + `tool_call_update` become a call and its result with status. `agent_thought_chunk` becomes thinking with text. `plan` becomes a plan step. `summary.json` gives the title and model. `subagents/` become lanes.
  - `shared/session/adapters/codex.ts` (D31).
  - Synthetic fixtures for both, written from the formats. The Grok fixture's structure (not content) mirrors the box's files.
  - `cli/src/locate/{grokBuild.ts, codex.ts}` per §5.12, with `GROK_HOME` and `CODEX_HOME` respected. `--source` and `--list` cover all three. `--current` reads `GROK_SESSION_ID`, and the phase records whether Grok tool processes actually receive it.
  - Codex skill target in `installSkill.ts` (`~/.codex/skills/reasontrail/`, Agent Skills format). If current Codex docs show skills are unsupported, fall back to a custom prompt `~/.codex/prompts/reasontrail.md`, record which, and add `skills/reasontrail/codex/`.
  - Evals: +4 cases (Grok current, Grok latest, Codex latest, mixed stores).
  - `docs/EXTENDING.md`: "Add a session adapter", using the contract suite and a worked Grok example.
- **Acceptance criteria:**
  1. Both adapters pass the contract suite. Real Grok sessions on this box (`TG_REAL_SESSIONS`) parse with zero skipped lines (counts only).
  2. C1, C2 and C6 for all three sources in the sandbox. `--list` shows sources side by side.
  3. STATUS.md records: Codex not verified against a real session; Grok `--current` env status. Neither is a blocker.
- **Verifier checks:** the common steps; evals; real Grok parse counts; the EXTENDING.md walkthrough is followed literally.
  - **Screenshots:** `grok-fixture-outline.png`, `codex-fixture-outline.png`.
- **Risks:** the Codex format is not verifiable here (fixture from the public schema, flagged). Grok's format may change (tolerant reader, version noted in references).
- **Size:** ~480 (Grok 140, Codex 140, locate 80, installer and evals 60, tests 60). **Split seam:** Codex into its own phase.

### Phase 19: Website showcase, drag-and-drop and privacy
- **Branch:** `phase-19-site-showcase`
- **Owners:** `implementer`; `lead-designer` + `a11y-reviewer` sign off.
- **Goal:** the hosted site as a showcase: "Watch the agents that built this app" with the sample gallery, install instructions (skill + `npx`), how to read a map, and drag-and-drop or file-pick viewing parsed in the browser.
- **User value:** a visitor understands the product in seconds, sees real agent work, and can map their own session with no install and no upload.
- **Scope:**
  - `src/site/{Showcase.tsx, Gallery.tsx, Install.tsx}`.
  - `src/intake/{DropZone.tsx, parse.worker.ts, messages.ts}`: a Vite `?worker` import, progress, cancel, the 50 MB limit, plus unsupported, partial and empty states.
  - `src/map/HowToReadMap.tsx`.
  - `?view=open|install`; the site header and navigation per DESIGN.md.
  - Flow `site.mjs`: gallery navigation; drop a fixture `.jsonl` via `setInputFiles` and a synthetic drop; assert zero requests (V1); error states.
- **Acceptance criteria:**
  1. V1, V2 and V5; M8 states shown as designed; G2 (initial JS and lazy samples; `check:size` updated).
  2. The install section's commands match the CLI's `--help` and the skill installer exactly (the flow compares them).
  3. Offline after the first load: the gallery and drag-and-drop still work (O2 spirit).
  4. `DESIGN: APPROVED`; `a11y-reviewer` passes (the drop zone is keyboard-operable through the file picker).
- **Verifier checks:** the common steps; flows `site`, `map` and `details`.
  - **Screenshots:** `site-home-desktop.png`, `site-home-mobile.png`, `site-gallery.png`, `site-drop-parsing.png`, `site-drop-error.png`, `site-install.png`, `site-dark.png`.
- **Risks:** Web Worker bundling under Rolldown (Vite `?worker` is supported; fall back to the main thread for files under 1 MB); memory on huge files (a streaming line reader over `file.stream()`).
- **Size:** ~480. **Split seam:** intake becomes its own phase.

### Phase 20: AI structuring endpoint in the Worker (optional pass)
- **Branch:** `phase-20-ai-structure-worker`
- **Owners:** `llm-integration`.
- **Goal:** `POST /api/structure` labels redacted step summaries and links claims to the steps that support them. It is batched, cached and budgeted, reusing the phase 8/9 infrastructure.
- **User value:** for those who opt in, a semantic layer over the deterministic map (hypotheses, evidence, dead ends, decisions), with no user key and at low cost.
- **Scope:**
  - `worker/structure/{handler.ts, prompt.ts, schema.ts}`: a hand-written validator (no dependency), with input limits per X1.
  - Routing in `worker/handler.ts`; KV key `st:v1:…`; `RL_ALL`/`RL_MISS`/budget reuse.
  - A JSON-schema `response_format` for the chosen Workers AI model (recorded in DECISIONS.md, from the docs); `UPSTREAM=openai-compatible` also supported.
  - `shared/session/structure.ts`: request and response types, `buildBatches(graph)` from redacted summaries, and `mergeOverlay`.
  - Tests with fakes: a valid response; invalid JSON; unknown step ids dropped; a cache hit; 429; budget; timeout; oversize input; a `<think>`-prefixed reply rejected.
  - `worker/test/fixtures/structure-response.json`.
- **Acceptance criteria:**
  1. X1, X2 and X4 (unit level). No user key; nothing requires a live Workers AI call.
  2. `check:deploy` still passes and lists the same bindings.
  3. Batches never include unredacted text (a test runs `buildBatches` over the redaction corpus).
- **Verifier checks:** the common steps + `check:deploy`; worker tests; `check:browser --flows all` regression.
- **Risks:** the label quality of a small model (fixed label set, low temperature, schema validation, shown as suggestions); the request size limits of Workers AI models (batches ≤ 200 × 300 chars).
- **Size:** ~430 (source 200, tests 230).

### Phase 21: AI labels in the map (opt-in)
- **Branch:** `phase-21-ai-labels-ui`
- **Owners:** `llm-integration` (client batching, `--ai`), `implementer` (UI); `dataviz-designer`, `lead-designer` + `a11y-reviewer` sign off.
- **Goal:** an explicit opt-in that sends redacted batches and draws the returned labels and claim→support links as a removable overlay.
- **User value:** "why did it end up with this answer?" in one view: each final claim links to the steps that support it, labelled honestly as a model's suggestion.
- **Scope:**
  - `src/ai/{useStructure.ts, ConsentDialog.tsx, LabelBadge.tsx, SupportLinks.tsx}`: the consent dialog lists counts, the endpoint and the caching (V3). Overlay toggle; calm errors reuse the F11 messages.
  - CLI `--ai [--api <url>]` (X5): prints the summary of what will be sent, asks for confirmation unless `--yes`, and embeds the overlay in the HTML.
  - Flow `ai.mjs` with `page.route('**/api/structure')` fakes.
- **Acceptance criteria:**
  1. Zero `/api/*` requests until consent. Exactly ⌈n/200⌉ ≤ 5 requests after it. Toggling the overlay off restores the deterministic view exactly (DOM snapshot compare).
  2. X3 wording on every label; claims link to existing steps only.
  3. The website without a Worker (`vite preview`) shows "AI labels aren't available here; the map still works."
  4. Sign-offs pass.
- **Verifier checks:** the common steps; flows `ai`, `map` and `details`; CLI `--ai` against a local fake server started and killed by the test.
  - **Screenshots:** `ai-consent.png`, `ai-labels.png`, `ai-support-links.png`, `ai-unavailable.png`, `ai-cvd-deuteranopia.png`.
- **Risks:** overclaiming (honesty wording, overlay off by default); clutter (labels only at episode level by default).
- **Size:** ~420.

### Phase 22: Zoom-in lens ("zoom into this sentence")
- **Branch:** `phase-22-zoom-lens`
- **Owners:** `implementer` (wiring), `llm-integration` (recorded lens samples, live provider half from the old phase 10: `workerProvider` + `cachedProvider` + client caps); `lead-designer` + `a11y-reviewer` sign off.
- **Goal:** from any assistant-text step, pick a sentence and open the existing garden on it. Recorded lens data covers the samples offline; anything else can grow live through `/api/next-tokens` after an explicit opt-in.
- **User value:** "how sure was a model about this sentence?" One click takes you from the reasoning level to the token level, reusing the garden's encoding and keyboard work.
- **Scope:**
  - `src/lens/{LensLink.tsx, sentences.ts (+ test), LensFrame.tsx, lensSamples.ts}`. The garden is embedded with a header that says it shows an open model's predictions for that text, not the session model's computation (Z2). Back restores the map selection (Z3). `?sample=` links open the lens frame.
  - Lens samples: 2 sentences per website sample, recorded with the existing recorder (`--prompt … --id …`), committed as garden JSON (≤ 15 KB each).
  - `src/llm/{workerProvider.ts, cachedProvider.ts}` + contract suite; caps (k = 5, depth 12, 150 calls) and messages.
  - Flow `lens.mjs`.
- **Acceptance criteria:**
  1. Z1–Z3; garden F1–F8, F14 and A1–A6 regressions pass.
  2. Zero network requests for recorded lens sentences. Live growth calls only after opt-in, and repeat prefixes are free (old F9 rules).
  3. Sign-offs pass.
- **Verifier checks:** the common steps; flows `lens`, `garden`, `explore`, `keyboard` and `temperature` (regression). The recorder runs alone, then its `node_modules` and cache are deleted.
  - **Screenshots:** `lens-entry.png`, `lens-recorded.png`, `lens-live-optin.png`, `lens-back-to-map.png`, `lens-mobile.png`.
- **Risks:** prefixes longer than the Worker's 1000-char limit (use the last 1000 chars at a sentence boundary); the recorder's RAM (run alone, ~700 MB).
- **Size:** ~480. **Split seam:** the live provider half becomes its own phase.

### Phase 23: Chat transcript import
- **Branch:** `phase-23-chat-import`
- **Owners:** `implementer`; `lead-designer` + `a11y-reviewer` sign off.
- **Goal:** a map from pasted chat text and from official ChatGPT and Claude exports, with share links handled on a best-effort basis.
- **User value:** the reasoning map works for ordinary chats too, without any setup.
- **Scope:**
  - `shared/session/adapters/{chat.ts, chatExports.ts}`. Chat episodes come from user turns. Reasoning or thinking text is included when present. "Trouble" here means a regenerated answer or a user correction.
  - A paste box and the export picker in `src/intake/`.
  - Share links: **paste-text fallback only** in this phase, with the T3 message. A Worker fetch with an allowlist is a good-first-issue unless it fits the size budget.
  - Synthetic fixtures for each format.
- **Acceptance criteria:** T1–T4; the contract suite for both adapters; V1 holds; sign-offs pass.
- **Verifier checks:** the common steps; flow `chat.mjs`.
  - **Screenshots:** `chat-paste.png`, `chat-export-picker.png`, `chat-map.png`, `chat-link-fallback.png`.
- **Risks:** export formats change (tolerant readers, versioned notes in references); chats have little structure (episodes per turn, honest about it).
- **Size:** ~450.

### Phase 24: Shareable static HTML and map cards
- **Branch:** `phase-24-share-cards`
- **Owners:** `implementer`; `lead-designer` + `a11y-reviewer` sign off.
- **Goal:** sharing is polished and safe. "Save shareable copy" on the website and in the local viewer shows a redaction preview and writes a redacted self-contained HTML file. A PNG or SVG "map card" of the glance view can be dropped into a PR or a post.
- **User value:** one click to a safe artefact a teammate can open anywhere.
- **Scope:**
  - `src/share/{ShareDialog.tsx, exportHtml.ts, exportCard.ts}`. The website fetches its own `/viewer.html` template and injects the redacted graph, then downloads it as a Blob. The local viewer re-serializes its embedded graph. The card is rendered from SVG to a canvas to PNG.
  - Per-sample OG meta for the website.
- **Acceptance criteria:** V4; the downloaded HTML passes `audit:samples` rules and opens offline with zero requests; the card is 1200×630 and readable; sign-offs pass.
- **Verifier checks:** the common steps; flow `share.mjs` (download intercept, then open the file).
  - **Screenshots:** `share-dialog.png`, `share-redaction-summary.png`, `share-card.png`, `share-opened-file.png`.
- **Size:** ~380.

### Phase 25: README and community files
- **Branch:** `phase-25-readme-community`
- **Goal and scope:** as old phase 11, but for the reasoning map.
  - Pitch: "See how your AI agent reasoned: one command turns a Claude Code, Codex or Grok Build session into a map you understand at a glance. Local, no key, nothing uploaded."
  - Hero: a map screenshot from `scripts/browser/flows/hero.mjs`.
  - Quick start: the skill install + `npx reasontrail` (with the D25 placeholder note), "How it works" (adapters → step graph → map; optional AI; the lens), privacy and honesty, "Extend it" (adapters, the Worker), and a roadmap.
  - `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (D21), `SECURITY.md` (scope: the CLI's file handling, redaction, the Worker).
  - Issue templates: bug report, feature request, a `new_adapter.yml` (replacing `new_garden.yml`) and a session-sample proposal. A PR template.
  - `docs/GOOD-FIRST-ISSUES.md` (≥ 8, from §7).
  - `scripts/check-docs.mjs` + `check:docs`; CI updated in `ci/github-workflow.yml`.
- **User value:** the repo sells the product in 10 seconds and makes contributing easy.
- **Acceptance criteria and verifier checks:** old phase 11's ACs 1–4 with the new pitch. The quick start works verbatim from a fresh clone in `/tmp`, using the local CLI path until the package is published. The README rendering check is unchanged.
  - **Screenshots:** `readme-above-fold.png`, `readme-full.png`, `readme-mobile.png`.
- **Size:** ~400 (CODE_OF_CONDUCT excluded).

### Phase 26: Examples gallery, social preview, hero GIF and launch kit
- **Branch:** `phase-26-gallery-launch`
- **Goal and scope:** as old phase 12, for maps.
  - `examples/README.md`: each sample map with a screenshot, "what to notice" and links (`https://reasontrail.example/?session=<id>&step=…`, D20), plus "Map your own session" (one command).
  - Hero GIF: the skill flow, then the map, then a click on a trouble marker, recorded in the one browser + system ffmpeg (D18).
  - `docs/brand/social-preview.png`.
  - `docs/LAUNCH.md`:
    - the "nothing posted" first line;
    - Show HN and X drafts;
    - 3 demo scenarios: "What did my agent do for 40 minutes?", "Review an agent-written PR", "Watch the agents that built this app";
    - a dated, linked comparison with alternatives, researched at the time: transcript viewers and exporters for Claude Code/Codex, agent tracing and observability tools, and the token-level tools from the old comparison for the lens. Strengths are named fairly;
    - a pre-launch checklist that includes npm publish approval (D36).
- **User value:** the project is ready to share, and every link and image points at real maps.
- **Acceptance criteria and verifier checks:** old phase 12's ACs 1–4, adapted for maps.
  - **Screenshots:** `gallery-readme.png`, `social-preview-check.png`, `hero-gif-frame-first.png`, `hero-gif-frame-last.png`.
- **Size:** ~380 (images excluded).

### Phase 27: Cloudflare deployment and publish preparation (stops for Sean's approval)
- **Branch:** `phase-27-deploy-prep`
- **Goal:** everything needed to deploy the showcase site and Worker, and to publish the CLI, is ready and dry-run-verified. **Nothing is deployed or published.**
- **User value:** Sean can put the site online and publish `npx reasontrail` with reviewed commands. Self-hosters get a runbook.
- **Scope:**
  - `wrangler.jsonc` `name: "reasontrail"` (renamed from `token-garden`, 2026-10-20).
  - As old phase 13: `wrangler.jsonc` finalized (all bindings, including the structure route), `public/_headers` (CSP `connect-src 'self'`, long-cache assets), `docs/DEPLOY.md` (prerequisites, `pnpm install --frozen-lockfile && pnpm build && pnpm run check:deploy`, the smoke script, KV, the optional secret, **the exact deploy command `pnpm exec wrangler deploy`, run only by Sean or after his approval**, post-deploy checks for `/api/next-tokens` and `/api/structure`, URL replacement for D20, rollback, cost notes).
  - Plus `docs/PUBLISH.md`:
    - `pnpm build:cli && pnpm --dir cli pack` verified, and the tarball contents listed;
    - the name decision (D25);
    - remove `private: true`;
    - `npm publish --access public`, run only after Sean's approval;
    - update the skill kit's version pin.
  - `check:deploy` and the pack check in `ci/github-workflow.yml`.
- **Acceptance criteria:**
  1. `pnpm build && pnpm run check:deploy` (= `wrangler deploy --dry-run --outdir .wrangler/dry-run`) passes without a valid token and lists `AI`, `TG_CACHE`, `RL_MISS`, `RL_ALL`, `ASSETS` and the vars.
  2. `pnpm --dir cli pack` produces a tarball with only `dist/` and `package.json`/README/LICENSE, and no session data.
  3. The PR has the exact deploy and publish commands and "awaiting Sean's approval to deploy". STATUS.md reads `STATE: DONE` with that note.
  4. No deploy and no publish happened.
- **Verifier checks:** the common steps + `check:deploy` + pack + `check:docs`; full regression `check:browser --flows all --out docs/screenshots/phase-27`.
  - **Screenshots:** `final-site-desktop.png`, `final-site-mobile.png`, `final-map-dark.png`, `final-local-file.png`, `final-lens.png`.
- **Size:** ~200 lines of code and config, plus ~180 lines of docs.

### Phase summary

| n | Branch | Goal | Owners | Est. lines |
|---|---|---|---|---|
| 1–8 | (unchanged, open PRs) | Toolchain, identity, garden encoding, explore/share, keyboard, samples, temperature, Worker core | as before | as before |
| 9 | `phase-9-worker-limits` | Built: rate limits, daily budget, timeout/retry, OpenAI-compatible upstream, EXTENDING.md; shared infrastructure for AI structuring and the lens | llm-integration | ~480 + 50 del (actual) |
| 10 | `phase-10-design` | lead-designer audit + `docs/DESIGN.md` + wireframes (docs only) | lead-designer, dataviz-designer, a11y-reviewer | ~450 docs |
| 11 | `phase-11-session-model` | Step-graph types, tolerant reader, adapter contract, Claude Code adapter (subagents, rewinds) | implementer | ~480 |
| 12 | `phase-12-structure-redact` | Episodes, trouble patterns, outcome; redaction + sample audit | implementer | ~450 |
| 13 | `phase-13-cli-viewer` | `npx reasontrail`: locate → parse → self-contained HTML → open; outline viewer | implementer, lead-designer, a11y-reviewer | ~550 (split seam named) |
| 14 | `phase-14-skill` | `/reasontrail` skill to the anatomy bar, one-command install (Claude; Grok shares the directory) | implementer, lead-designer | ~420 |
| 15 | `phase-15-samples` | 3–5 redacted real sample maps from this box, reproducible | implementer, main agent review | ~200 + JSON |
| 16 | `phase-16-map-glance` | Map v1: task card, route + lanes, trouble markers, outcome, honesty label | implementer, dataviz-designer, lead-designer, a11y-reviewer | ~560 (split seam named) |
| 17 | `phase-17-map-details` | Detail panel, raw + provenance, tool views, keyboard, deep links | implementer, lead-designer, a11y-reviewer | ~480 |
| 18 | `phase-18-codex-grok` | Grok Build + Codex adapters, locators, Codex skill target, EXTENDING "add an adapter" | implementer | ~480 |
| 19 | `phase-19-site-showcase` | Showcase home, gallery, install, drag-and-drop in a Web Worker, privacy | implementer, lead-designer, a11y-reviewer | ~480 |
| 20 | `phase-20-ai-structure-worker` | `/api/structure`: batched, cached, budgeted labelling + claim links | llm-integration | ~430 |
| 21 | `phase-21-ai-labels-ui` | Opt-in consent, label overlay, support links, CLI `--ai` | llm-integration, implementer, dataviz-designer, lead-designer, a11y-reviewer | ~420 |
| 22 | `phase-22-zoom-lens` | "Zoom into this sentence" → garden; recorded lens data; opt-in live growth | implementer, llm-integration, lead-designer, a11y-reviewer | ~480 |
| 23 | `phase-23-chat-import` | Paste text, ChatGPT/Claude exports, share-link fallback | implementer, lead-designer, a11y-reviewer | ~450 |
| 24 | `phase-24-share-cards` | Redaction-previewed shareable HTML, PNG map cards, OG meta | implementer, lead-designer, a11y-reviewer | ~380 |
| 25 | `phase-25-readme-community` | README that sells in 10 s, community files, templates, good first issues, check:docs | implementer, lead-designer, a11y-reviewer | ~400 |
| 26 | `phase-26-gallery-launch` | examples/ gallery of maps, hero GIF, social preview, LAUNCH.md | implementer, lead-designer, dataviz-designer | ~380 + images |
| 27 | `phase-27-deploy-prep` | wrangler config, headers, DEPLOY.md + PUBLISH.md, dry run + pack; stops for Sean's approval | implementer, llm-integration | ~200 + 180 docs |

The old phases 10–13 (live mode, README, gallery/launch, deploy prep) are **[superseded]** by phases 22 (live provider half), 25, 26 and 27.

---

## 7. Out of scope (and what was cut)

Not built, with the reason:

- **Deploying, publishing to npm, custom domains and DNS:** they wait for Sean (phase 27 stops for approval).
- **Uploading or storing sessions on a server, accounts, server-side parsing, analytics and telemetry:** privacy and cost. Everything parses locally or in the browser.
- **Following a running session live** (`--watch` / `--serve`), IDE extensions, editing or replaying sessions: these are good-first-issue or roadmap items (D26).
- **Token, cost or usage analytics and production agent observability:** a different product. Cost fields are dropped from samples (R4).
- **Comparing several sessions side by side, and team dashboards:** not needed for the four glance questions.
- **The old live prompt box [superseded]:** live growth exists only inside the lens (D35).
- **The in-browser model provider:** its download and RAM cost still break "first step costs almost nothing".
- **Share-link scraping of chat services beyond a best-effort fallback:** it is fragile and may conflict with the services' terms. Paste and official exports cover it.
- D1, R2, Durable Objects, and a strict atomic budget counter.
- Anything finance-related, and any decorative 3D.

Good-first-issue candidates (phase 25, `docs/GOOD-FIRST-ISSUES.md`):

1. A Cursor or Aider session adapter (the contract suite + EXTENDING.md).
2. `--watch`: re-render while a session grows.
3. Export the outline as Markdown for PR descriptions.
4. A manual light/dark toggle.
5. A keyboard shortcut overlay (`?`) for the map and the garden.
6. Type-ahead in the garden tree.
7. Remember the last opened sample in `localStorage`.
8. A share-link fetcher through the Worker for one chat service, with an allowlist and tests.
9. An extra trouble rule (for example "long idle wait"), with fixtures.
10. A recipe in EXTENDING.md for a self-hosted OpenAI-compatible server for `/api/structure`.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Session formats are undocumented and change (Claude Code especially; Grok Build has no stability promise) | Adapters break silently | Tolerant reader, unknown types ignored and counted, contract suite, synthetic fixtures for each format, real-session smoke tests on this box (counts only), and a clear "format not recognized; try `--source`" message |
| Codex cannot be verified on this box | The Codex adapter may be wrong | Built from the public rollout format, flagged in STATUS.md and the README as unverified until a real session is tested (D31) |
| Private data leaks through samples or shared files | Serious trust damage | Redaction R1–R4, the CI audit, a local untracked denylist, trimmed samples, the main agent reads every sample, and `--share` shows a summary first |
| Thinking text is not stored (signature only on this box) | The "how it thought" story is thinner than expected | Honest "text not stored" nodes (M6). The map relies on assistant text, tool calls and outcomes, which carry most of the route. Grok Build does store thought chunks |
| Heuristic trouble markers mislabel | Misleading glance | Labelled "detected pattern" with evidence steps and provenance; rule tests; tunable constants; the AI overlay is separate and optional |
| Written reasoning is mistaken for ground truth | Users over-trust the map | Honesty label (D29), the lens states its model differs (Z2), AI labels say "suggested by" |
| Large sessions (tens of MB, thousands of steps) | Slow or unreadable | Streaming reader, episode aggregation and folding, Web Worker parsing, layout benchmark (G2), the outline view |
| `file://` limits (module scripts, fonts, fetch) | The local viewer fails to open | Inline classic script and data-URL fonts (D32). `--ai` runs in the CLI before writing, not from `file://` |
| The opener fails in SSH, headless or container setups | "Nothing happened" | Always print `MAP: <path>`; no opener without a display; the skill relays the path |
| The skill format or anatomy bar evolves; the skill triggers wrongly | Poor first run | Audit script, evals including negative trigger cases, narrow description, references dated |
| npm name unavailable or the rename lands mid-stack | Docs churn | `PKG_NAME` single source (D25); rename as its own small step |
| Phase size creep (history: ~2× estimates) | Reviews take longer than 20 min | Honest estimates, a named split seam per phase, the D14/D17 rules, `git diff --stat` before submit |
| RAM: Chrome, the recorder (phase 22), ffmpeg (phase 26), other agents | OOM, flaky checks | One browser at a time; heavy tools run alone; harness cleanup; `ps` check in every verify; CLI tests use small fixtures |
| Workers AI JSON-schema support or label quality unverified (placeholder token) | AI overlay weak | Optional by design; schema validation; fakes in tests; smoke step before deploy; OpenAI-compatible fallback |
| Lens (garden) risks from phases 1–9 (top-k temperature approximation, SVG ARIA support, tokenizer artefacts, timing flakes, soft KV cap) | As before | Mitigations unchanged (see §4.2 criteria and DECISIONS.md) |
