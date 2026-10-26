# Reasontrail: design (v7)

Owner: `lead-designer`. Rewritten in phase 35 from `docs/design/v7/PROMPT.md` and the design canvas. **The canvas is the source of truth:** the preview pages `docs/design/v7/preview/*.html`, their CSS (the `CSS` constant in `docs/design/v7/gen7.mjs`) and the frames rendered from them (`docs/design/v7/frames/`, `node scripts/design/canvas.mjs frames`). Where this file, the prompt's prose and the canvas disagree, the canvas wins, except for the deviations listed in §12, each recorded in `docs/DECISIONS.md`.

The next-token garden (the lens) keeps its own encoding in `docs/viz/garden.md`. Older code comments cite sections of the pre-v7 file (DESIGN §8–§18, DM/CL ids, the trail-map grammar); read it with `git show c732cb6:docs/DESIGN.md`.

Contents: 1 Identity, 2 Mark and wordmark, 3 Type, 4 Colour, 5 Shape, space and motion, 6 Layout, 7 The tree, 8 The list, 9 Outcome and step panel, 10 Interaction, 11 Accessibility, 12 Deviations from the canvas, 13 How to check.

## 1. Identity

- **Who:** developers who use coding agents (Claude Code, Codex, Grok Build) and want to know what a session did without reading thousands of transcript lines.
- **The picture first.** A session is drawn as a real tree grown left to right in session order: trunk = the main agent, limbs = subagents, branches = episodes, twigs = tool calls, leaves = successful calls. The first screen at 1440×900 is that picture, not controls.
- **Precise second.** A git-style list under the tree is the exact, readable and keyboard-operable view; the outcome box says how it ended.
- **Calm and specific.** Radix slate with one blue and one orange, Geist, 0.5px lines, four type sizes. Not paper, serif or caps labels; nothing generic or decorative; no 3D.
- **Rejected, never reintroduced:** a vertical tree, a "walked trail" squiggle, radial, sunburst or treemap views, separate Map and Outline toggles, monochrome logos, a byline beside the logo, the hero tree growing on load (not approved).

## 2. Mark and wordmark

**The mark: a veined leaf** (`src/brand/LogoMark.tsx`, `public/favicon.svg`, `public/logo.svg`). A leaf split along its midrib into a blue half (Radix blue-9) and an orange half (orange-9), the same in light and dark. The vein is a branching tree cut out in the page colour (`--slate-1`), so it adapts to the theme. Each tool call is a leaf; the leaf holds the trail.

```svg
<svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M6 58C6 28 28 6 58 6Z" fill="#0090ff"/>
  <path d="M6 58C36 58 58 36 58 6Z" fill="#f76b15"/>
  <path d="M8 56L56 8M20 44C17 38 16 31 17 25M31 33C37 35 43 35 49 33M41 23C39 19 39 15 40 11"
        fill="none" stroke="var(--slate-1)" stroke-width="2.8" stroke-linecap="round"/>
</svg>
```

**Wordmark** (`src/brand/Wordmark.tsx`): the mark at 20px, an 8px gap, then "Reasontrail" in Geist 600 14px, −0.01em, line height 21px. The mark sits 1px left for optical alignment. Written "Reasontrail" everywhere; no byline beside it, never monochrome.

**Where it appears:** header and footer of the site and the local viewer; favicon (SVG plus a 32px PNG); `docs/brand/wordmark-{light,dark}.png` (the wordmark flow, `pnpm check:browser --flows wordmark`); the share card; the social preview (`docs/brand/social-preview.png`, the brand flow).

## 3. Type

Geist and Geist Mono, self-hosted (`src/styles/fonts.css`; the viewer inlines a 400–600 Latin subset). No other faces. Tabular figures on everywhere (`font-feature-settings: 'tnum'`).

| Size | Use | Weight, line height, tracking |
|---|---|---|
| 32 | the one headline | 600, 1.1, −0.025em |
| 20 | hero lede | 400, 1.4, −0.01em, slate-11 |
| 20 | session, page, panel, dialog and section titles | 600, 1.3, −0.015em |
| 14 | body, rows, controls, lane names | 400 / 500 / 600, 1.5 |
| 12 | labels, meta, numbers, code (Geist Mono) | 400 / 500 |

- Only these four sizes (`--text-12/14/20/32`); 12 is the minimum. Hierarchy comes from weight, colour and space.
- No uppercase, no letter-spaced labels; the only tracking is the display tracking above and the wordmark's −0.01em.
- No eyebrows or overlines: nothing small sits above a heading unless it says something the heading does not (rule 11).
- Layout never measures text: Geist Mono is 0.6em a character (7.2px at 12px).
- The lens's visible-space glyph "·" is a data glyph (the editor "render whitespace" convention), not a separator: Geist Mono, slate-11, `aria-hidden` (the branch's label names the token).

## 4. Colour

Every colour is a Radix Colors 3.0 step of **slate**, **blue** or **orange** (`src/styles/tokens.css`, light and dark), used by role:

| Steps | Role |
|---|---|
| 1–2 | backgrounds (`--slate-1` page, `--slate-2` soft fill) |
| 3–5 | component backgrounds (`--slate-3` hover and tab track, `--blue-3` row highlight) |
| 6–8 | borders and lines (`--slate-6` soft, `--slate-7` frames) |
| 9–10 | solid fills and marks (`--blue-9` selected, passed; `--orange-9` failure) |
| 11–12 | text (`--slate-11` muted, `--slate-12` ink, `--blue-11` links in focus) |

- **Selected, passed:** blue (`--blue-9` fills and strokes, `--blue-11` text, `--blue-3` row highlight).
- **Failure:** orange marks (`--orange-10` for marks on the page, `--orange-9` fills such as the ⚠ triangle; see Deviations), always with a ✕ or ⚠ shape; marks on an orange-9 fill use `--on-orange-9` (slate-12 light, slate-1 dark).
- **Never colour alone:** every hue repeats a shape or a word. Blue-9 and orange-9 are the CVD-safe pair and also differ in lightness.
- **Focus:** a 2px `--blue-9` ring, 2px outside.

### Checks (`src/styles/tokens.test.ts`)

- The token values equal PROMPT §3.1 in both themes.
- Text pairs reach AA (4.5:1); marks reach 3:1.
- Blue-9, orange-9 and slate-12 stay ≥ 20 ΔE apart under protanopia, deuteranopia and tritanopia (Machado 2009, CIE76).
- Every colour in `src/**/*.css` and every colour literal in `src/**/*.ts(x)` is a Radix token or value; no `--tg-*` token remains.
- Font sizes in `src/**/*.css` are only 12/14/20/32; no `text-transform`, no tracking outside the display values.

## 5. Shape, space and motion

- **Lines are 0.5px:** `box-shadow: inset 0 0 0 0.5px var(--slate-7)` for frames (`--hair` for a rule), `0.5px solid` for rules (`--hair-soft`).
- **Radii, concentric:** 4 the Sample tag; 6 inner control and `pre`; 10 outer control with 4px padding (segmented tabs), the outcome box and command boxes; 14 detail panel and dialogs; 16 session frame and drop zone. Outer radius = inner radius + padding.
- **No shadows** except the 0.5px ring on the selected tab. No card with a coloured left-edge stripe; never a card inside a card.
- **Container:** 1200px content, 120px gutters at 1440 that grow wider beyond it; 16px gutters on phones.
- **Vertical rhythm (home):** header 64; hero padding-top 64; 12 between headline and lede; 32 above the tree; 24 above the tabs; 32 above the frame; frame padding 32; 72–96 between sections.
- **Hit targets:** ≥ 24×24px on desktop, ≥ 44×44px on phones.
- **Motion:** colour and opacity only, 250ms ease-out; none under `prefers-reduced-motion`.

### Sean's UI rules (binding, PROMPT §2 and §12)

1. No middle dot "·" as a separator in UI copy, aria-labels or the README.
2. No redundant explanatory text.
3. Copy for developers who use coding agents: clear, not chatty, no coined words.
4. Every colour from Radix slate, blue and orange by step role.
5. Optical alignment; nested radii concentric.
6. Lines and borders 0.5px.
7. Minimal motion: colour and opacity, 250ms ease-out, none under reduced motion.
8. Four type sizes (12/14/20/32), no uppercase, no letter-spaced labels.
9. Minimise the decisions the user must make.
10. No casual radius or shadow, no coloured left-edge stripe, never a card inside a card.
11. No habitual eyebrows or overlines.

## 6. Layout

All edges at 1440 are 120px: header content, headline, tree root, tabs, card, install, Made by GeekPlux and footer share one left edge (within 1px), and the list's root mark sits on the card's content edge.

### 6.1 Home, 1440 (`Home.html`)

1. **Header**, 64px, 0.5px bottom rule: the wordmark; right, "How to read a map", "Install", "GitHub" (14, slate-11, 24px apart) and the primary button "Open a session" (32px, radius 6, slate-12 fill, slate-1 text).
2. **Hero**, padding-top 64: the headline "See how your coding agent got there." (32/600, max 18ch, balanced); 12px under it the lede "Every session as a tree: subagents are limbs, episodes are branches, tool calls are twigs." (20, slate-11, max 34ch); on the lede's last baseline, right, the command box `npx reasontrail install-skill` with a copy icon (40px, radius 10, slate-2, 0.5px slate-6 ring).
3. **Hero tree**, 32px under the hero, 1200 × 520, wholly inside the first 900px. The legend sits inside the figure, top right, 12px slate-11: the five episode glyphs (Task, Explore, Change, Verify, Answer), then Command, Thinking, Failed and "Width: tool calls".
4. **Sample tabs**, 24px under the tree: a segmented control (track slate-3, padding 4, radius 10; tabs 32px, radius 6, 500; selected tab slate-1 with a 0.5px slate-7 ring). "A verifier fails, a fix passes" (default, bundled), "Lint and typecheck fail, then pass", "A change request rewrites the plan". A tab swaps the tree, the list and the outcome together.
5. **Session card**, 32px under the tabs: radius 16, 0.5px slate-7 ring, padding 32.
   - Header: the title (20/600) with nothing above it; the meta line on one baseline, 20px gaps, slate-11 with numbers in slate-12 500: agent, "47 min total", "3 subagents", "60 tool calls", the branch in mono, and the "Sample" tag last (12/500, slate-3, slate-11, radius 4, 20px). Right, vertically centred: ghost buttons "AI titles", "Details", "Share".
   - Body, 24px under the header: the 680px list (§8) and, `space-between`, the 360px outcome column (§9): the outcome box, then "Final answer".
6. **Install**, 96px under the card, 0.5px top rule, padding-top 40: "Map your own sessions" (20/600) and "Install the skill once, then ask your agent to map the current session. It opens in your browser; nothing is uploaded."; right, the big command box (48px) and three columns: Claude Code `/reasontrail`, Grok Build `/reasontrail`, Codex `$reasontrail`.
7. **Made by GeekPlux**, 72px under, 0.5px top rule: left "Made by GeekPlux" (20/600), "Writing, projects and data visualization" (slate-11), `geekplux.com` (12 mono, underlined); right a 2 × 2 grid of whole-block links from `src/site/moreSites.ts` (Vert, Explorable, Pagelapse, markvis): name 14/500, one line 14 slate-11, URL 12 mono slate-11.
8. **Footer**, 72px under, 0.5px top rule: the wordmark; right "How to read a map", "Next-token garden", "GitHub", "MIT licence".

### 6.2 Phone, 390 (`Phone.html`), up to 639px

- Header: wordmark and "Open session". Gutter 16.
- Headline, then the lede at 14; no hero command box (the install section has it).
- The tree as a bare silhouette, 358px wide at the 358:190 proportions: no text, shape and verdict marks only.
- Tabs as a sideways-scrolling track (no visible scrollbar), the legend wrapped under them.
- The card turns full-bleed (top and bottom rules only, padding 24 16); the header has no buttons and no branch, and the meta line wraps. The outcome box comes above the list; the list drops the header, # and Start columns and cuts titles with an ellipsis. Then the final answer, then the actions row (AI titles, Details, Share), then install, Made by GeekPlux in one column, and the footer.
- 640–1023px stacks the card's columns with every list column kept; the tree keeps its labels from 960px.

### 6.3 Dark (`HomeDark.html`)

The same layout on the Radix dark scales, following `prefers-color-scheme` (the site has no override). The mark's halves stay blue-9 and orange-9; its vein is the page colour.

### 6.4 One session on its own page: the local viewer and an opened session

The local viewer (the HTML the CLI and the skill write, and Share's redacted copy) and a session opened on the site (a dropped file or a pasted chat) share one layout (`SessionMap`):

- A header with the wordmark only (the viewer) or the site header (an opened session).
- The session title as the page's h1 (32/600, max 760px), the meta line and the actions in the hero's place; the tag in the meta line names what it is ("Sample", the file name, "Pasted chat", "Shared copy, redacted (N items replaced)").
- The tree 32px under the session header block (24 on the phone) at the full content width, **trimmed to the drawing**: from 24px above its top (below the legend) to 24px under its bottom, at least 240px, never more than 520. The legend lists **only the entries the tree draws**.
- Then the card: the list and the outcome column, as on the home. A chat's outcome box shows only its trouble, and no box when there is none; its meta line drops "Chat" beside the "Pasted chat" tag.
- The viewer's footer: "Made with Reasontrail" (reasontrail.geekplux.com) and "geekplux.com", plain links; no requests from `file://`.

### 6.5 Open a session (`Open.html`)

A 640px column, centred, 96px under the header: "Open a session" (20/600); the drop target (radius 16, slate-2, 0.5px slate-7 ring, padding 56 24) with a file icon, "Drop a session file", "Choose file" and "Parsed in your browser. Nothing is uploaded." (12); then the where-to-find list (112px label column, hairline rows) for Claude Code, Codex, Grok Build and Chat ("Paste the text" or a `conversations.json`); "Files up to 50 MB." (12).

### 6.6 Other pages

- **How to read a map** (`?view=how`): one figure, the default sample's tree drawn by the real renderer at the column width and 340px tall with the legend above it, and two short paragraphs (the tree; the list).
- **Install** (`?view=install`) and **Map a chat** (`?view=chat`): the site header and footer, a 20/600 title 64px under the header, the home's command boxes and `.btn` buttons.
- **Next-token garden** (`?sample=…`, the lens): its encoding is `docs/viz/garden.md`; on v7 it only takes the site's header, footer, tokens, type and 120px edges. The selected garden's name is the picker's selected tab (the page heading is for screen readers); "works offline" is said once, in the privacy line.

## 7. The tree

Engine: `src/map/tree/` (pure, typed, deterministic); renderer: `TreeView.tsx`; the home's figure: `src/site/HeroTree.tsx`.

### 7.1 Encoding

| Session part | Tree part |
|---|---|
| main agent | trunk, grown left to right in session order with a slight arch; the last subagent continues the trunk when the main agent does nothing after it |
| subagent (lane) | limb leaving the trunk where it was spawned; first up, next down, alternating; more than four (or two at once on a side) stack with decreasing amplitude |
| episode | branch off its part, alternating sides, bending upward; the kind glyph at its tip on a background halo: ▶ task, ○ explore, ■ change, ◇ verify, ◉ answer |
| episode number | 12/500 slate-11 beyond the tip with a 4px page-colour halo (`paint-order: stroke`); the list uses the same numbers |
| tool call | twig off its branch, alternating sides (±52°, 7 long) |
| successful call | almond leaf at the twig tip, `M0 0Q5.5 -4.2 11 0Q5.5 4.2 0 0Z`, along the twig |
| file read | small hollow bud (r 2.4, 1px) |
| thinking | short twig (±70°, 5 long), no tip |
| failed call | longer orange twig (16) ending in ✕ |
| lane verdict | ◉ at the limb tip (orange failed, blue passed, ink otherwise) and a block beside it: name 14/600, verdict with icon 12/500, "Agent, N min" 12 slate-11 |
| hand-back | dotted quadratic from the limb tip back to the trunk where the main agent resumed, ending in a small hollow dot |
| waits | text on the trunk ("Main agent waits, 33 min", "12 min"), never a gap in a branch |
| root | ink dot whose left edge is on the content edge, "Task" and "0 min" under it |
| width | Leonardo's rule: k·√(tool calls still ahead), k 1.45; the root flares; parts are filled ribbons |

### 7.2 Geometry and labels

- One along-axis unit per record (+9 after a spawn, +4 on return to the main lane), scaled to the width less the label room; a design box 520 tall, scaled down for shorter boxes (the phone silhouette is the desktop tree at 0.365).
- One-lane sessions grow their branches up to 2× to fill about 70% of the height, so the most common session still reads as a tree.
- Labels are placed from candidate offsets and never overlap a glyph, number, other label or lane block (unit-tested on the three samples and a synthetic 8-lane graph). The same graph always gives the same tree.

## 8. The list

`src/map/gitlist/` (`Home.html` lower half, `gitlist.mjs`). Real DOM rows over an SVG of rails.

- **Columns at 680:** rails, # (x 64), Episode (x 92), Steps (right at 616), Start (right at 680). Header 12 slate-11 with one 0.5px rule from 0 to 680.
- **Rails:** main at x 4.5, 2px slate-12, its root dot's left edge on the content edge; subagents at x 28.5, 1.5px; cubic forks at the lane row and merges after the verdict row; the main rail dotted slate-8 while a subagent runs.
- **Rows:** lane (name 14/600, agent type 12 slate-11); episode (glyph on the rail, number, title 14/500, optional sub-line 12: "⚠ 1 failed command" in ink with an orange icon, "14 min wait"; Steps and Start right); verdict (◉, icon and text, duration); end ("Session ends").
- **States:** hover slate-3, radius 8, bleeding 12px either side; the open episode blue-3 with the rail path from the root drawn in blue-9 on top; the selected step slate-3 with a blue ring on its mark.
- **An open episode** lists one 30px row per tool call or thinking step (dot, thinking dot or orange ✕ on the rail; summary without "Bash "; "Exit 0/2"; time), at most 20, then "Show N more steps". One episode is open at a time.
- **AI titles on:** a 12/500 tag (slate-3, slate-11, radius 4, 20px) after the episode's title, "AI titles suggested by <model>" in 12 slate-11 under the list; off is exactly the plain list.

## 9. Outcome and step panel

- **Outcome box** (radius 10, 0.5px slate-7 ring, hairline rows, padding 14 16): the last check (blue ✓ "Passed on re-verify" or orange ⚠ "Failed", the command and when), the trouble (orange ⚠ "1 failed review", "N trouble spots", or ✓ "No trouble detected"), the files changed (a file icon, the first path and "and N more"). Rows come from the graph for any session. Then **Final answer** (14/600 heading): up to four lines and "Read the full answer".
- **Step panel** (`Step.html .detail`), in the outcome column's place while a step is selected: radius 14, slate-2, 0.5px slate-6 ring, padding 20, gap 16. Where it is ("Verify phase 12, episode 6, step 1 of 28") with a close button; the title ("Command failed" with ⚠) and time; **for a thinking step whose text was stored, a 12px slate-11 note right under the title: "Written reasoning is the model's own account, not a record of how it computed."** (no eyebrow, no card); the summary; the command in a `pre` (radius 6); "Output" and its note; "Next step" with its icon and output; "Source <file> line N" (12); "Show raw" (12 link) disclosing the verbatim record; "Previous step" / "Next step" within the episode. Esc closes it.

## 10. Interaction

- **Hover** a branch, twig, glyph, number or lane block (nearest mark within 12px; 20px for touch taps): that episode's path from the root stays slate-12, the rest fades to slate-8; numbers, glyphs, text, ✕ and thinking twigs do not fade. A tooltip (radius 8, slate-1, 0.5px slate-7 ring) reads "7  Edit zz-verify-scratch.test.ts +8 more" over "20 steps, 6 tool calls, 15 min wait, 17 min". The list row gets the hover background, and a hovered or focused list row drives the same state in the tree.
- **Select** a step (a twig click, Enter on a list row, or `?session=…&step=…`): the path from the root turns blue-9, the rest dims to slate-9, the step gets a blue ring and a callout (summary over "Exit code 2, 16 min") with a 0.5px leader; the list opens the episode and highlights the step; the panel opens. Back and Forward follow the selection; a tab switch clears it. In the viewer the step lives in the hash (`#step=s41`).
- **Keyboard:** the tree SVG is `role="img"` with a one-sentence summary; the list is the operable structure (WAI-ARIA tree): ↑/↓ rows, → opens an episode, ← closes, Home/End, Enter opens a step's panel, Esc closes it (focus returns to the row).
- **Motion:** colour and opacity only, 250ms ease-out; nothing under reduced motion. No growth animation.

## 11. Accessibility

- Never colour alone: failed is orange **and** ✕ or ⚠; passed is blue **and** ✓; a selected step's row is slate-3 **and** weight 500 **and** a ring on its mark; an on toggle shows ✓.
- Text reaches AA, marks and focus rings 3:1 (hence the deviations in §12); blue-9, orange-9 and slate-12 pass protanopia, deuteranopia and tritanopia checks in light and dark.
- Visible focus everywhere: a 2px ring, 2px outside (blue-9; blue-11 on list rows, inset on tabs); a blue-9 stroke on garden branches; an underline on the lens's text controls. A focused heading after navigation shows none.
- The list's rows are named by their visible text plus visually hidden words that read the columns as a sentence; the legend is `aria-hidden` (the SVG summary and the list carry the meaning).
- No functionality is lost on the phone or at 400% zoom (WCAG 1.4.10); targets are ≥ 24px (≥ 44px on phones).
- axe-core: zero violations on every page, light and dark, 1440 and 390.

## 12. Deviations from the canvas

Each is recorded in `docs/DECISIONS.md` with its reason. Anything not listed here matches the canvas.

| Where | Canvas | App | Why |
|---|---|---|---|
| Failed marks (tree twig and ✕, failed ◉, list ✕, legend) | orange-9 | orange-10 | orange-9 is 2.91:1 on slate-1; orange-10 is 3.26:1 (WCAG 1.4.11) |
| Thinking twigs, thinking dots, legend Thinking | slate-8 | slate-9, legend glyph as long as Command's | slate-8 is 1.86:1, under 3:1 for a meaningful mark |
| Open episode title and number, selected step title (list) | blue-11 | blue-12 | blue-11 is 4.25:1 on blue-3, under AA |
| Selected-step ring, list focus ring | blue-9 | blue-11 | 3:1 on slate-1, blue-3 and slate-3 |
| Selected list row title | weight 400 | weight 500 | a cue besides the blue-3 background |
| ⚠ "!" ink | orange-1 | `--on-orange-9` (slate-12 light, slate-1 dark) | white on orange-9 is about 2.9:1 |
| Hover tooltip radius | prose says 10 | 8, as `Hover.html` draws it | the canvas wins over prose |
| Phone actions | no AI titles, Details or Share | a row of ghost buttons after the final answer | WCAG 1.4.10: no lost functionality |
| Phone silhouette verdicts | coloured ◉ | ✕ (failed), ✓ ring (passed) | never colour alone; no text there |
| Phone "Read the full answer" | not shown (its text fits) | shown when the answer is cut | otherwise unreachable |
| Step panel | Source line only | "Show raw" link after Source | provenance to the raw record |
| Step panel, thinking | no note | the honesty line under the title, for a thinking step whose text was stored (§9) | written reasoning is the model's own account |
| Viewer h1 | 18ch (the home's headline) | max 760px | long session titles would push the tree below the fold |
| Viewer spacing | the hero's 64 + 32 | tree 32px under the session header block (phone 24); phone frame 24px under the legend | no hero copy above it |
| Session pages (viewer, opened) | 1200 × 520 tree, full legend | box trimmed to the drawing (≥ 240px), legend of drawn entries only | small sessions left up to 300px empty; the home is unchanged |
| Chat outcome box | (no chat frame) | only the trouble row, else no box; no "Chat" beside the "Pasted chat" tag | "No check run found / 0 files changed" says nothing for a chat |
| Outcome, list and the step panel's next-step output wording | hand-written rows ("A gap in the sample audit", shorter titles, 34 min) | derived from the graph ("Verify phase 12 failed, fixed in cceb2d5", recorded titles, 33 min) | works for any session; layout identical |
| Tree numbers 1, 3, 14, 16 | halos over ribbons | glyphs 3, 14 and 16 move 3.7–7.6px off the ribbons; glyph 1 flips to the limb's other side; their numbers re-place 9–40px | a halo would hide part of a ribbon |
| Install copy | (canvas) | the canvas's sentence, not PROMPT §4.6's | the canvas wins |
| AI titles in the tree and list | not drawn | dashed 1px blue-9 ring (glyph r + 5); slate-3 tag | §7 asks for both; blue-8 is under 2:1 |
| Garden page title | (no frame) | visually hidden heading; the selected tab names the garden | said once (rule 2) |
| Hero tree growth on load | proposed on the sticky note | not built | not approved |
| AI claim → support links | not on the canvas | no UI; the CLI still computes them | needs its own design pass |
| Dialog backdrop | (no frame) | `color-mix` of slate-12 at 35% | a Radix alpha scale is not in the tokens; follow-up |

## 13. How to check

- Unit: `pnpm test` (tokens, CVD, tree overlaps and determinism, list model, step panel, outcome rows).
- Browser, under `flock /tmp/browser.lock`: `pnpm check:browser --flows v7home,v7phone,v7list,map,site,details,cli,open,chat,ai,share,lens` (type sizes ⊆ {12, 14, 20, 32}, Radix-only colours, 0.5px lines, no "·", the 120px edges, the tree above the fold, axe, keyboard).
- Canvas comparison: `node scripts/design/canvas.mjs frames | shoot | pair` puts a canvas frame and the app side by side; the phase 35 set is indexed in `docs/screenshots/phase-35/README.md`.
- Brand images: `pnpm check:browser --flows hero,gallery,brand,wordmark,polish` and `pnpm brand:hero-gif`.
