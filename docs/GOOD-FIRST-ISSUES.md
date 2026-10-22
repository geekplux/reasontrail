# Good first issues

Scoped tasks for a first contribution. Each one lists why it matters, the files to start from and when it is done. Comment on (or open) an issue before you start so two people do not build the same thing, then follow [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## 1. An adapter for another agent (Cursor or Aider)

- **Why:** more people can map their sessions.
- **Files:** a new `shared/session/adapters/<name>.ts`, `shared/session/adapter.ts`, `shared/session/types.ts`, `cli/src/locate/<name>.ts`, `cli/src/locate/index.ts`, a synthetic fixture in `fixtures/sessions/<name>/`.
- **Done when:** `checkAdapterContract` passes for the new adapter, `--list` finds its sessions in a sandbox `HOME`, and `docs/EXTENDING.md` section 5 names it.

## 2. `--watch`: re-render while a session grows

- **Why:** follow a long-running agent without re-running the command.
- **Files:** `cli/src/args.ts`, `cli/src/main.ts`, `cli/test/`.
- **Done when:** with `--watch` the HTML file is rewritten (debounced) when the session file grows, Ctrl+C exits cleanly, and a test covers the debounce with a fake clock. No server is started.

## 3. Export the outline as Markdown

- **Why:** paste what an agent did into a pull request description.
- **Files:** `src/map/Outline.tsx`, a new pure `src/map/outlineMarkdown.ts`, `cli/src/args.ts` (a `--markdown` flag).
- **Done when:** the Markdown has the task, the episodes, the trouble and the outcome; it is byte-identical for the same graph (snapshot test); a redacted graph stays redacted.

## 4. A manual light/dark toggle

- **Why:** some people want the map in the other theme than their system.
- **Files:** `src/components/AppShell.tsx`, `src/styles/tokens.css`.
- **Done when:** the toggle is a labelled button, the choice survives a reload (`localStorage`), the system setting is the default, and both themes keep their contrast tests in `src/styles/tokens.test.ts` passing.

## 5. A keyboard shortcut overlay (`?`)

- **Why:** the map and the garden have many keys, and few people read the help.
- **Files:** `src/map/KeyHelp.tsx`, `src/map/keyboard.ts`, `src/garden/keyboard.ts`.
- **Done when:** `?` opens a modal dialog listing the keys for the view you are in, Esc closes it and returns focus, and axe reports nothing in `pnpm check:browser --flows keyboard`.

## 6. Remember the last opened sample

- **Why:** coming back to the website should show what you were reading.
- **Files:** `src/Site.tsx`, `src/app/urlState.ts`.
- **Done when:** with no `?session=` in the address, the last chosen sample opens; an explicit `?session=` always wins; storage errors (private mode) are ignored. Unit tests cover all three.

## 7. Another trouble rule: "long idle wait"

- **Why:** a long pause in the middle of a session is often the agent waiting on something worth knowing about.
- **Files:** `shared/session/build/trouble.ts`, `shared/session/build/constants.ts`, a fixture in `fixtures/sessions/claude-code/`.
- **Done when:** the rule fires only above a threshold in `constants.ts`, lists its evidence steps, shows in "Where it got stuck", and a fixture test proves both a hit and a miss.

## 8. Render `**bold**` in excerpts

- **Why:** the final answer and other excerpts show Markdown asterisks literally (a phase 25 audit follow-up).
- **Files:** `src/map/OutcomeCard.tsx`, `src/map/details.ts`.
- **Done when:** `**text**` renders as bold text without `dangerouslySetInnerHTML`, other Markdown stays plain, and a unit test covers nested and unclosed markers.

## 9. One time format in `--list`

- **Why:** `--list` mixes two time formats, which makes the newest session hard to spot (a phase 25 follow-up).
- **Files:** `cli/src/main.ts`, `cli/src/locate/store.ts` (`describe`), `cli/test/`.
- **Done when:** every row uses the same format, rows line up, and a test pins the output with a fixed clock.

## 10. A self-hosted model recipe for AI labels

- **Why:** run the optional AI labels against your own OpenAI-compatible server.
- **Files:** `docs/EXTENDING.md` section 2, `worker/upstream/`.
- **Done when:** the recipe lists the exact `wrangler.jsonc` variables and `.dev.vars` entries, and was checked once against a local server with `pnpm dev:worker`.
