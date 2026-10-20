# Garden visual encoding (spec)

Owner: `dataviz-designer`. Builds on PLAN §3 (tokens in `src/styles/tokens.css`), §4 (F5, F6, A1–A5), D5, D6, D7, D8, D11.
Scope: what phases 3–7 build. Every row carries the phase that delivers it. States that only live mode produces (loading, error, depth limit, end of text) get their shape here so the vocabulary is complete, but phase 3 does not implement them.

## 1. The question it answers

"After this text, what might the model say next, and how sure is it?" A reader should see in one glance which continuation dominates, how many real alternatives there are, and how much probability sits outside the shown top-k. Exact numbers are one hover or one focus away.

Form: horizontal tidy tree (a dendrogram of next-token choices). Root (the prompt, drawn as a seed) on the left, depth grows right. No radial layout, no 3D, no decorative effects.

## 2. Data -> encoding

Per visible branch the data model (`buildTree`) provides `key`, `token`, `p` (conditional, `exp(logprob)`), `pathP` (product of `p` from the root, new in phase 3), `depth`, `rank`, `state`; per expanded node a remainder `r = max(0, 1 − Σ children p)`.

| Data | Channel | Exact rule | Phase |
|---|---|---|---|
| Next-token choice | one link (parent fork -> child tip) + tip marker + label | one row per choice, siblings ordered by `rank` top to bottom | 3 |
| Conditional `p` | **stroke width** (primary) | `w = 1.5 + 18.5·clamp(p,0,1)` px (D5); 5% = 2.425, 25% = 6.125, 75% = 15.375, 100% = 20 | 3 |
| Conditional `p` | **numeric value label** on hover / selection / focus | `formatPct(p)`: one decimal, `<0.1%` below 0.0005 | 3 (focus: 5) |
| `pathP` | second part of the value label | depth 1: `44.7%`; depth ≥ 2: `30.1% · path 2.7%` | 3 |
| `p` band | stroke colour (secondary only) | `p < 0.10` `--tg-branch-lo`; `0.10 ≤ p < 0.40` `--tg-branch-mid`; `p ≥ 0.40` `--tg-branch-hi`; exposed as `data-band="lo|mid|hi"` | 3 |
| Token text | direct label, IBM Plex Mono 500, `TOKEN_PX` = 14 px, `--tg-ink` | visible whitespace: space -> `·`, `\n` -> `↵`, `\t` -> `⇥`, each in a `<tspan data-ws>` filled `--tg-ink-muted`; max 12 glyphs, longer = first 11 + `…` (full token in value label, readout, accessible name) | 3 |
| Remainder `r` ("other tokens") | dashed stub under the last child, same width scale `w(r)` | runs like a link from the fork to the child column (`tipX − 4`), dash `6 4`, `--tg-ink-muted`, no marker, label `other 77.7%` at `tipX + LABEL_DX` (12.8 px, `--tg-ink-muted`) always visible; omitted when `r < 0.0005`; `pointer-events: none`, never focusable or clickable | 3 |
| State | tip marker shape + dash pattern (table §3) | colour never distinguishes a state on its own | 3–10 |
| Selected / hovered branch | casing + ring + underline + value label | §3 | 3 |
| Sampled path | accent stroke with ink outline + diamond markers | §3 | 7 |
| Temperature | widths and labels recomputed from tempered `p'` (D8, remainder included); **layout never depends on T** | widths transition 120 ms; labels switch instantly; "approximate (top-k only)" note when T ≠ 1. Phase 7 adds its own rows here. | 7 |

## 3. States: marker and line style (independent of colour)

Marker sits centred on the child tip `(tipX, y)` and is drawn above the stroke end. Stroke width is always `w(p)`, whatever the state.

| State (`data-state`) | Link stroke | Tip marker (`data-marker`) | Text | Phase |
|---|---|---|---|---|
| `expandable` (recorded, closed) | solid, band colour | `bud`: filled disc r 4, band colour | none | 3 |
| `expanded` | solid, band colour | `knot`: filled disc r 4 + concentric ring r 7, 1.5 px, band colour | children fan out after the label | 3 |
| `not-recorded` (rename of today's `leaf`) | dash `4 3`, `--tg-ink-muted` | `ring`: hollow circle r 4, 1.5 px `--tg-ink-muted`, fill `--tg-paper` | note "Not in this recording." on activation | 3 marker/dash; note 4 |
| `leaf` (end of text, no continuation exists) | solid, band colour | `square`: filled 7×7, `--tg-ink` | label `end of text` | 10 |
| `loading` | dash `2 2`, `--tg-ink-muted` | `ring-dotted`: hollow circle r 4 with `stroke-dasharray: 2 2` | `growing…` stub, 3 dots, `aria-busy` | 10 |
| `error` | dash `8 3`, `--tg-ink-muted` | `triangle`: upward, side 10, fill `--tg-error`, 1 px `--tg-ink` edge | `! Couldn't grow this branch.` (`--tg-error` text) + Retry | 10 (InlineNote variant 4) |
| `depth-limit` | solid, `--tg-ink-muted` | `bar`: 2×12 px perpendicular bar (⊣), `--tg-ink` | `depth limit (12 tokens)` | 10 |
| selected (hover in 3, click in 4, focus in 5) | self + ancestors: 2 px `--tg-paper` casing (underlay `w + 4`) and stroke `--tg-ink` | existing marker + ring r 9, 2 px `--tg-ink` | 1 px `--tg-ink` underline under the label; value label shown | 3 |
| sampled path | path links: `--tg-ink` underlay `w + 3`, then `--tg-accent` at `w` | `diamond`: 10×10 rotated square, `--tg-accent` fill, 1 px `--tg-ink` edge, replaces bud/knot on the path; the stop node keeps its own marker | readout spells the sentence + stop reason | 7 |

Rules: a hollow marker (`ring`, `ring-dotted`) only ever means "no data here yet". Every `--tg-ink-muted` stroke is dashed or carries text (depth-limit), because ink-muted vs branch-hi is only ΔE 10 (§7). `--tg-error` never paints a link, only the triangle and note text. Keyboard focus (phase 5) adds the global 2 px `--tg-focus` ring around the row hit rect, on top of the selected style.

## 4. Scales, metrics, layout

Single source of truth: new `src/garden/metrics.ts` exports every number below. `GardenView` sets `style={{ fontSize: TOKEN_PX }}` on the `<svg>`; `--tg-token-size` is removed from `tokens.css` and `base.css`, and the `FONT` constant disappears. Layout never measures text: label width = `glyphs × 0.6 × TOKEN_PX`.

| Name | Value | Meaning |
|---|---|---|
| `TOKEN_PX` | 14 | token label size, all viewports (never scaled; mobile scrolls) |
| `VALUE_PX` | 12.8 | value label, remainder label, legend (`--tg-text-sm`) |
| `ROW` | 40 | sibling pitch (d3 `nodeSize` x); cousins `separation` 1.25 (50 px) |
| `COL` | 180 | depth pitch; fixed, so growth never moves ancestors |
| `MAX_GLYPHS` | 12 | label truncation (max label width 100.8 px) |
| `LABEL_DX` | 12 | tip -> label start (clears the r 7 knot) |
| `FORK_DX` | 8 | label end -> fork x |
| `STEM` | 8 | straight segment after the fork before the curve |
| `GAP` | 1 | gap between stacked child strokes at the fork |
| `HIT_H` | 24 | minimum hit-rect height |
| `PAD` | 16 | drawing padding |

Layout (`layout.ts`, pure): `d3-hierarchy` `tree().nodeSize([ROW, COL])` on the visible tree including one remainder pseudo-row per expanded node (last child). Seed: disc r 5 `--tg-ink` at (0, 0), root fork at x 8. For each other node: `tipX = depth·COL`, `forkX = tipX + LABEL_DX + labelW + FORK_DX`. Worst-case curve run = `180 − 12 − 100.8 − 8 − 8 = 51.2` px.

**Fork joint (fixes the phase-2 blob).** Children leave the parent from a **stacked bundle** at `forkX`: child strokes (rank order) then the remainder, each occupying its own `w` vertically, `GAP` px apart, the bundle centred on the parent row. Because `Σp + r = 1`, the bundle height is at most `(k+1)·1.5 + 18.5 + k·GAP` = 32.5 px for k = 5, less than `ROW`. All link strokes use `stroke-linecap: butt` and `stroke-linejoin: round`; no round caps anywhere. Each link (`linkPath.ts`, pure): `M forkX,yᵢ H forkX+STEM C m,yᵢ m,y_c tipX_c−4,y_c` with `m` the midpoint of the curve run. The incoming end stops 4 px before the tip so the marker covers it.

**Hit targets.** One transparent `rect` per branch from `tipX − 12` to `forkX` (or label end + 8 for unexpanded), height `HIT_H` centred on the row. Rows are ≥ 40 px apart so rects never overlap; the thinnest branch has the same target as the thickest. Visible strokes also take `pointer-events: visibleStroke`, drawn in ascending `p` order so thin links sit on top near the fork.

## 5. Interaction

| Input | Effect | Phase |
|---|---|---|
| Hover a branch (hit rect or stroke) | `hoverKey` = branch; value label + selected style + readout follow it | 3 |
| Pointer leaves | label returns to `selectedKey` (or none) | 3 |
| Click / Enter / Space | toggle expand (recorded) or show not-recorded note; sets `selectedKey` | 4 |
| Arrows, Home, End | roving focus per WAI-ARIA tree; focus sets `selectedKey` | 5 |
| Temperature slider, "Sample a path" | §2 rows; sampled walk §6 | 7 |

`GardenView` props: `{ garden, selectedKey: string | null, onSelect?(key) }`; the labelled key is `hoverKey ?? selectedKey`. **The value label is a rendered element, not `<title>`**: `<g data-role="value-label" data-key aria-hidden="true">` drawn last (on top), at `x = labelEnd + 8`, vertically centred on the row: `rect` fill `--tg-surface`, 1 px `--tg-ink-muted` stroke, radius 2, padding 2×6 px, text `VALUE_PX` mono tabular `--tg-ink`. If it would cross the drawing's right edge it flips to end at `tipX − 12`. Text is built from the branch's own `p` / `pathP` (never literals). Remove every `<title>` from the garden. Until phase 5 the `<svg>` stays `role="img"` with an `aria-label` that also names the remainder ("…; other tokens 77.7%").

**Path readout** (`PathReadout.tsx`, directly under the drawing): prompt in `--tg-ink-muted` mono, then each continuation token as a mono `<span>` with a 1 px `--tg-ink-muted` bottom border and 2 px gap between tokens (the break in the underline marks the boundary), whitespace shown as in labels, then `path 2.7%`. With no labelled key it shows the rank-0 chain of the visible expanded nodes prefixed `Most likely:`; otherwise `Reading:`. Mobile (< 48rem): `position: sticky; bottom: 0`, `--tg-surface` background, hairline top (§3.3).

**Legend** (`Legend.tsx`, under the readout, HTML + inline SVG): row 1 "Thickness = chance of the next token": three 32 px butt-capped line samples at `LEGEND_P = [0.05, 0.25, 0.75]`, width `branchWidth(p)`, band colour, direct label `formatPct(p)` (5.0%, 25.0%, 75.0%), plus a dashed `6 4` sample labelled `other tokens`. Row 2: marker key for the states that exist in the phase (phase 3: bud "can grow", knot "grown", ring "not recorded"), each the real marker glyph + text.

## 6. Motion (§3.4)

| Event | Motion | Phase |
|---|---|---|
| Hover / selection value label | none (appears at once) | 3 |
| Growth | new child group: `clip-path: inset(0 100% 0 0)` -> `inset(0)` over `--tg-dur-grow` (180 ms, `--tg-ease-grow`) via `@starting-style`; labels `opacity` 0 -> 1 over `--tg-dur-fade` after 60 ms. Fallback: opacity only | 4 |
| Collapse | immediate unmount, no exit animation | 4 |
| Reshape | `stroke-width` set as a CSS property (`style`), transition `--tg-dur-reshape` | 7 |
| Sampled walk | 80 ms per edge, cap 600 ms | 7 |

Reduced motion: durations are 0 ms (already in tokens/base). **No code waits on `transitionend` / `animationend`** and no timer is keyed to a duration: state updates are synchronous and CSS animates the result. The phase-7 walk checks `matchMedia('(prefers-reduced-motion: reduce)')` and applies the whole path in one update.

## 7. Colour validation

Colour carries no meaning on its own (D6). Ramp validated with the dataviz skill validator (`validate_palette.js --ordinal`, Machado 2009, OKLab ΔE×100):

| Ramp lo -> hi | Monotone L | Adjacent ΔL ≥ 0.06 | Light end vs paper | Hue spread | Result |
|---|---|---|---|---|---|
| light `#5f7d6c,#3d6150,#1f4535` on `#f6f3ea` | pass | pass | 4.08:1 | 4° | PASS |
| dark `#7fa48f,#a9cdb8,#d4ebdc` on `#111813` | pass | pass | 6.54:1 | 3° | PASS |

State colours (branch-hi, accent, error, focus, ink-muted) run as a categorical set with `--pairs all` FAIL in both themes, as expected: the moss ramp is deliberately low-chroma and red/green collapse under protan. Pairs that can touch on screen (OKLab ΔE×100, worst CVD):

| Pair | Theme | normal | worst CVD | Required non-colour cue |
|---|---|---|---|---|
| error / branch-hi | light | 23.4 | **3.3 protan** | error never paints a link; triangle marker + `!` text + dash `8 3` |
| error / branch-lo | dark | 19.5 | **1.6 protan** | same |
| accent / error | dark | **9.3** | 6.1 deutan, **3.2 tritan** | accent = diamond + ink outline; error = triangle + text + dash |
| accent / error | light | **10.2** | 7.8 tritan | same |
| ink-muted / branch-hi | light | **10.2** | 8.8 | ink-muted strokes always dashed or text-labelled |
| accent / branch-mid | light | 19.7 | 8.3 | pass; diamond + outline anyway |
| focus / branch-hi | light / dark | 26.2 / 20.6 | 17.3 / 17.5 tritan | pass |

Re-stepping `--tg-error` was tried (5 candidates per theme, crimson to pink): none cleared both the accent pair and the green pairs at ≥ 4.5:1, so the tokens stay and the structural rules above are binding. Text pairs keep the §3.2 WCAG values.

## 8. Viewports and states of the whole drawing

- **Desktop 1280×800:** the default garden (D11: root + top child, about 11 rows) fits without scrolling.
- **Mobile 390×844:** labels stay 14 px; `.garden-scroll` scrolls sideways. On mount and on sample change, set `scrollLeft = max(0, tipX(deepest expanded node on the default path) + PAD − 16)` (instant, no smooth scroll), so that fork and all its children labels are in view. Phase 4: after an expansion, bring the new fork in with `scrollIntoView({ inline: 'nearest', block: 'nearest' })`. Whenever `scrollWidth > clientWidth`, a plain text cue (`--tg-text-sm`, `--tg-ink-muted`, above the drawing, `aria-hidden`; the region already has a label) reads `← Scroll sideways to the seed` / `Scroll sideways for more →` / `← Scroll sideways →` by position, updated on `scroll` (passive, rAF). No fades or shadows as cues.
- **No branches** (root list empty): seed only + text "This garden has no recorded branches." (3). Live empty, loading and error states: §3.6, phase 10.

## 9. Phase 3 acceptance criteria

1. `metrics.ts` is the only place token/label sizes live: `grep -rn "tg-token-size\|FONT =" src` finds nothing; `<svg>` font size comes from `TOKEN_PX`.
2. `layout.test.ts`: positions for the lighthouse default are deterministic; adding children to any unexpanded node leaves every existing node's `(tipX, y)` unchanged; hit rects are ≥ 24 px tall and pairwise non-overlapping.
3. `scales.test.ts`: `branchWidth` 0 / 0.05 / 0.25 / 0.75 / 1 = 1.5 / 2.425 / 6.125 / 15.375 / 20; `band` at 0.0999 / 0.10 / 0.3999 / 0.40 = lo / mid / mid / hi; `formatPct` `44.7%`, `<0.1%`; `formatToken(" looked")` = `·looked`, `"\n"` = `↵`, a 15-glyph token = 11 glyphs + `…`.
4. In the browser, every `[data-role=branch-stroke]` has computed `stroke-width` = `branchWidth(data-p)` ± 0.01, computed `stroke-linecap: butt`, and computed stroke colour equal to its `data-band` token.
5. `linkPath.test.ts`: at each fork all child links and the remainder start at the same `forkX`, stacked in rank order with 1 px gaps; bundle height = Σw + k·GAP ± 0.5.
6. Each branch has `data-state` and `data-marker`; expandable = `bud`, expanded = `knot`, not-recorded = `ring` with dash `4 3`; no expandable/expanded branch draws a hollow circle.
7. The garden contains no `<title>`. Hovering the thinnest branch shows `[data-role=value-label]` whose text equals `formatPct(data-p)` (plus `path …` at depth ≥ 2). A component test rendering `GardenView` with `selectedKey` set shows the same label with no pointer events.
8. Each expanded node (and the root) whose `1 − Σp ≥ 0.0005` has exactly one `[data-role=remainder]` with `data-p` = `max(0, 1 − Σp)`, label `other x%`, `pointer-events: none`, no `tabindex`; clicking it changes nothing.
9. The path readout shows prompt + continuation with visible token boundaries and `path x%` for the hovered branch, and `Most likely:` the rank-0 chain by default.
10. The legend shows samples at 5.0% / 25.0% / 75.0% whose widths equal `branchWidth`, a dashed `other tokens` sample, and the bud / knot / ring key.
11. Desktop 1280×800 shows the whole default garden without scrolling; at 390×844 the expanded fork and all its child labels are inside the scroll viewport on load and the scroll cue text is present.
12. No hex colours in `src/**/*.tsx`; `--tg-error` and `--tg-accent` are not used on any phase-3 stroke; `grep -rn "transitionend\|animationend" src` finds nothing.
13. Screenshots per PLAN phase 3 are committed; in each CVD screenshot bud, knot, ring, remainder and the selected style remain distinguishable by shape/dash alone (dataviz-designer and a11y-reviewer confirm); the ramp re-validates with `validate_palette.js --ordinal` in both themes.
