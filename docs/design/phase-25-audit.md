DESIGN: APPROVED (2026-10-22)

# Phase 25 calm-layout audit

Source: `docs/screenshots/phase-25/before/*` (1440 and 390, plus full-page shots and the dark map). Rules: DESIGN.md §18 (CL1–CL14, T1–T8). Each item is a checkable change. The file hints are where to start. **Status: before audit, sign-off pending.** `lead-designer` adds `DESIGN: APPROVED` here after reviewing the `after/` set.

Scope: CSS and markup only. Out of scope items are listed at the end and go to follow-ups.

## X. Every view (shared chrome)
1. Header (`src/site/SiteShell.tsx`, `site.css`): only the showcase home has the ink-filled "Map your own session". Every other page shows it as a text link. The current page's link gets `aria-current="page"` and a 2 px underline. Today the drop zone and install pages use the filled button and chat import uses a link.
2. Spacing (CL7): migrate all 40 uses of `--tg-space-3/6/7` (12→8 or 16, 32→24 or 40, 48→40), then delete those tokens from `src/styles/tokens.css`. The grep must return 0.
3. Map/Outline toggle (`map.css`, `viewer.css`; CL10): no border and no ink fill. The selected segment is weight 600 with a 2 px ink underline. The hit area is 44 px at 390 with `white-space: nowrap`, which fixes the backlog item "toggle looks clipped at 390".
4. Quiet secondary buttons (CL11): "more", Show full text, Show raw, Copy link to step, Previous/Next step, Steps (n), Table view, More options, Expand and Back to the map become text buttons (muted, underline on hover or focus, no border). Borders stay only on one primary action per view (amended §18.4).
5. Hairlines (CL8, T5): remove the ink rules above At a glance and the route, and the rule above the stuck list. Use 40 px (`--tg-space-8`) between bands instead. Keep at most two full-width rules: the header bottom and the footer top.
6. Footer: one line at 1440. Each page states the privacy sentence once (the install page currently says "Nothing is uploaded" twice).

## G. Map glance (showcase home, viewer route), focal point: the route band
1. Replace the two stacked eyebrows ("WATCH THE AGENTS…" and "TASK · CLAUDE CODE · CLAUDE-OPUS-5-5 · SAMPLE") with one: `TASK · CLAUDE CODE · SAMPLE` (`Showcase.tsx`, `TaskCard.tsx`). The model moves to Session details.
2. Meta row (CL3, T1): show 3 items ("11 min active · 51 tool calls · 1 subagent" or "idle"). Wall time, thinking and model go into a closed `<details>` labelled "Session details".
3. Legend (CL3, T2): replace the inline 8-pair legend with a closed `<details><summary>Key</summary>` at the right end of the route header, beside "AI labels…" (`MapLegend.tsx`).
4. Route labels (CL5, T3): at most 8 titles per lane, in priority order first, last, blaze, delegate, verify (`layout.ts`, `RouteView.tsx`). Unlabelled episodes show only their glyph, with the title on hover, on focus and in the accessible name. No title is cut to fewer than 2 words ("Run lint,…", "Run…").
5. AI tags (backlog: crowding at 12 episodes): the tag appears only on labelled episodes. Unlabelled episodes carry "(AI title)" in their accessible name and focus label only.
6. Hero room (CL7): ≥ 40 px clear below the lowest route mark. Today the "12 min idle" tail at y 575 runs into the destination at y 620.
7. Stuck list (CL6): remove the `jsonl:` location lines. Keep one muted line naming the episode, and omit "main" for the main lane. Cap at 5 rows on desktop and 3 on mobile, then show a "Show all <n> patterns" button (`MapView.tsx`).
8. Destination (CL8, T4; `OutcomeCard.tsx`, `.dest-card` in `map.css`): no border, no fill and no inner vertical rule; the two columns are separated by the 24 px gutter. Show the top 3 files, then "+<n> more files". The "new" tag sits inline after the file name (it wraps beneath today). Drop the "edits" header. Clamp the final answer to 2 lines. The provenance line becomes "The agent's own words"; the `jsonl` reference and Show raw move to the detail panel.
9. Showcase: move the Map/Outline toggle into the task eyebrow row, at its right end, as a header item of the map region. Today it sits at y 1008, below the map, and about 1,900 px down in outline view. The sample switcher and Save stay below the map.
10. Showcase: fold "How to read a map" into a closed `<details>` with the same label (§18.1).
11. Mobile (T8): the viewer's "Generated on your machine" line moves to the footer. The destination appears once: the sticky bar, with no second card lower on the page.
12. Subagent expansion (T7): one expansion at a time, and the step strip is unboxed. If replacing the siding in place needs more than about 60 lines in `layout.ts`, it becomes a follow-up.

## DK. Dark map, focal point: the route band
1. Apply G3, G7 and G8; the destination's lighter fill (`--tg-surface` in dark) goes too.
2. Removing the ink rule above At a glance (X5) also removes the brightest line on the page.
3. Check against the CVD shots that the blaze badge and the "!" glance square still pass 3:1 on dark paper.

## O. Outline view, focal point: the Route `<ol>`
1. Use the same title as the map (`displayTitle`), not the raw prompt (`Outline.tsx`). The full prompt goes behind "more".
2. Replace the 12 bordered "Steps (n)" buttons with a quiet text disclosure "4 steps", and remove the duplicate "· 4 steps" from the meta line. Accessible name: "Steps in <episode> (4)".
3. Remove the two full-width ink rules around At a glance (X5).
4. "Detected patterns are found by rules, not by AI." uses UI 13.5 muted, as on the map, not mono.
5. The outline is the text twin, so it keeps every file, every pattern and every `jsonl` location (no caps here, per CL4).

## D. Detail panel, focal point: the selected step
1. Clamp the panel title to 2 lines using `displayTitle`. Today it truncates to "token-garde…" and still wraps to 3 lines.
2. Provenance (CL12, T6): a closed `<details><summary>Source · agent-a0e3…jsonl:1</summary>` holding Show raw, Copy link, the uuid and the rule note. No hairlines between sections. Raw opens at ≤ 240 px with internal scroll (`DetailPanel.tsx`, `RawRecord.tsx`).
3. Make "Show full text" a text button and clamp the excerpt to 8 lines.
4. Replace the key-hints line ("Keys: ← → steps…") with the shared "?" Keyboard help.
5. Previous/Next become text buttons at the panel foot.
6. Step strip (`StepList.tsx`): no border and no white fill. The `jsonl:n` column moves to the panel. Keep the 2 px selected bar.
7. With the panel open, the Key stays closed (no wrapping legend). Route titles are thinned to `min(8, floor(width / 96))`. Today there are 13 titles of the form "Read base…".
8. 390 sheet: the breadcrumb is one line with an ellipsis. Expand is a text button and Close an icon button, both with 44 px targets and no borders.

## S. Showcase drop zone (`showcase-open`), focal point: the drop target
1. Header per X1 (the page's own CTA is currently a filled button).
2. Add one quiet line below the privacy line: "Or map a chat · try a sample" (§18.1) in `DropZone.tsx`.
3. Keep the dashed drop frame and the bordered "Choose a file" as the one primary action. Make no other change.

## I. Install, focal point: `npx reasontrail install-skill`
1. Set the secondary command ("npx reasontrail") in mono 15 against 18 for the skill command, so the two code boxes do not read as equals (`Install.tsx`, `site.css`).
2. Remove the duplicate privacy line from the footer (X6).
3. "Install" in the header gets `aria-current` (X1).

## L. Lens, focal point: the garden
1. Use the site header's wordmark size and outer margins (`AppShell.tsx`, `lens.css`). The lens currently uses 24 px margins against 120 px on the site.
2. Drop the bordered "← Back to the map", because the breadcrumb already starts with "Map". Its mark goes from the lens accent to ink (CL10: accent only on data marks).
3. Specimen: remove the 2 px left rule. Shorten the meta to one muted line ("Step s12 · <episode>"), and move "Recorded, works offline" into More options.
4. Replace the 8-item legend row and the "Each branch is…" sentence with one closed `Key` disclosure that holds the sentence as its first line (`src/garden/Legend.tsx`).
5. "Table view · More options": one quiet text-button row after the "Most likely" readout. The readout band gets paper, with no fill at 390.
6. Footer (backlog): after live opt-in, replace "Runs offline; nothing you do with samples leaves your browser." with "Live: this sentence is sent to <provider> to predict tokens." (`AppShell.tsx:24`).
7. The honesty line ("An open model's predictions…") stays visible and is never folded.

## CI. Chat import, focal point: the paste box
1. Replace the 2-line instruction with a one-line hint via `aria-describedby`: "Include the “You said:” or “User:” lines". The full format list moves into "Where to find a chat" (`ChatImport.tsx`).
2. The "Paste a conversation" label stays visible but as a muted mono 12.8 eyebrow, so it does not compete with the page title.
3. Shorten the export link to "or choose an export file (conversations.json)" so it fits one line at 390.
4. "Map this conversation" is the view's primary action: ink fill when enabled, and a muted outline (not a grey fill) when disabled.

## CM. Chat map, focal point: the route band
1. Chat honesty wording (backlog): "The replies are the model's own account, not a record of how it computed them." It ends with "How to read this map" (`HonestyLabel.tsx`, via a `source` prop).
2. Label user corrections "Correction:", not "Interrupted:", for chat sources only (`src/map/outline.ts:12` and the map's trouble label). The glyph is unchanged.
3. "Pasted chat" joins the eyebrow (`TASK · CHAT · PASTED`). "Map another chat" and "Save shareable copy…" move after the map. Today they form a 2-line control row above the title at 390.
4. Apply G7 (location line "…· Pasted chat:6" removed) and G8 (unboxed; "Pasted chat:21 · Show raw" moves to the panel).

## SD. Share dialog, focal point: the redaction result and Download HTML
1. The summary drops bold. Line 1 is "No secrets, emails or home paths found." Line 2, muted, is "9 cut-off strings will be replaced too."
2. Make "Download HTML" the ink-filled primary, with "Download map card (PNG)" as a quiet bordered secondary. At 390 both stack full width (today they have unequal widths).
3. Dialog padding is 24 px; the "Included"/"Opens" list stays, in muted 13.5.
4. Alt text (backlog): `cardLabel` in `src/share/exportCard.ts` strips a trailing "." or "…" from each part before joining. The output never contains "…." or "..".

## SC. Share card (PNG), focal point: the mini route
1. Balance the title wrap in `exportCard.ts` so the last line never holds a lone token. Today it ends on "5)".
2. The glance glyphs match the map's: a "!" square for trouble and a filled square for files. Today the card uses a circled × and an empty circle.
3. Footer: drop the repeated "reasontrail" (the wordmark is top-left), leaving "Redacted copy". The 390 shot is the same 1200×630 asset and needs no change.

## SO. Share opened (HTML), focal point: the route band
1. "Generated on your machine · nothing was uploaded" moves from the top bar to the footer. At 390 it costs a line today.
2. The "Shared copy · redacted (9 items replaced)" banner loses its tan fill (CL10: no hue in chrome) and becomes one muted mono line on paper.
3. Use `displayTitle` when the payload has it, so the title does not show a 2-line raw prompt. Make "more" quiet (X4).
4. Apply G2–G8.

## GA. Garden page, focal point: the garden
1. Replace the six bordered radio chips with a quiet text radio group, with the selection underlined as in the showcase sample switcher. At 390 it is one horizontally scrolling line (`SamplePicker.tsx`).
2. Keep the temperature slider and "Sample a path" visible. The presets (0, 1.0, 1.5) and New seed go into "More options" (`TemperatureControl.tsx`).
3. Specimen card (`SpecimenLabel.tsx`): unboxed with no inner hairlines. Show the title and prompt; "Recorded with", "k" and the date go into a closed `<details>` "About this garden".
4. Use the Key disclosure (L4) and the header and breadcrumb (L1, L2). Paper readout (L5).
5. At 390 the garden top sits at ≤ 320 px (today about 420).

## CV. CLI viewer (`file://`), focal point: the route band
1. Apply G2–G8 and SO1. Seven stuck rows become 5 plus "Show all 7 patterns" (3 on mobile).
2. 40 px between the route and the bottom band. Today the destination top (y 365) touches the Answer stem (y 344).
3. Unify the `--list` times (backlog; `cli/src/main.ts:59`): every source prints local `YYYY-MM-DD HH:MM`, or "-" when unknown.

## AI copy (backlog; seen on map views with AI labels)
1. With one batch, "1 request, one after another" becomes "1 request" (`src/ai/ConsentDialog.tsx:50`).
2. "1 claim links" uses a plural helper ("1 claim link", "2 claim links"); search `src/ai/` for the claim summary string.

## Out of scope (follow-ups)
- Re-laying out or centring the garden canvas (consult `dataviz-designer`).
- Blaze badges touching when two blazes share an episode (encoding).
- Rendering Markdown `**` in excerpts.
- The `/workspace/…` path left in a redacted shared title (redaction code).
- The Grok delegate step count (2 vs 8; data).
- The flaky copy-link test, and lazy-loading the lens chips (size).
