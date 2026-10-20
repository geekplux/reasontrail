# token-garden: plan

Written by `planner`, 2026-10-19, and revised the same day for the "North star: a star-worthy open-source project" section of `CLAUDE.md`. Binding inputs: `CLAUDE.md`, `docs/llm-provider.md`, `docs/DECISIONS.md`. The logprob provider design in `docs/llm-provider.md` is settled and this plan does not re-argue it.

Contents:

1. Users first
2. Product goal and the first 30 seconds
3. Design direction
4. Product acceptance criteria
5. Architecture
6. Phases (13 PRs; the last one is Cloudflare deployment prep)
7. Out of scope (and what was cut)
8. Risks

---

## 1. Users first

### 1.1 Who it is for

| User | What they already know | The moment they reach for token-garden | What they leave with |
|---|---|---|---|
| **Curious developer** who calls LLM APIs | "temperature" and "top-p" are knobs in their code; they have heard "the model predicts the next token" | They tweak `temperature` in their app, the output changes, and they want to *see* why. Or a model "hallucinates" and they wonder how a confident sentence can come out of a coin toss | A felt sense of what a distribution over next tokens looks like, how temperature reshapes it, and why two runs differ |
| **Student** in an ML/NLP or "AI literacy" course | Autoregressive decoding as a formula on a slide | During the lecture or homework on sampling, greedy decoding and entropy | A picture to go with the formula: thickness = probability, temperature evens out branches, greedy always follows the thickest branch |
| **Educator or speaker** explaining LLMs to a class, a team or a meetup | They need to explain it to people who do not | Preparing a slide or a live demo. Conference Wi-Fi is unreliable, they cannot put an API key on a projector, and they want to link the audience to *exactly this fork* | A demo that works offline, needs no account or key, is keyboard-driven on stage, and has a link to a specific branch and temperature |

The user is not a researcher who needs logit lenses, attention maps or a writing tool (see the comparison in `docs/LAUNCH.md`, phase 12).

### 1.2 The fastest path to the first "wow"

- **Zero install, no account, no key, no download.** Opening the URL is the whole setup. The first view is a recorded garden bundled with the app, so it renders with no network call and also works offline once loaded.
- **First wow at first paint, with zero clicks:** "The old lighthouse keeper opened the door and" with five branches of visibly different thickness, the thickest already grown one level further. Target: garden visible **≤ 1.5 s** after navigation on the headless check (P2).
- **Second wow in one drag, ≤ 10 s:** the temperature slider is in the first view. Dragging it to 1.8 visibly evens out the branches; dragging it to 0 collapses everything onto the thickest path. No network.
- **Third wow in one click:** "Sample a path" spells out a sentence a sampler would produce, with a seed, so it is reproducible on a projector.
- **Your own text is opt-in**, one prompt box, one model call per click. Nothing about the first minute depends on it.
- **Paste a URL:** a shared link (`?sample=lighthouse&path=0.2&t=1.5`) reopens exactly that fork and temperature, offline-capable, with no model calls.

There is no CLI or agent skill in this product. The only command-line tool is the contributor-facing sample recorder, which has a one-command entry point (`pnpm samples:record --prompt "..." --id my-garden`, phase 6).

### 1.3 How the plan stays user-first

Every phase below has a **User value** line answering "what does the user get, and how does it save them time or effort". Features that could not answer it were cut or moved to good-first-issue candidates (§7).

---

## 2. Product goal

token-garden makes a language model's next-token choice visible. You give it a piece of text and it grows a garden of branches to the right of it. Each fork is one next-token choice. Each branch is as thick as that token's probability and carries an exact percentage on hover or focus. Clicking a branch (or pressing Enter on it) grows the next fork from that point. A temperature slider reshapes every branch in place, and "Sample a path" walks the garden the way a sampler would. Together they show at a glance what sampling, temperature and uncertainty mean. The default experience is a set of recorded gardens bundled with the app, so it is instant, free, offline-capable and needs no key. Live growth from your own text is optional and lean: one cached model call per click.

### 2.1 The first 30 seconds

1. **0 s:** The page opens straight into a recorded garden, "The old lighthouse keeper opened the door and", shown on a specimen label card, followed by five branches. Their thickness differs visibly (" looked" is thick, " stood" is thin), and the most likely branch is already grown one more level. There is nothing to click first, no spinner and no network call.
2. **3 s:** The user hovers or focuses a thin branch and sees "` stood` · 2.7% · path 2.7%". The path readout under the garden shows the full sentence so far.
3. **8 s:** The user clicks " looked". It grows its next fork from recorded data (" out", " around", ...) with a short eased growth, which is instant under reduced motion. Clicking a branch that is not in the recording shows a calm note at that branch: "Not in this recording. Grow it live?"
4. **15 s:** The user drags temperature from 1.0 to 1.8. Thin branches fatten, the garden "evens out", and the percentages update, all without any network call. They press "Sample a path" and a highlighted path is drawn, with the sentence spelled out.
5. **25 s:** The user presses "Copy link" to share this exact view, picks another sample ("In the middle of the night, the cat"), or switches to "Your prompt", types a sentence and presses Grow. Grow is the first and only model call so far.

URL entry points: `?sample=<id>[&path=<ranks>][&t=<T>][&seed=<n>]` reopens a recorded view (phases 4, 6, 7) and `?prompt=<text>` pre-fills the live prompt box (phase 10). Opening a URL never makes a model call by itself.

---

## 3. Design direction

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

Numbered for reference from phases and PRs. "Headless check" means the Playwright flows run by `pnpm check:browser` against `vite preview` with system Chrome.

### Functional (F)

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

### Accessibility (A)

- **A1** Everything is keyboard-operable. The garden is a single tab stop with roving focus: arrow keys move between branches per the WAI-ARIA tree pattern; Enter or Space expands or collapses; Home and End jump to the first and last visible branch. Every branch is reachable regardless of probability, including the thinnest. All controls are reachable in logical order, each with a visible focus indicator of at least 3:1 contrast.
- **A2** Screen readers get tree semantics. The garden is `role="tree"` with an accessible name; each branch is a `role="treeitem"` with an accessible name of the form `"<token>", 44.7 percent, path 12.0 percent`, plus `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` when expandable, and "not recorded" in the description when relevant. A polite live region announces expansions, errors, copied links and sampled paths.
- **A3** A "Table view" toggle shows an HTML table of all visible branches (path, token, probability, path probability, state), a full text alternative to the drawing.
- **A4** Meaning is never carried by colour alone (§3.2, §3.6). The palette passes protanopia, deuteranopia and tritanopia simulation (screenshots reviewed, ΔE asserted in tests). Text contrast ≥ 4.5:1 and graphical marks ≥ 3:1 in both themes.
- **A5** With `prefers-reduced-motion: reduce`, all growth and reshape transitions are disabled (computed `transition-duration` is `0s`). Nothing flashes.
- **A6** An automated axe-core pass of every flow reports 0 `serious` or `critical` violations.

### Performance (P), measured in the headless check on `vite preview`, median of 3 runs

- **P1** Budgets checked by `pnpm check:size` on `dist/` (gzip for JS/CSS, raw for fonts): initial JS ≤ **130 KB** gzip (samples included); CSS ≤ **15 KB** gzip; fonts requested by the first view ≤ **45 KB** in at most 2 files.
- **P2** Navigation start to the `tg:garden-ready` mark ≤ 1500 ms ("seconds to first wow").
- **P3** Expanding a recorded branch puts its children in the DOM within 200 ms of the click.
- **P4** One temperature step re-renders the largest fully expanded sample (about 200 branches) in ≤ 100 ms.

### Offline sample (O)

- **O1** In sample mode the app makes no requests other than same-origin static assets (self-hosted fonts are same-origin; no third-party fonts, CDNs, analytics or `/api/*`). Asserted by a request listener in the headless check.
- **O2** After the first load, `context.setOffline(true)` still lets the user switch samples, expand recorded branches, change temperature, sample a path and open a share link, with no errors.

### No-key operation (N)

- **N1** With no Cloudflare credentials, no `.dev.vars` and no API keys, `pnpm install --frozen-lockfile && pnpm build && pnpm check:browser` passes and the full sample experience works.
- **N2** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:size`, `pnpm check:docs` and `pnpm run check:deploy` all pass with no valid credentials. Worker tests use fakes for `AI`, KV and rate-limit bindings. Nothing in verification requires live Workers AI (the box's `CLOUDFLARE_API_TOKEN` is a placeholder).
- **N3** When live mode is unavailable, the prompt box stays visible with a note (F11). No secrets are ever committed: `.dev.vars` is gitignored and `.dev.vars.example` holds empty values.

### Quality signals (Q)

- **Q1 Typed public APIs.** `shared/llm/types.ts` exports `TokenChoice`, `ProviderErrorCode`, `ProviderError` and `LogprobProvider` with TSDoc on every member; `src/samples/types.ts` exports `SampleGarden`. All tsconfigs use `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. oxlint denies `typescript/no-explicit-any`. A reusable provider contract test suite (`src/llm/providerContract.ts`) is the executable spec for anyone adding a provider.
- **Q2 Small dependency footprint.** Runtime `dependencies` are exactly: `react`, `react-dom`, `d3-hierarchy`, `@fontsource/ibm-plex-mono`, `@fontsource/instrument-serif`. The Worker has **no** runtime dependencies. `pnpm check:size` fails if `package.json` `dependencies` differs from this allowlist (a new runtime dependency needs a DECISIONS.md entry and an allowlist edit in the same PR). Dev dependencies are listed in §5.6.
- **Q3 Fast load.** P1 and P2.
- **Q4 Tests and CI.** Unit tests for every pure module, component tests for interactive pieces, the headless flows, and `ci/github-workflow.yml` running install, lint, typecheck, test, build, check:size, check:docs, check:browser and check:deploy. (It lives in `ci/` until the token has `workflow` scope; follow-up in STATUS.md.)
- **Q5 Docs for extending.** `docs/EXTENDING.md` (adding a provider or Worker upstream, recording and adding samples, theming) and `tools/record-samples/README.md`.
- **Q6 Accessible.** A1–A6.

### Open-source packaging (S)

- **S1** `README.md` sells in 10 seconds: above the fold (first ~25 lines rendered) it has the logo, the one-line pitch, a hero image or GIF from the real app, a "Live demo: coming soon" placeholder, and a 3-line quick start. Below: how it works, accessibility, a roadmap, contributing and licence.
- **S2** `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`, `CHANGELOG.md` (Keep a Changelog, updated by every phase), issue templates in `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`. Nothing under `.github/workflows/`.
- **S3** `docs/GOOD-FIRST-ISSUES.md` lists at least 8 scoped candidates, each with files to touch and a "done when".
- **S4** A committed social preview image `docs/brand/social-preview.png` (1280×640, < 1 MB) generated from the real app and the logo.
- **S5** An `examples/` gallery: every recorded garden with a screenshot, a share link and "what to notice", plus how to record your own.
- **S6** `docs/LAUNCH.md`: Show HN draft, X post draft, 3 demo scenarios, an honest comparison with alternatives, and an explicit statement that nothing has been posted anywhere.
- **S7** `pnpm check:docs` verifies that every relative link and image in `README.md`, `CONTRIBUTING.md`, `docs/*.md` and `examples/README.md` resolves to a committed file.

### Design (D)

- **DS1** All colours come from `src/styles/tokens.css`; `tokens.test.ts` asserts the §3.2 contrasts and ΔE rows. oxlint/grep: no hex colours in `src/**/*.tsx`.
- **DS2** The two self-hosted fonts load from the same origin; the logo, favicon and wordmark match §3.5.
- **DS3** Every state in §3.6 that exists at a phase's end is implemented as designed and screenshotted, and `dataviz-designer` lists no open deviations.

---

## 5. Architecture

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
| D8 | Temperature with only top-k known | `p_i' = p_i^(1/T) / Z` over the shown k plus a lumped remainder `r = 1 − Σp_i` as one pseudo-token. T = 0 is greedy. "approximate (top-k only)" note when T ≠ 1 | Renormalise over k only; fetch the full distribution (impossible over the API) |
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
| D20 | Live demo link | Placeholder `https://token-garden.example` (reserved TLD) everywhere a demo URL is needed; `docs/DEPLOY.md` lists the files to update after Sean deploys | Guess a workers.dev URL (would be wrong or misleading) |
| D21 | Code of conduct contact | Contributor Covenant 2.1 with the contact "the maintainers, via a private report to @geekplux on GitHub" (no email address invented) | A new email address (none exists) |

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

---

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
  - `src/llm/temperature.ts` (+ test, D8): T = 1 identity; T = 0 all mass on the argmax; probabilities sum to 1 including the remainder; lowering T sharpens monotonically.
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

### Phase 9: Worker limits, budget, OpenAI-compatible upstream and extending docs
- **Branch:** `phase-9-worker-limits`
- **Owner:** `llm-integration`
- **Goal:** protect the upstream with per-IP rate limits and a daily cap, make the upstream swappable, and document how to extend token-garden.
- **User value:** the public demo stays up and free for everyone; self-hosters can point their own deployment at any OpenAI-compatible server that returns `top_logprobs` (for example vLLM), following `docs/EXTENDING.md`.
- **Scope:**
  - `worker/limits.ts`: `RL_ALL` on every request, `RL_MISS` only before an upstream call; keyed by `CF-Connecting-IP`; 429 with `Retry-After: 60`.
  - `worker/budget.ts`: KV `budget:<UTC date>` read before the upstream call; increment via `waitUntil` after success; TTL 2 days; 503 `budget_exhausted` at the cap; cache hits never count.
  - `worker/upstream/openaiCompatible.ts` (`fetch(${OPENAI_BASE_URL}/chat/completions)`, bearer `OPENAI_API_KEY`, `OPENAI_MODEL`, same parser, 503 `unavailable` when key or base URL is missing) and `worker/upstream/select.ts` (by `UPSTREAM`).
  - Upstream timeout `AbortSignal.timeout(10_000)` and one retry on 5xx.
  - `wrangler.jsonc`: `ratelimits` (`RL_MISS`: `namespace_id: "1001"`, `{limit: 20, period: 60}`; `RL_ALL`: `"1002"`, `{limit: 120, period: 60}`), `vars.DAILY_UPSTREAM_CAP: "1000"`. `.dev.vars.example` with empty `OPENAI_API_KEY=`.
  - Tests for all of the above with fakes and a mocked `fetch`.
  - `docs/EXTENDING.md` (~100 lines): the `LogprobProvider` interface and the contract suite; adding a Worker upstream (the OpenAI-compatible adapter as the worked example; how to check a host returns `top_logprobs` with the smoke script pattern); recording your own garden (`pnpm samples:record ...`) and adding it to `src/samples/index.ts`; theming via `tokens.css` (and re-running `tokens.test.ts`).
- **Acceptance criteria:**
  1. The 21st miss within one window from the same IP returns 429 with `Retry-After`; hits are only limited by `RL_ALL`.
  2. At `DAILY_UPSTREAM_CAP` the response is 503 `budget_exhausted`; hits still return 200.
  3. A timeout gives `upstream_error`; a 5xx is retried once; a 4xx is not retried.
  4. `UPSTREAM=openai-compatible` without a key returns 503 `unavailable`; with a mocked fetch it parses into the same response.
  5. `check:deploy` lists both ratelimit bindings; no secret values in any committed file.
  6. Every code path, command and file named in `docs/EXTENDING.md` exists (verifier follows it literally, minus the actual recording run).
- **Verifier checks:** the common steps + `check:deploy`; regression `check:browser --flows all --out docs/screenshots/phase-9`; read-through of `docs/EXTENDING.md`.
- **Risks:** KV counters are not atomic, so the cap is soft (accepted); free-tier KV ~1,000 writes/day fits a cap of 1000 (noted in DEPLOY.md).
- **Size:** ~330 lines of code and tests, plus ~100 lines of docs.

### Phase 10: Live mode in the UI
- **Branch:** `phase-10-live-mode`
- **Goal:** type a prompt and grow it lazily through the Worker, with caching, caps and calm empty, loading, error and unavailable states. Sample mode stays untouched and offline.
- **User value:** the user's own sentence becomes a garden, one cheap call per click, with honest labels about which model answered and what is sent where.
- **Scope:**
  - **`llm-integration`:** `src/llm/workerProvider.ts` (`fetch('/api/next-tokens')`; maps status and error envelope to `ProviderError`; passes the `AbortSignal`; maps 404, network failure or `navigator.onLine === false` to `unavailable`); `src/llm/cachedProvider.ts`; the contract suite run against both (mocked fetch), plus in-flight dedupe and k slicing tests.
  - **`implementer`:**
    - `src/live/LivePrompt.tsx`: textarea 1–280 chars with counter, Grow, privacy note, model label on the specimen label.
    - `src/components/states/EmptyState.tsx` (live empty state with 3 example chips that only fill the box) and `src/components/states/GrowingStub.tsx` (loading, §3.4/§3.6).
    - `src/live/useLiveGarden.ts`: same node-map shape and reducer as samples, plus per-node `loading` and `error`, abort on collapse or new prompt.
    - `src/live/limits.ts` (k = 5, depth 12, 150 calls per session), `src/live/messages.ts` (code → calm text, F11).
    - Mode switch in `App` (Samples | Your prompt); `prompt` in `urlState` (pre-fill only, D12); from a not-recorded sample branch, "Grow it live" pre-fills the prompt with that text.
    - `scripts/browser/flows/live.mjs` using `page.route('**/api/next-tokens')` with a deterministic fake keyed by prefix and scenarios: success, cache (repeat), 429 with `Retry-After`, 503 `unavailable`, network abort, depth limit.
- **Acceptance criteria:**
  1. F9: Grow makes 1 request; expanding 3 branches makes 3 more; collapsing and re-expanding them makes 0; the request log equals the number of unique prefixes.
  2. F10: a branch at depth 12 shows "depth limit" and cannot request; after 150 calls a calm message appears (unit level with an injected cap).
  3. F11: each error scenario shows its message inline at the right branch; the rest of the garden stays usable; switching to Samples still works.
  4. With no Worker at all (plain `vite preview`, no route mock), Grow shows the `unavailable` note; no console errors other than the one expected failed request, which the flow allow-lists.
  5. O1 still holds in sample mode: 0 `/api/*` requests until the user presses Grow; `?prompt=hello` pre-fills without any request.
  6. Keyboard alone can type, Grow and navigate live branches; loading is announced. The a11y-reviewer and dataviz-designer (empty, loading and error states vs §3.6) pass it.
- **Verifier checks:** the common steps; flow `live` with every scenario and request counting. All live behaviour is verified against the route mock; nothing requires live Workers AI.
  - **Screenshots:** `live-empty.png`, `live-grown.png`, `live-loading.png`, `live-rate-limited.png`, `live-unavailable.png`, `live-depth-limit.png`, `live-dark.png`, `live-mobile.png`.
- **Risks:** chat-style continuation differs from the recorded base model (clear F12 labels); size overrun (D14).
- **Size:** ~420 lines; split per D14 above ~450.

### Phase 11: README and community files
- **Branch:** `phase-11-readme-community`
- **Goal:** the repository sells the project in 10 seconds and makes contributing easy.
- **User value:** a visitor understands what token-garden is, sees it, and knows how to try it within 10 seconds of landing on the repo; a would-be contributor knows exactly where to start.
- **Scope:**
  - `scripts/browser/flows/hero.mjs` (excluded from `all`): lighthouse garden at T = 1 with a sampled path, 1280×720, light theme → `docs/brand/hero.png`.
  - `README.md` rewrite, in this order: logo mark + name; one-line pitch ("Watch a language model's next-token choices grow as a garden: thickness is probability, temperature reshapes it, no API key needed."); hero image; "Live demo: coming soon" (D20 placeholder); quick start (`git clone`, `pnpm install`, `pnpm dev`); "How it works" (recorded gardens, live mode through a Worker, one call per click, caching; a small diagram in a fenced block); accessibility; "Extend it" (link to `docs/EXTENDING.md`); roadmap (in-browser model, side-by-side temperatures, export, more languages); contributing; MIT licence. Keep it ≤ ~150 lines.
  - `CONTRIBUTING.md` (setup on Node 20.19/pnpm 9; the scripts and what each checks; the RAM-friendly rules: one browser, `check:browser` cleans up; how to record a sample; PR expectations: tests, CHANGELOG line, screenshots for UI; link to good first issues).
  - `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 verbatim, contact per D21), `SECURITY.md` (GitHub private vulnerability reporting; scope: the Worker and its limits).
  - `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml` (asks "what do you get, and what time or effort does it save?"), `new_garden.yml` (propose a sample prompt; non-finance, everyday), `config.yml`; `.github/pull_request_template.md`.
  - `docs/GOOD-FIRST-ISSUES.md` (≥ 8 candidates from §7's cut list, each with files and a "done when").
  - `CHANGELOG.md` tidy-up; `scripts/check-docs.mjs` + `check:docs` (S7); add `check:size` and `check:docs` to `ci/github-workflow.yml`.
- **Acceptance criteria:**
  1. S1: the rendered README's first screen contains logo, pitch, hero image, demo placeholder and quick start (verified on the rendered HTML, below).
  2. S2 and S3 files exist; `CODE_OF_CONDUCT.md` diffs clean against Contributor Covenant 2.1 apart from the contact line; nothing under `.github/workflows/`.
  3. `pnpm check:docs` passes; the quick start works verbatim from a fresh clone in `/tmp` (`pnpm install --frozen-lockfile && pnpm build`; `pnpm dev` started, fetched with curl, killed).
  4. Every image has meaningful alt text; no employer mention; no finance content.
- **Verifier checks:** the common steps + `check:docs`; render the README with `gh api -X POST /markdown -f mode=gfm -f context=geekplux/token-garden -F text=@README.md`, wrap it in a page whose `<base>` points at the repo root, open it in the one headless browser.
  - **Screenshots:** `readme-above-fold.png` (1280×800), `readme-full.png`, `readme-mobile.png`, plus the generated `docs/brand/hero.png`.
- **Risks:** README drifting into marketing fluff (keep claims checkable); template churn (keep templates short).
- **Size:** ~380 lines (README ~150, CONTRIBUTING ~80, templates ~60, good first issues ~45, scripts ~45); CODE_OF_CONDUCT excluded (D17).

### Phase 12: Examples gallery, social preview and launch kit
- **Branch:** `phase-12-gallery-launch`
- **Goal:** everything needed to share token-garden: a gallery of the recorded gardens, a hero GIF, a social preview image, and a launch kit with honest positioning.
- **User value:** visitors can jump straight to the most interesting forks; educators get ready-made scenarios; the project looks right wherever it is linked.
- **Scope:**
  - `scripts/browser/flows/gallery.mjs` (excluded from `all`): for each sample, open its most striking fork (chosen by the dataviz-designer from the real data, e.g. highest-entropy node) → `examples/img/<id>.png` (960×600).
  - `examples/README.md`: one section per garden (thumbnail, prompt, "what to notice" in 1–2 lines written from the real data, share link as `https://token-garden.example/?sample=<id>&path=...` (D20) and as a local `http://localhost:5173/?...` link); "Record your own garden" (one command, then how to add it); "Share yours" (the `new_garden` issue template). README links to it.
  - `scripts/brand/hero-gif.mjs` (D18) + `brand:hero-gif` script → `docs/brand/hero.gif` (≤ 8 s, ≤ 3 MB, 960 px wide); README uses the GIF with the PNG as fallback link. Runs alone; kills ffmpeg and the browser; temp frames under `.tmp/` deleted.
  - `docs/brand/social-preview.html` (1280×640: logo, wordmark, pitch, hero screenshot inlined as a data URL) and `scripts/browser/flows/brand.mjs` → `docs/brand/social-preview.png` (< 1 MB). `index.html` gets `og:image`/`twitter:card` pointing at the placeholder demo origin (updated after deploy).
  - `docs/LAUNCH.md`:
    - a bold first line: "Nothing in this file has been posted anywhere. Posting is Sean's decision."
    - Show HN draft (title ≤ 80 chars, body ≤ 250 words, first comment explaining how it works and the recorded vs live models);
    - X post draft (≤ 280 chars) plus a 3-post thread, each with the image to attach;
    - 3 demo scenarios with exact links and talk track: (1) "Why 'named'?" the robot garden, a confident fork vs a flat one; (2) "Greedy vs sampling" with T = 0 → 1.5 and a fixed seed for a classroom; (3) "Your own sentence" in live mode, showing one call per click and the cache;
    - comparison with alternatives (researched; keep it fair and dated): **logitloom** (vgel; explores token trajectory trees on base and instruct models; bring-your-own API key, eager depth/width expansion, a power tool), **Transformer Explainer** (Polo Club, Georgia Tech; runs GPT-2 small in the browser, explains the architecture, shows one step's next-token distribution with a temperature slider; MIT), **loom** (socketteer; a desktop "multiverse" writing interface for human-AI collaboration; needs an API key or a local model), **LLM Visualization** (bbycroft; a 3D walkthrough of a GPT's internals, not sampling). Where token-garden differs: zero setup with recorded offline gardens, thickness-as-probability over several steps, client-side temperature and seeded sampling, share links, keyboard and screen-reader support. Where others are better: model internals (Transformer Explainer, LLM Visualization), long-form writing (loom), arbitrary models and big trees (logitloom);
    - pre-launch checklist (demo deployed and links updated per DEPLOY.md, social preview uploaded in GitHub settings, repo description and topics set, CHANGELOG 0.1.0).
- **Acceptance criteria:**
  1. S4: `docs/brand/social-preview.png` is 1280×640 and < 1 MB; S5: all 6 gardens are in the gallery with existing images and links whose `path` values open a recorded fork (checked by the flow); `check:docs` passes.
  2. `docs/brand/hero.gif` exists, ≤ 3 MB, or the script's documented skip message is in the PR with the PNG kept.
  3. S6: LAUNCH.md has all listed parts, the "nothing posted" statement, no finance content, no employer mention, and every factual claim about alternatives matches their public README or site as of the PR date (links included).
  4. The dataviz-designer approves the gallery picks, hero and social preview against §3.
- **Verifier checks:** the common steps + `check:docs`; run `gallery` and `brand` flows; open each gallery link in the headless browser and assert `data-ready` and the selected `data-key`; `ps` shows no ffmpeg or Chrome left; check image dimensions and sizes with `file`/`stat`.
  - **Screenshots:** `gallery-readme.png` (examples/README rendered as in phase 11), `social-preview-check.png`, `hero-gif-frame-first.png`, `hero-gif-frame-last.png`.
- **Risks:** large binaries in git (size caps above); marketing claims that age (date the comparison, link sources); the GIF needing ffmpeg (D18 fallback).
- **Size:** ~360 lines (gallery ~70 + flow ~40, social template ~50 + flow ~25, GIF script ~50, LAUNCH ~130); images excluded.

### Phase 13: Cloudflare deployment preparation (stops for Sean's approval)
- **Branch:** `phase-13-deploy-prep`
- **Goal:** everything needed to deploy is ready and dry-run-verified, and the exact deploy command is documented. **Nothing is deployed.**
- **User value:** Sean can put the live demo online with one reviewed command, and self-hosters get a tested runbook to deploy their own copy.
- **Scope:**
  - Finalize `wrangler.jsonc`: `observability: {enabled: true}`, `workers_dev: true`, a comment pointing to `docs/DEPLOY.md`, every binding from phases 8–9.
  - `public/_headers`: CSP `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, long-cache `/assets/*`.
  - `docs/DEPLOY.md`, the runbook:
    1. prerequisites: a valid `CLOUDFLARE_API_TOKEN` with Workers Scripts edit, Workers KV edit and Workers AI permissions, and `CLOUDFLARE_ACCOUNT_ID`;
    2. `pnpm install --frozen-lockfile && pnpm build && pnpm run check:deploy`;
    3. `node scripts/smoke-workers-ai.mjs` must show `top_logprobs` length 8; if not, set `UPSTREAM=openai-compatible`;
    4. KV: auto-provisioned on first deploy, or `pnpm exec wrangler kv namespace create token-garden-cache` and paste the id;
    5. fallback upstream only: `pnpm exec wrangler secret put OPENAI_API_KEY`;
    6. **the exact deploy command, `pnpm exec wrangler deploy`, run only by Sean or after his explicit approval**;
    7. post-deploy checks: `curl -s -X POST https://<worker>.workers.dev/api/next-tokens -H 'content-type: application/json' -d '{"prefix":"Once upon a time","k":5}'`, open the site and check the console for CSP errors, repeat the call to see `cached: true`;
    8. after deploy: replace `https://token-garden.example` in README, examples, LAUNCH and `index.html` (D20), upload the social preview in GitHub settings;
    9. rollback: `pnpm exec wrangler rollback`;
    10. cost and limit notes (free-tier KV writes, daily cap).
  - `check:deploy` step in `ci/github-workflow.yml`; README "Deploy your own" section linking DEPLOY.md; CHANGELOG `[0.1.0]` section prepared (undated until release).
- **Acceptance criteria:**
  1. `pnpm build && pnpm run check:deploy` passes without a valid token and lists `AI`, `TG_CACHE`, `RL_MISS`, `RL_ALL`, `ASSETS` and the vars; `.wrangler/dry-run/` contains the bundle and is not committed.
  2. `dist/_headers` exists after the build; the headless check against `vite preview` is unaffected.
  3. The PR description contains the exact deploy command and "awaiting Sean's approval to deploy"; STATUS.md shows `STATE: DONE` with that note.
  4. No deploy happened: no `wrangler deploy` without `--dry-run` in shell history or logs; no Worker URL exists.
- **Verifier checks:** the common steps + `check:deploy` + `check:docs`; full regression `check:browser --flows all --out docs/screenshots/phase-13`.
  - **Screenshots:** `final-desktop.png`, `final-mobile.png`, `final-dark.png`, `final-live-unavailable.png`.
- **Risks:** Workers AI logprobs unverified until Sean supplies a valid token (smoke step before deploy, fallback upstream); CSP blocking an inline style React emits (preview does not apply `_headers`, so the runbook adds a post-deploy console check).
- **Size:** ~180 lines of code and config, plus ~130 lines of docs.

### Phase summary

| n | Branch | Goal | Est. lines |
|---|---|---|---|
| 1 | `phase-1-toolchain` | Toolchain, self-cleaning headless check, tiny bundled sample rendered, MIT licence, CHANGELOG | ~400 |
| 2 | `phase-2-identity` | Specimen-plate identity: colour tokens (tested), self-hosted fonts, logo/wordmark/favicon, app shell, size budget, CVD harness | ~340 |
| 3 | `phase-3-garden-encoding` | Viz spec + thickness, labels, legend, remainder, readout | ~380 (+150 docs) |
| 4 | `phase-4-explore-share` | Provider interface, recorded expand/collapse, not-recorded state, motion, share links | ~390 |
| 5 | `phase-5-keyboard-a11y` | Keyboard tree navigation, ARIA tree, Table view, live region | ~360 |
| 6 | `phase-6-recorded-samples` | Recorder (one-command) + 6 real gardens + picker + `?sample=` | ~400 (+JSON) |
| 7 | `phase-7-temperature-sampling` | Client-side temperature, seeded path sampling, entropy, How to read | ~390 |
| 8 | `phase-8-worker-core` | `/api/next-tokens`, Workers AI adapter, KV cache, errors, `check:deploy` | ~400 |
| 9 | `phase-9-worker-limits` | Rate limits, daily cap, timeout/retry, OpenAI-compatible upstream, EXTENDING.md | ~330 (+100 docs) |
| 10 | `phase-10-live-mode` | Prompt box, lazy cached live growth, caps, empty/loading/error states | ~420 |
| 11 | `phase-11-readme-community` | README that sells in 10 s, CONTRIBUTING, CoC, SECURITY, templates, good first issues, check:docs | ~380 |
| 12 | `phase-12-gallery-launch` | examples/ gallery, hero GIF, social preview, docs/LAUNCH.md | ~360 (+images) |
| 13 | `phase-13-deploy-prep` | wrangler config, headers, runbook, dry run; stops for Sean's approval | ~180 (+130 docs) |

---

## 7. Out of scope (and what was cut)

Not built, with the reason:

- Actually deploying, custom domains and DNS: they wait for Sean.
- Accounts, server-side storage of prompts or gardens, server-stored shares, analytics and telemetry: they add cost and privacy risk; URL share links cover sharing.
- The in-browser model provider (transformers.js/WebGPU): ~134 MB download and ~0.6 GB RAM per user break "first step costs almost nothing". A roadmap item only.
- Side-by-side model comparison, streaming generation, chat history, prompt templates: not needed to understand sampling.
- Pan/zoom canvas, minimap, internationalisation of the UI: the default gardens fit the viewport; the table view covers dense trees.
- D1, R2, Durable Objects, and a strict atomic budget counter (the soft KV cap is accepted).
- A user-facing CLI or agent skill: none is planned. If one is ever added it must meet the wheresryan22/anatomy bar (SKILL.md + kit + references + audit scripts + evals) and have a one-command try-it.
- Anything finance-related, any decorative 3D.

Cut by "value, then convenience" and listed as good-first-issue candidates (phase 11, `docs/GOOD-FIRST-ISSUES.md`):

1. Type-ahead in the garden tree (WAI-ARIA optional; arrows already reach everything).
2. A manual light/dark toggle (the OS preference is already respected).
3. Export the current garden as SVG/PNG.
4. "Compare temperatures" split view (two gardens at different T).
5. A seventh recorded garden in another language (via the `new_garden` template and the recorder).
6. Keyboard shortcut overlay (`?`) listing the tree keys.
7. Show raw logprob next to the percentage in the Table view.
8. Remember the last opened sample in `localStorage`.
9. A recipe in EXTENDING.md for a specific self-hosted OpenAI-compatible server, verified with its own logprobs.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Workers AI `top_logprobs` unverified (the box token is a placeholder) | Live mode may not work as designed | Live mode is isolated behind `LogprobProvider`; all verification uses fakes and route mocks; the smoke script and runbook step come before deploy; the OpenAI-compatible fallback is built (a key becomes a blocker); samples never depend on it |
| Node 20 on the box vs tool majors needing Node 22 | Install or engine failures | Pins in §5.6 (D1); CI uses Node 20.19 too |
| RAM: Chrome (~300 MB), recorder (~600 MB), wrangler/workerd, ffmpeg, other agents | OOM, flaky checks | One browser at a time; the recorder and the GIF script never run alongside a browser check; Vitest `maxWorkers: 2`; harness cleanup even on failure (phase 1 AC3); `ps` check in every verify; recorder `node_modules` and model cache deleted after use |
| Dense or deep trees become unreadable | Poor first impression | Default expansion D11, fixed `nodeSize`, horizontal scroll container, truncation rules in the spec, Table view |
| Identity drifts into a generic template or decoration | The project looks like everything else | §3 is concrete (tokens, fonts, mark, states); `tokens.test.ts`; designer review in phases 2, 3, 4, 7, 10, 12 |
| Fonts add weight or layout shift | Slower first view | Two latin subsets ≤ 45 KB, `font-display: swap`, monospace width estimate so layout never depends on the loaded font, P1 budget in `check:size` |
| SVG ARIA support varies across screen readers | A2 weaker in practice | The Table view is a complete alternative; fallback noted in phase 5 |
| Temperature over top-k is an approximation | Users are misled | "approximate (top-k only)" note, remainder shown (D8), How to read panel |
| Recorded (base SmolLM2) and live (chat GLM) distributions differ in character | Confusion | Model on every specimen label (F12); re-record via `--provider worker` later |
| Tokenizer artefacts (byte pieces, special tokens, leading spaces) | Garbled labels | Decode, filter and normalize in the recorder and `shared/llm/normalize.ts`; visible-whitespace rendering |
| Share links break when a recording changes | Old links open a different fork | Rank-index paths restore the longest valid prefix with a notice; recordings change rarely and the schema is versioned |
| Packaging claims or comparisons age or overstate | Credibility loss at launch | Claims are checkable; comparison is dated and linked; nothing is posted by agents |
| Binary assets bloat the repo | Slow clones | Caps: hero GIF ≤ 3 MB, social preview < 1 MB, gallery PNGs 960×600 |
| Phase size creep | Reviews longer than 20 min | Per-phase estimates, the D14 split rule, D17 counting rule, a main-agent `git diff --stat` check before submit |
| Timing thresholds (P2–P4) flake on a loaded shared machine | False FAILs | Median of 3, generous thresholds, one re-run before reporting FAIL |
| Upstream abuse or cost | Spend or quota exhaustion | Lazy calls only, client cache, KV cache, per-IP rate limits, daily cap, input limits |
| `wrangler deploy --dry-run` touches auth because of the placeholder token | `check:deploy` fails on the box | Detected early (phase 8); blank the token for the dry run only, and record it |
