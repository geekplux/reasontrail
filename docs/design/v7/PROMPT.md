# Reasontrail redesign v7: refactor prompt

You are the **main agent** for Reasontrail (repo `geekplux/reasontrail`, local folder `/workspace/gx-projects/token-garden`). Read `CLAUDE.md` first and obey it. This prompt is a **design refactor** of the shipped product, plus the features the new design touches. It does not add new product features.

Where this prompt and `docs/DESIGN.md` disagree, this prompt wins. Rewriting `docs/DESIGN.md` to match it is part of phase 29.

- Design canvas (Sean's reference; it may not open from your machine): https://claude.ai/artifact/CCCc3V4NaF8grUvxmVLqix, row "Redesign v7".
- Source of truth on disk: `reference/` next to this file. In phase 29, copy this whole folder into the repo as `docs/design/v7/` and commit it, so every sub-agent can read it; all later paths are relative to that folder.
  - Preview pages: open `reference/preview/*.html` in Chrome.
  - Screenshots: `reference/shots/*.webp`.
  - The generator code that drew them: `reference/*.mjs`.

---

## 0. Ground rules (restated from CLAUDE.md; binding)

- **Speed mode.** Exactly two review rounds per phase: review, fix, second review, fix, then stop.
- **Every phase runs** lint (`pnpm lint`), typecheck (`pnpm typecheck`), unit tests (`pnpm test`) and build (`pnpm build`, plus `pnpm build:cli` when the viewer or CLI is touched).
- **Headless browser.** Run the browser suite at most once per phase, at the end, and only for the flows the phase touched. Always wrap it: `flock /workspace/gx-projects/logs/browser.lock <command>`. Close every preview server afterwards and check with `ps` that nothing you started is still running.
- **Screenshots.** One or two key shots per phase (1440, light, compressed WebP) for the PR. The full 1440/390 light/dark before/after set is taken once, in phase 36.
- **One PR per phase,** about 400 changed lines or fewer (lockfiles, fixtures and images excluded).
- **Stacked PRs with `gh stack`.**
  - Start from the latest `main`: `gh stack init phase-29-v7-tokens-logo`.
  - Each later phase: `gh stack add phase-<n>-<slug>`.
  - Push with `gh stack submit --auto --open`.
  - Title each PR "Phase <n>: <title>".
  - The PR body has: **What / why**, **Before / after** (screenshots), **How verified** (commands, results, review rounds), **Known gaps**.
- **Never merge. Never deploy. Never publish to npm.**
  - Do not run `gh pr merge`, `gh stack merge`, `wrangler deploy` or `npm publish`, and do not edit `.claude/settings.json`.
  - The final phase stops at a dry run (`pnpm run check:deploy`) and waits for Sean's approval.
- **Status.** Keep `docs/STATUS.md` current (first line `STATE: <state>`).
- **Decisions.** Record every decision you make that this prompt does not dictate in `docs/DECISIONS.md` (date, decision, alternatives, why).
- **Content.** Never mention Sean's employer. Nothing finance-related. Never commit secrets.
- **Resources.** The machine is RAM-tight and shared. Run one implementer and one verifier at a time, one browser at a time, and leave no watch modes running.
- **Sub-agents.**
  - `lead-designer` signs off every UI phase against `reference/`.
  - `a11y-reviewer` runs on every UI phase before the verifier.
  - `dataviz-designer` reviews the tree phases (31 and 32).

## 1. Why this refactor

Sean rejected the shipped look.

- It reads like his homepage: cream paper, serif display, letter-spaced caps.
- It feels generic and "AI-flavoured".
- It opens on controls instead of a picture, so the first view has no focus.

Seven design rounds on the canvas produced v7:

- **The tree is the hero.** The session is drawn as a real tree, grown left to right in session order:
  - trunk = the main agent;
  - limbs = subagents;
  - branches = episodes;
  - twigs = tool calls;
  - leaves = successful calls.
- **A git-style list below the tree** is the precise, readable view.
- **New visual system:** Radix Colors, Geist, 0.5px lines, four type sizes.
- **New abstract logo** in colour.
- **Cross-links** to Sean's other sites.

Rejected along the way, so do not reintroduce them:

- a vertical tree;
- a "walked trail" squiggle;
- radial, sunburst or treemap views;
- separate Map and Outline toggles;
- monochrome logos;
- a "by GeekPlux" byline next to the logo.

## 2. Sean's UI rules (binding, check every phase against them)

1. Never use the middle dot "·" as a separator in UI copy. Remove every existing one: UI strings, `aria-label`s and the README's top link row.
2. No redundant explanatory text. Every sentence must earn its place.
3. Copy fits the audience (developers who use coding agents): clear, not chatty, no coined words, length fit to the job.
4. Every colour comes from Radix Colors (radix-ui.com/colors), used by its 12-step roles:
   - 1–2: backgrounds;
   - 3–5: component backgrounds;
   - 6–8: borders and lines;
   - 9–10: solid fills;
   - 11–12: text.
5. Optical alignment. Nested radii are concentric: outer radius = inner radius + padding.
6. Lines and borders are 0.5px.
7. Minimal motion: colour and opacity only, 250ms ease-out, nothing under `prefers-reduced-motion`.
8. At most four type sizes: 12, 14, 20 and 32px. 12px is the minimum. Build hierarchy with weight, colour and space.
9. Minimise the decisions the user must make. Put unavoidable choices where the user already intends to choose.
10. No casual radius or shadow, and no card with a coloured left-edge stripe. Never put a card inside a card.

Also from CLAUDE.md: never rely on colour alone; palettes must pass protanopia, deuteranopia and tritanopia checks; keyboard-operable; reduced motion respected; no decorative 3D.

## 3. Design system (phase 29)

### 3.1 Colour tokens

Use Radix Colors 3.0 **slate**, **blue** and **orange**, light and dark. Either depend on `@radix-ui/colors` (CSS only, small) or copy the values into `src/styles/tokens.css`. Record the choice in DECISIONS. Expose them as `--slate-1` … `--slate-12`, `--blue-1` … `--blue-12` and `--orange-1` … `--orange-12`.

Exact values (from the preview generator):

```
light slate  #fcfcfd #f9f9fb #f0f0f3 #e8e8ec #e0e1e6 #d9d9e0 #cdced6 #b9bbc6 #8b8d98 #80838d #60646c #1c2024
light blue   #fbfdff #f4faff #e6f4fe #d5efff #c2e5ff #acd8fc #8ec8f6 #5eb1ef #0090ff #0588f0 #0d74ce #113264
light orange #fefcfb #fff7ed #ffefd6 #ffdfb5 #ffd19a #ffc182 #f5ae73 #ec9455 #f76b15 #ef5f00 #cc4e00 #582d1d
dark slate   #111113 #18191b #212225 #272a2d #2e3135 #363a3f #43484e #5a6169 #696e77 #777b84 #b0b4ba #edeef0
dark blue    #0d1520 #111927 #0d2847 #003362 #004074 #104d87 #205d9e #2870bd #0090ff #3b9eff #70b8ff #c2e6ff
dark orange  #17120e #1e160f #331e0b #462100 #562800 #66350c #7e451d #a35829 #f76b15 #ff801f #ffa057 #ffe0c2
```

Semantic roles:

| Role | Token |
|---|---|
| page background | `--slate-1` |
| soft fill (command box, tab track) | `--slate-2`, `--slate-3` |
| lines | `--slate-6` (soft), `--slate-7` (frames) |
| muted text | `--slate-11` |
| ink | `--slate-12` |
| selected path, passed, links in focus | `--blue-9` (fills and strokes), `--blue-11` (text), `--blue-3` (row highlight) |
| failure | `--orange-9` (marks), with a ✕ or ⚠ shape so it never relies on hue |

Blue and orange are the CVD-safe pair. They also differ in lightness.

Delete the old palette (cream paper, ink, accents) and its tokens. Keep `src/styles/colorMath.ts` and make `tokens.test.ts` assert:

- text contrast (AA);
- that every colour in `src/**/*.css` is a `var(--slate|blue|orange-N)` or one of the values above;
- CVD distinguishability of blue-9 vs orange-9 under all three simulations.

### 3.2 Type

- **Families:** Geist and Geist Mono, self-hosted (for example `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`). The local viewer works offline, so no Google Fonts request.
- **Remove** `@fontsource/instrument-serif` and `@fontsource/ibm-plex-mono`.
- **The viewer's budget is 300 KB before session data** (`scripts/check-size.mjs`). Either inline a Latin subset (woff2, weights 400/500/600) or fall back to `ui-sans-serif, system-ui` and `ui-monospace` in the viewer only. Measure it, then decide and record the decision.

| Size | Use | Weight, line height, tracking |
|---|---|---|
| 32 | the one headline | 600, 1.1, −0.025em |
| 20 | hero lede (400, `--slate-11`), session title, section titles | 600 for titles, 1.3, −0.015em |
| 14 | body, rows, controls, lane names | 400 / 500 / 600 |
| 12 | labels, meta, numbers, code | 400 / 500 |

- Turn on `font-feature-settings: "tnum"` everywhere.
- No other sizes, no uppercase, and no letter-spaced labels.

### 3.3 Shape and space

- **Lines** are 0.5px. Use `box-shadow: inset 0 0 0 0.5px` for frames and `0.5px solid` for rules.
- **Radii:** 6 for the inner control, 10 for an outer control with 4px padding (segmented tabs), 10 for the outcome box, 14 for the detail panel, 16 for the session frame.
- **No shadows** except the 0.5px ring on the selected tab.
- **Container:** 1200px content width with 120px gutters at 1440. The gutters grow at wider viewports; the content width does not. On phones (390) the gutter is 16px.
- **Vertical rhythm:** header 64; hero padding-top 64; 12 between headline and lede; 32 above the tree; 24 above the tabs; 32 above the frame; frame padding 32; 72–96 between page sections.

### 3.4 Logo: "veined leaf" (replace `src/brand/LogoMark.tsx`)

A leaf split along its midrib into a blue half and an orange half. The vein is a branching tree cut out of the leaf in the page background colour. Meaning: each tool call is a leaf, and the leaf holds the whole trail.

```svg
<svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M6 58C6 28 28 6 58 6Z" fill="#0090ff"/>
  <path d="M6 58C36 58 58 36 58 6Z" fill="#f76b15"/>
  <path d="M8 56L56 8M20 44C17 38 16 31 17 25M31 33C37 35 43 35 49 33M41 23C39 19 39 15 40 11"
        fill="none" stroke="var(--slate-1)" stroke-width="2.8" stroke-linecap="round"/>
</svg>
```

- The blue and orange values are Radix blue-9 and orange-9, which are identical in light and dark.
- The vein stroke must be the page background, so it adapts to light and dark.
- The wordmark is the mark at 20px, an 8px gap, then "Reasontrail" in Geist 600 14px with −0.01em tracking. The mark shifts −1px left for optical alignment.
- Regenerate everything that shows the logo:
  - favicon (SVG plus a 32px PNG);
  - `docs/brand/wordmark-light.png` and `wordmark-dark.png`;
  - the social preview image;
  - the CLI viewer's header.
- See `reference/shots/logo2.webp` (A is this mark).

## 4. Page layout: website (phases 33–34)

See `reference/shots/Home.webp`. Top to bottom at 1440:

1. **Header.** 64px tall, 0.5px bottom rule, padding 0 120px.
   - Left: the wordmark only, with no byline.
   - Right: nav links "How to read a map", "Install", "GitHub" (14px, `--slate-11`), then the primary button "Open a session" (32px tall, radius 6, `--slate-12` fill, `--slate-1` text).
2. **Hero.**
   - Headline: "See how your coding agent got there." (32px, max 18ch, balanced).
   - Lede: "Every session as a tree: subagents are limbs, episodes are branches, tool calls are twigs." (20px, `--slate-11`, max 34ch).
   - Right side, aligned to the lede's last baseline (`align-items: last baseline`): the command box `npx reasontrail install-skill` with a copy icon button (40px tall, radius 10, `--slate-2`, 0.5px ring).
3. **Hero tree.** The current sample's tree at the full content width (1200 × 520). It must be fully visible within a 1440 × 900 first screen. The legend sits inside the figure, top right, 12px:
   - Task, Explore, Change, Verify, Answer (glyphs);
   - Command (twig with leaf), Thinking (faint twig), Failed (orange twig with ✕);
   - "Width: tool calls".
4. **Sample tabs** directly under the tree: a segmented control (track `--slate-3`, padding 4, radius 10; tab 32px, radius 6; selected tab `--slate-1` with a 0.5px `--slate-7` ring).
   - Order and labels: "A verifier fails, a fix passes" (default, the one with subagents); "Lint and typecheck fail, then pass"; "A change request rewrites the plan".
   - Switching a tab swaps the tree, the list and the outcome together. Keep the existing lazy loading of the non-default samples, and make `verify-fail-fix` the bundled default so the first view needs no request. Re-check the size budget.
5. **Session frame.** One frame: radius 16, 0.5px `--slate-7` ring, padding 32.
   - **Header row:** "Claude Code" plus a "Sample" tag (12px); the title (20px); meta on one baseline, for example "**47 min** total  **3** subagents  **60** tool calls  `phase-12-structure-redact`".
   - **Right of the header:** ghost buttons for the existing features: "AI labels" (the existing AI labels overlay), "Details" (the existing session-details toggle) and "Share" (the existing ShareButton). The buttons are vertically centred on the header block.
   - **Below the header:** a 680px git-style list (§6) and, on the right, a 360px outcome column (`justify-content: space-between`).
   - **Outcome column:** one box (radius 10, 0.5px ring) with hairline-separated rows: the final check (blue ✓), trouble (orange ⚠), files changed. Then "Final answer", up to four lines and a "Read the full answer" link. It replaces the old "card inside a card".
   - **When a step is selected,** the outcome column becomes the detail panel. It is the existing DetailPanel content restyled:
     - title "Command failed" with ⚠;
     - the command in a `pre`, then output, then next step;
     - the source file and line;
     - Previous step / Next step buttons.
     - Esc closes it.
6. **Install.** 0.5px top rule; left "Map your own sessions" (20px) plus one sentence; right the command box and three columns (Claude Code `/reasontrail`, Grok Build `/reasontrail`, Codex `$reasontrail`).
   - Copy: "Install the skill once, then ask your agent to map the current session. The map opens in your browser as a local file; nothing is uploaded."
7. **Made by GeekPlux** (Sean's cross-links; new). 0.5px top rule, two columns.
   - Left: "Made by GeekPlux" (20px), "Writing, projects and data visualization" (`--slate-11`), and `geekplux.com` (12px mono, underlined, links to https://geekplux.com). This is the most important link.
   - Right, a 2 × 2 grid, each item a whole-block link: name (14px 500), one line (14px `--slate-11`), URL (12px mono `--slate-11`):
     - Vert, "Turn a GPX track into a terrain poster", https://vert.geekplux.org
     - Explorable, "Turn a paper into an interactive essay", https://explorable.geekplux.com
     - Pagelapse, "Watch a web page change over the years", https://pagelapse.geekplux.com
     - markvis, "Charts written in Markdown", https://github.com/geekplux/markvis
   - Put the list in one exported constant (`src/site/moreSites.ts`) so the other project sites can copy it.
8. **Footer.** 0.5px top rule; the wordmark left; links right: "How to read a map", "Next-token garden", "GitHub", "MIT licence".

Remove from the website: the separate Map/Outline toggle, the old TaskCard layout, the old RouteView squiggle, the old gallery chrome, and every "·" separator. Keep:

- the drop zone page ("Open a session"), restyled to the new tokens;
- "How to read a map" (`HowToReadMap.tsx`), rewritten for the tree and list encoding;
- the next-token garden lens, reachable from the footer and restyled to the new tokens only.

### Phone (390)

See `reference/shots/Phone.webp`.

- Header: wordmark plus "Open session".
- Headline, then lede at 14px.
- The tree as a bare silhouette at 358px wide: no labels, no numbers, the shape and the verdict colours only.
- Tabs as a horizontally scrollable track, then the legend wrapped below it.
- The frame turns full-bleed (no side ring, top and bottom rules only, padding 16). The outcome box moves above the list; the list drops the # column and the start-time column; titles truncate with an ellipsis.
- Final answer; install; Made by GeekPlux in one column; footer.

### Dark

See `reference/shots/HomeDark.webp`. Same layout, using the dark Radix scales. Follow `prefers-color-scheme`, with an override if the site already has one.

## 5. The tree (phases 31–32): engine and renderer

### 5.1 Encoding

| Session part | Tree part |
|---|---|
| main agent | trunk, grown left to right in session order; a slight arch (v = −10·sin(0.9π·t)) |
| subagent (lane) | limb that leaves the trunk where the main agent spawned it; first limb up, next down, alternating outward |
| episode | branch off its lane: alternating sides, bending upward like growth |
| tool call | twig off its branch, alternating sides |
| successful call | almond **leaf** at the twig tip: `M0 0Q5.5 -4.2 11 0Q5.5 4.2 0 0Z`, rotated along the twig |
| file read | small hollow **bud** (r 2.4, 1px stroke) instead of a leaf |
| thinking | short faint twig (`--slate-8`), no tip |
| failed call | longer orange twig (`--orange-9`) ending in a ✕ |
| episode kind | glyph at the branch tip with a background halo: ▶ task, ○ explore, ■ change, ◇ verify, ◉ answer |
| episode number | 12px `--slate-11` beyond the tip, with a 4px background-coloured `paint-order: stroke` halo so twigs never cut through it |
| lane verdict | ◉ at the limb tip, coloured by result (orange failed, blue passed, ink otherwise); a label block beside it: lane name (14/600), verdict with icon (12/500), "Agent, N min" (12 `--slate-11`) |
| hand-back | dotted `--slate-8` quadratic from the limb tip back to the trunk where the main agent resumed, ending in a small hollow dot |
| waits | text on the trunk ("Main agent waits, 34 min", "12 min"), never a gap in a branch |
| root | ink dot at the left content edge (the root's left edge sits exactly on the edge), with "Task" and "0 min" under it, left-aligned to the same edge |

### 5.2 Geometry (port the algorithm from `reference/tree.mjs`, not its constants)

- **Along-axis (time).** One unit per record in session order. Add 9 units after a spawn and 4 when control returns to the main lane. Scale so the whole session fits the width minus about 210px of room for the right-hand labels.
- **Width (Leonardo's rule).** A part's width is k·√(tool calls still ahead on it), with k = 1.45 on desktop and 0.95 on phone.
  - The trunk counts every lane not yet spawned plus its own remaining calls.
  - The root flares by +10·e^(−Δu/16).
  - Draw each part as a filled ribbon around its centreline (see `ribbon()`).
- **Limbs.** Rise over 96 units with ease (1−(1−t)^2.1) to an amplitude of 128 (up) or 112 (down), then a gentle sine. Limbs spawned near the arched trunk inherit its offset.
- **Branches.**
  - Length = clamp(slot·1.55, 22, 150), where slot is the episode's span on the along-axis.
  - Heading starts at ±58° off the parent and bends to ±10°, pulled 16% toward vertical-up.
  - Width follows the episode's remaining calls.
- **Twigs.** ±52° off the branch (thinking ±70°). Length 7 (thinking 5, failed 16).
- **Labels must never overlap anything.** v6 needed hand fixes (for example the Re-verify label block moved up 42px to clear episodes 16 and 18). Replace the hand fixes with a placement pass:
  - candidate offsets per label;
  - pick the first candidate whose bounding box hits no glyph, number, other label or lane block;
  - keep a unit test that asserts zero overlaps.

### 5.3 Generalise beyond the reference

`reference/tree.mjs` hard-codes the verify-fail-fix sample: lane keys, title overrides, three lanes and the label offsets. The engine must handle any `SessionGraph`:

- **One lane** (`implementer-checks`: 12 episodes, 49 min, no subagents). The tree is a trunk with episode branches alternating above and below. It must still read as a tree: same width rule, same leaves. This is the most common real session, so make it look as good as the reference.
- **Two or more lanes** (`planner-pivot`: main plus two planner runs, the first errored then retried). Limbs alternate up and down. A lane with `status: "error"` gets the orange verdict.
- **More than four lanes.** Stack limbs on each side with decreasing amplitude.
- **Long sessions.** Episodes are capped at 12 per lane by the existing step graph. If the along-axis gets dense, keep a minimum unit and let branch length shrink before anything overlaps.
- **Deterministic.** The same graph always gives the same tree, with no randomness.

Put the engine in `src/map/tree/` as pure TypeScript with typed outputs (paths, marks, labels, hit targets). Test it on all three samples plus a synthetic 8-lane graph. Assert:

- no label overlaps;
- every tool call has exactly one twig;
- widths are monotonic toward the tips;
- the root sits at x = r.

### 5.4 Interaction

- **Hover a branch, twig or label.** The hovered episode's path from the root stays `--slate-12` and the rest fades to `--slate-8`. A tooltip shows:
  - "7  Edit zz-verify-scratch.test.ts +8 more";
  - "20 steps, 6 tool calls, 15 min wait, 17 min".
  - The tooltip is radius 10, `--slate-1`, with a 0.5px `--slate-7` ring.
  - The same row in the list gets the hover background.
  - Twigs are smaller than WCAG 2.2's 24px target, so use nearest-mark hit testing within 12px.
- **Click or select a step** (for example the failed s41).
  - The path from the root to that step turns `--blue-9` and everything else dims to `--slate-9`.
  - The step gets a blue ring and a callout (command summary plus "Exit code 2, 16 min") with a 0.5px leader line.
  - The list expands that episode and highlights the step, and the detail panel opens.
  - See `reference/shots/Step.webp`.
- **Keyboard.** The tree SVG is `role="img"` with a summary label. The **list** is the operable structure and follows the WAI-ARIA tree pattern: ↑/↓ move between rows, → expands an episode, ← collapses, Enter opens the step detail, Esc closes it. Focus in the list drives the same highlight in the tree.
- **Motion.** Only colour and opacity change, at 250ms ease-out; none under reduced motion. The proposed one-time growth animation of the hero tree is **not** in scope; Sean has not approved it.

## 6. The git-style list (phase 30)

See `gitlist.mjs` and the lower half of `Home.webp`. One SVG plus real DOM rows (rows must be focusable; draw the rails in SVG behind them).

- **Columns at 680px:** rails, # (x 64), Episode (x 92), Steps (right-aligned at 616), Start (right-aligned at 680). The header row is 12px `--slate-11`, with a 0.5px rule spanning exactly 0 to 680, no bleed.
- **Rails.**
  - The main rail is at x 4.5, 2px, `--slate-12`. Its root dot (r 4.5) has its left edge on the content edge.
  - Subagent rails are at x 28.5, 1.5px.
  - A fork is a cubic curve off the main rail at the lane row. A merge is a cubic back after the verdict row.
  - While a subagent runs, the main rail is dotted `--slate-8`.
- **Rows.**
  - **Lane row:** name 14/600, plus agent type 12 `--slate-11`.
  - **Episode row:** glyph on the rail with a halo; number; title 14/500; and an optional sub-line in 12: "⚠ 1 failed command" (ink text, orange icon) and/or "14 min wait". Steps and start time sit on the right.
  - **Verdict row:** ◉ on the rail plus a verdict icon and text, and the duration.
  - **End:** a hollow dot and "Session ends", 47 min.
- **States.**
  - Hover: row background `--slate-3`, radius 8, bleeding 12px left and right of the content (the bleed is deliberate; text stays aligned).
  - Open episode: `--blue-3` background, `--blue-11` title, and the rail path from the root to the selection drawn in `--blue-9` on top.
  - Selected step: `--slate-3` background plus a blue ring on its mark.
- **Expanded episode.** One 30px row per tool call or thinking step: a dot (2.5, ink), a thinking dot (2, `--slate-8`) or a failed ✕ (orange) on the subagent rail; the summary (14, without the leading "Bash "); "Exit 0/2" (12); time. Then "Show N more steps" (12, link) when truncated.

This list replaces the old Outline view on the website and in the viewer. Keep `outline.ts`'s plain-text export if anything else uses it.

## 7. Features the refactor touches (keep them working)

| Feature | What changes |
|---|---|
| Local viewer (`src/viewer`, the HTML the CLI and the skill write) | Uses the same tree plus list plus outcome and detail panel, without site chrome: wordmark header, session header, tree, list, outcome, plus a footer with "Made with Reasontrail" linking reasontrail.geekplux.com and geekplux.com. The links are plain `<a>` tags: no requests, `file://` must still work offline. Stay under the viewer budget. |
| Drop zone ("Open a session") | Restyle only; copy unchanged except for removing "·". |
| AI labels overlay | Labels render as small 12px tags beside the list rows and as a thin ring on the matching tree branch; overlay off = exactly the plain map. |
| Share (`--share`, ShareButton) | Restyle; the redacted copy uses the new viewer. |
| Next-token garden lens | Restyle to the tokens only (fonts, colours, lines); its encoding is unchanged. |
| URL state (`src/app/urlState.ts`) | Add the selected sample and the selected step to the URL so a link to "Step" opens the same state. |
| HowToReadMap | Rewrite for the new encoding: one figure with the legend and two short paragraphs. |
| README, examples, social preview | New wordmark images; README hero = a 1440 light screenshot of the new home; remove "·" from the top link row ("Live demo", "Quick start", "How it works", "Extend it" separated by spacing). |
| Skill (`skills/reasontrail`) | No behaviour change. Re-run `pnpm skill:audit` and `pnpm skill:evals`, because the viewer output changed. |
| Browser checks (`scripts/check-browser.mjs`) | Update the selectors and flows: tree hover, step select, Esc, tab switch, phone layout, dark. |

## 8. Phases

Numbering continues after the shipped 28. Each phase is one stacked PR.

| # | Branch | Goal | Acceptance (besides lint, typecheck, test, build) |
|---|---|---|---|
| 29 | `phase-29-v7-tokens-logo` | Radix tokens, Geist, the four sizes, 0.5px lines, radii; new LogoMark, Wordmark, favicon; remove the old fonts and palette; rewrite `docs/DESIGN.md` §§ identity/type/colour/shape from this prompt | Token test passes (Radix-only colours, AA, CVD); grep finds no Instrument Serif or Plex; the logo renders correctly in light and dark at 16/20/32 |
| 30 | `phase-30-v7-gitlist` | Git-style list component with rails, rows, states and keyboard (WAI-ARIA tree) | Unit tests for the row model on all three samples; keyboard test; axe clean |
| 31 | `phase-31-v7-tree-engine` | Pure tree layout engine, generalised (§5.2–5.3), with label placement | Overlap test zero for the 3 samples plus a synthetic 8-lane graph; determinism test; one twig per call |
| 32 | `phase-32-v7-tree-render` | SVG renderer: wood ribbons, leaves, buds, failures, glyphs, labels, legend, hover, selection, callout; linked to the list | Screenshot comparison with `reference/shots/Home.webp`, `Hover.webp` and `Step.webp` reviewed by lead-designer and dataviz-designer; hit testing within 12px |
| 33 | `phase-33-v7-site-layout` | Website page: header, hero (tree as hero), tabs, frame, outcome box, detail panel, install, Made by GeekPlux, footer; URL state | At 1440 × 900 the whole tree is above the fold (assert the bounding box); the 120px edges line up (assert header, hero, tabs, frame and footer left edges are equal); no "·" in rendered text |
| 34 | `phase-34-v7-phone-dark` | Phone 390 and dark mode for everything in 33 | 390 has no horizontal page scroll; dark contrast AA; matches `Phone.webp` and `HomeDark.webp` |
| 35 | `phase-35-v7-viewer-features` | Local viewer on the new design; AI labels, Share, drop zone, garden lens and HowToReadMap restyled; browser checks updated | `pnpm build:cli` passes; viewer under budget and offline (no network requests in a Playwright run with the network blocked); skill audit and evals pass |
| 36 | `phase-36-v7-polish-docs` | Full before/after set (1440 and 390, light and dark), README hero and wordmarks, social preview, examples gallery, CHANGELOG | lead-designer sign-off against every reference shot; all docs checks pass |
| 37 | `phase-37-v7-deploy-prep` | `pnpm build:prod` (if present) and `pnpm run check:deploy` | Dry run passes; `STATE: DONE`, "awaiting Sean's approval to deploy" |

Keep each phase at about 400 changed lines or fewer. If one grows larger, split it (for example 32a/32b) and record the split in DECISIONS.

## 9. Global acceptance checks (automate them; run them in every UI phase)

1. **Type sizes.** A browser script collects computed `font-size` for every text node on the home, step, phone and viewer pages. The set must be ⊆ {12, 14, 20, 32}.
2. **Colours.** A browser script collects computed `color`, `background-color`, `border-color`, `fill` and `stroke`. Every value must be in the Radix list above, `transparent`, or `currentColor`-derived.
3. **Lines.** Every computed border width is 0 or 0.5px. Every visible rule is 0.5px.
4. **No "·"** in rendered text or `aria-label`s on any page.
5. **Alignment.** The left edges of the header content, headline, tree root, tabs, frame and footer are equal within 1px at 1440. The list root mark's left edge equals the frame's content edge.
6. **Accessibility.** axe-core: zero violations. Keyboard-only run: reach a failed step and open its detail. Reduced motion: no transitions.
7. **CVD.** The token test simulates protanopia, deuteranopia and tritanopia for blue-9 vs orange-9 vs slate-12 and passes.
8. **Budgets.** `pnpm check:size` passes (website first view and viewer).

## 10. Reference files

| File | What it is |
|---|---|
| `reference/preview/Home.html` | Home, light, 1440 (tabs: first sample) |
| `reference/preview/HomeDark.html` | Same, dark |
| `reference/preview/Hover.html` | Hovering episode 7 in the hero tree |
| `reference/preview/Step.html` | Failed command s41 selected: blue path, callout, expanded list, detail panel |
| `reference/preview/Phone.html` | 390 |
| `reference/preview/Logo2.html` | Logo options. A (veined leaf) is chosen; B (strands) is not |
| `reference/shots/*.webp` | 2× screenshots of the above |
| `reference/tree.mjs` | Tree geometry reference (hard-coded to the verify-fail-fix sample; port the algorithm) |
| `reference/gitlist.mjs` | Git-style list geometry reference |
| `reference/gen7.mjs` | Page template and **all CSS** used in the previews (the `CSS` constant). Use it for spacing, sizes and states. `node gen7.mjs` regenerates `v7preview/` |
| `reference/logo2.mjs` | Logo SVGs |
| `reference/vff.json` | The compact sample records the previews were drawn from (built from `src/sessions/samples/verify-fail-fix.graph.json`) |

The previews load Geist from Google Fonts for convenience only. The product must self-host (§3.2).

## 11. Report

When phase 37 is done:

- `docs/STATUS.md` starts with `STATE: DONE`, followed by "awaiting Sean's approval to deploy", and lists the new PRs (phases 29–37) with their review rounds.
- Every PR body has before/after screenshots.
- List any deviation from this prompt under **Known gaps** in the PR where it happened and in `docs/DECISIONS.md`.

Do not post anything anywhere.


---

## 12. Change after handoff (2026-10-24, binding)


One change to the v7 spec you are implementing. Everything else in PROMPT.md stands.

## New binding UI rule 11 (add it to the rules list in §2)

11. No habitual eyebrows or overlines: no small label above a heading unless it carries category, context or key information the heading does not. Build hierarchy with size, weight, spacing and whitespace instead.

Check every phase you have done or will do against it.

## Session header (§ "Header row", the card under the hero tree)

Before: a 12px line "Claude Code" + "Sample" tag sat above the session title.

After: nothing sits above the title. The agent name and the tag move into the meta line:

```
Verify phase 12, fix the audit gap, re-verify                 [AI titles] [Details] [Share]
Claude Code   47 min total   3 subagents   60 tool calls   phase-12-structure-redact   [Sample]
```

- Title: 20px, weight 600, no top margin (the old 8px gap under the label goes away).
- Meta line, one baseline, 20px gaps, slate-11, numbers in slate-12 weight 500: the agent ("Claude Code" or "Codex") first, then duration, subagents, tool calls, the branch in mono, and the "Sample" tag last.
- The "Sample" tag (12px, slate-3 background, slate-11 text, radius 4, height 20) shows only for built-in samples, never for a user's own session.
- Phone: same order; the branch is hidden as before, the tag stays last and may wrap.
- The header block is about 28px shorter; nothing else on the page moves relative to it.

Reference: `reference/preview/Home.html` and `reference/shots/Home.webp` in the updated `redesign-v7.zip` show the new header. (Note from GX: the updated zip has not been delivered to the box yet; until it is, follow this text, and the old reference shot's header is superseded.)

## Acceptance

- No element above the session title inside the card.
- `grep -ri "eyebrow\|overline" src` finds no class used as a label above a heading.
- Light, dark and 390px screenshots of the card header, compared with the reference shot.


---

## 13. Restart: canvas-first (2026-10-24, binding)

Sean rejected PR #31 (phase 29, tokens/Geist/logo). Its "after" screenshot was the **old page layout in new colours**, nothing like his canvas. The cause was this prompt's own phase order, which rebuilt the page layout only in phase 33. This section restarts v7 and **overrides §0, §4, §8 and §11 wherever they disagree**. §12 still applies.

### 13.1 What is discarded

- PR #31 and the whole phase 29/30 attempt are discarded. PR #31 is closed. The remote branch is deleted. Local copies are kept as `discarded/phase-29-v7-tokens-logo` and `discarded/phase-30-v7-gitlist`, so the work can be recovered.
- You may reuse code from `discarded/phase-29-v7-tokens-logo` (tokens.css, the token test, LogoMark/Wordmark, favicon, the font setup): cherry-pick it or copy it. But no PR may again show the old layout.
- Start a fresh stack from local `main` (`origin/main` plus local kickoff commits).

### 13.2 The canvas is the source of truth

- **Source of truth:** `reference/preview/*.html` plus `reference/canvas-2026-10-24/*.png`. After the copy these are `docs/design/v7/preview/*.html` and `docs/design/v7/canvas-2026-10-24/*.png`.
  - The preview HTML pages are the canvas frames' HTML. The canvas frames are srcdoc iframes generated by `reference/gen7.mjs`.
  - The PNGs are screenshots of the live canvas taken 2026-10-24. The `*-header*`, `*-detail*` and `phone-*` shots at 124% are legible. The `*-full.png` shots are low-res and show layout only.
- **When the canvas and the prose disagree, the canvas wins.** The prose is §1–§12 of this file and `docs/DESIGN.md`. Take every size, spacing, colour, radius and state from the preview HTML (the `CSS` constant in `gen7.mjs`), not from memory of the old app.
- **Session-card header.** The previews and `gen7.mjs` were updated on 2026-10-24 to match the live canvas and §12:
  - The title comes first, with nothing above it.
  - Then the meta line: "Claude Code  47 min total  3 subagents  60 tool calls  `phase-12-structure-redact`  [Sample]".
  - Then the buttons "AI titles", "Details", "Share".
  - The button is **"AI titles"**, not "AI labels" as §4 says. It still toggles the existing AI labels overlay.
  - On the phone there are no header buttons, there is no branch, and the meta line wraps.
- `reference/shots/*.webp` were **not** regenerated and still show the old header (a "Claude Code / Sample" line above the title). For the header, the previews, the canvas PNGs and §12 override the webp shots. For everything else, the webp shots remain valid 2× renders of the previews.
- **The canvas frame for a comparison** is the preview page rendered by you in the headless browser. Use the same viewport and theme as your screenshot: Home at 1440 light, HomeDark, Hover, Step, Phone at 390. Use the canvas PNGs as a cross-check.

### 13.3 Sean's sticky note on the canvas, "What changed from v6" (binding)

1. Hero: headline, one sentence and the install command, then the sample's tree at full content width (1200). The first screen at 1440x900 is the picture, not controls. Legend sits top-right inside the figure; sample tabs sit right under the tree they change.
2. The card below holds only the session: title, meta, AI titles / Details / Share, the git-style list and the outcome.
3. Alignment: header, hero, tabs, card, install, footer share the 120px edges. The tree root and the list root sit on their content edge. Meta row on one baseline; the install command on the lede's last baseline. One rule under the list header instead of two.
4. Outcome: one bordered box with hairline rows instead of cards inside a card.
5. Links: a 'Made by GeekPlux' block above the footer links geekplux.com first, then Vert, Explorable, Pagelapse and markvis.
6. Logo, round 2: A, the veined leaf. Two halves in Radix blue-9 and orange-9 (CVD-safe pair; also different in lightness), the vein is a branching tree cut out of it: each tool call is a leaf, and the leaf holds the trail.

The note also has a motion proposal: "the hero tree grows once on load (trunk then limbs, about 1.2 s, ease-out), leaves fade in 250 ms; static under reduced motion". It is **not shown and NOT approved. Do not implement it.**

### 13.4 Binding rules

- **UI rules:** §2 rules 1–10, plus rule 11 from §12 (no habitual eyebrows or overlines), apply to every phase.
- **Unchanged from §0:**
  - exactly **two review rounds per phase**;
  - stacked PRs with `gh stack`, titled "Phase <n>: <title>";
  - about 400 changed lines or fewer per PR, excluding lockfiles, fixtures, images, `docs/design/v7/` and the static reference-tree port (split as needed);
  - never merge, never deploy, never publish, never push to `main`.
- **Canvas comparison, every UI phase:**
  - Take the phase's **1440 light screenshot** of the real app.
  - Put it **side by side** with the matching canvas frame screenshot in one image (left: canvas, right: app).
  - Commit it under `docs/screenshots/phase-<n>/` and show it in the PR body under "Before / after".
  - Phases that touch phone or dark also add the 390 and dark pairs.
- **lead-designer gate, every UI phase:**
  - In each review round, `lead-designer` explicitly compares the app screenshot with the canvas frame.
  - It checks layout (which blocks exist, their order and position), spacing and edges (the 120px edges, gaps from the `CSS` constant), sizes (type, boxes, the tree region), colours and states.
  - It returns **MATCH** or **REJECT**, with a numbered list of mismatches and measured px.
  - A phase cannot finish, and its PR cannot be opened or updated as done, until lead-designer's round-2 verdict is MATCH.
  - Only sub-pixel or sub-4px residuals may be written under Known gaps. A layout-level mismatch never goes under Known gaps.
  - If round 2 still says REJECT on layout, fix the listed items and re-run lead-designer's comparison on that list only. This is a gate check, not a third review round. If it still fails, set `STATE: BLOCKED` with the mismatch list and stop.
- **Never acceptable in any PR:** an "after" screenshot that shows the old layout (TaskCard, RouteView squiggle, Map/Outline toggle, old gallery chrome) in new colours.

### 13.5 New phase order (replaces the table in §8)

Numbering restarts at 29. The very first PR must already produce a page that **looks like the canvas Home at 1440 light**.

| # | Branch | Goal | Acceptance (besides lint, typecheck, test, build, and the canvas gate in 13.4) |
|---|---|---|---|
| 29 | `phase-29-v7-canvas-page` | Copy `reference/` to `docs/design/v7/` (and this PROMPT.md to `docs/design/v7/PROMPT.md`). Radix tokens, Geist (self-hosted), four sizes, 0.5px lines, radii; veined-leaf LogoMark/Wordmark/favicon. **The full website page skeleton matching `Home.html`:** header; hero (headline, lede, install command on the lede's last baseline); hero-tree region at 1200 × 520 with the legend top right (if the engine isn't ready, a static port of the reference tree for the default sample `verify-fail-fix`, e.g. the SVG from `tree.mjs` output, clearly marked temporary); sample tabs under it; session card with the §12 header (title, meta line, AI titles / Details / Share); list region (may be a static placeholder at this point, sized like the canvas); the outcome box (one bordered box, hairline rows, final answer); install section; Made by GeekPlux (`src/site/moreSites.ts`); footer. The old page layout is removed from the website route. | 1440 × 900: the whole tree region is above the fold (assert the bounding box). The 120px edges line up: header, hero, tree root, tabs, card, install, footer left edges are equal within 1px (assert). Token test (Radix-only colours, AA, CVD). No Instrument Serif or Plex. No "·". No eyebrow above the session title. Side-by-side with the Home canvas frame: lead-designer MATCH. |
| 30 | `phase-30-v7-gitlist` | Git-style list (§6) with rails, rows, states and keyboard (WAI-ARIA tree), wired into the card in place of the placeholder; outcome box fed by real sample data | Row-model unit tests on all three samples; keyboard test; axe clean; side-by-side with Home: MATCH (list part) |
| 31 | `phase-31-v7-tree-engine` | Pure tree layout engine in `src/map/tree/`, generalised (§5.2–5.3), with label placement | Zero overlaps for the 3 samples plus a synthetic 8-lane graph; determinism; one twig per call; root at x = r |
| 32 | `phase-32-v7-tree-render` | SVG renderer replaces the static tree: ribbons, leaves, buds, failures, glyphs, labels, legend; hover, selection, callout, detail panel, linked to the list; tab switching swaps tree, list and outcome; URL state (sample and step) | Side-by-side with Home, Hover and Step: MATCH from lead-designer and dataviz-designer; hit testing within 12px; Esc closes detail |
| 33 | `phase-33-v7-phone-dark` | Phone 390 and dark for everything above | No horizontal scroll at 390; dark AA; side-by-side with Phone and HomeDark: MATCH |
| 34 | `phase-34-v7-viewer-features` | Local viewer on the new design; AI titles overlay, Share, drop zone, garden lens and HowToReadMap restyled; browser checks updated | `pnpm build:cli`; viewer under budget and offline; skill audit and evals pass; side-by-side of the viewer with Home: MATCH |
| 35 | `phase-35-v7-polish-docs` | Full before/after set (1440 and 390, light and dark), all side by side with the canvas frames; README hero and wordmarks; social preview; examples gallery; CHANGELOG; DESIGN.md rewritten from this prompt and the canvas | lead-designer sign-off against every canvas frame; docs checks pass |
| 36 | `phase-36-v7-deploy-prep` | `pnpm build:prod` (if present) and `pnpm run check:deploy` dry run | Dry run passes; `STATE: DONE`, "awaiting Sean's approval to deploy" |

- **The split is yours to finalise.** The main agent finalises the exact split. Phase 29 in particular will probably need to be split, for example 29a and 29b. Keep each PR at about 400 lines and record the split in `docs/DECISIONS.md`.
- **The split must keep the first PR canvas-like.** The first PR in the stack must render the canvas Home layout at 1440 light. So if you split, put the layout skeleton in the first PR and move lower-risk chores (old-font removal, social image, DESIGN.md text) into the next one. Never split tokens-first and layout-later again.
- **§9 checks.** The §9 global acceptance checks apply from phase 29 on, to whatever exists at that point.
- **§11 report.** In §11, read "phase 37" as "phase 36" (the deploy-prep phase, whatever its final number).
