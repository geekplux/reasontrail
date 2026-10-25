# Phase 35: before, canvas, after

- **Before:** the app on `origin/main` before redesign v7 (built in a temporary worktree, shot with its own polish flow), in `before/`.
- **Canvas:** the design canvas frames, `docs/design/v7/frames/` (`node scripts/design/canvas.mjs frames`).
- **After:** the app at the end of phase 35: `app-*.webp` for the six canvas states, `after/` for every page (`pnpm check:browser --flows polish`).
- **Pairs** (`pair-*.webp`, `canvas.mjs pair`): the canvas frame on the left, the app on the right, at the same viewport and theme.

## The six canvas states

| State | Before | Canvas | After | Pair |
|---|---|---|---|---|
| Home 1440 light | [before](before/home-1440-light.webp), [full](before/home-1440-light-full.webp) | [frame](../../design/v7/frames/home-1440-light.webp), [first screen](../../design/v7/frames/home-1440-light-fold.webp) | [full](app-home-1440-light.webp), [first screen](app-home-1440-light-fold.webp) | [full](pair-home-1440-light.webp), [first screen](pair-home-1440-light-fold.webp) |
| Home 1440 dark | [before](before/home-1440-dark.webp) | [frame](../../design/v7/frames/home-1440-dark.webp), [first screen](../../design/v7/frames/home-1440-dark-fold.webp) | [full](app-home-1440-dark.webp), [first screen](app-home-1440-dark-fold.webp) | [full](pair-home-1440-dark.webp), [first screen](pair-home-1440-dark-fold.webp) |
| Hover 1440 light (episode 7) | (no hover state before) | [first screen](../../design/v7/frames/hover-1440-light-fold.webp) | [first screen](app-hover-1440-light-fold.webp) | [first screen](pair-hover-1440-light-fold.webp) |
| Step 1440 light (s41) | [detail panel](before/step-1440-light.webp) | [frame](../../design/v7/frames/step-1440-light.webp), [first screen](../../design/v7/frames/step-1440-light-fold.webp) | [full](app-step-1440-light.webp), [first screen](app-step-1440-light-fold.webp) | [full](pair-step-1440-light.webp), [first screen](pair-step-1440-light-fold.webp) |
| Phone 390 light | [before](before/home-390-light.webp) | [frame](../../design/v7/frames/phone-390-light.webp), [first screen](../../design/v7/frames/phone-390-light-fold.webp) | [full](app-phone-390-light.webp), [first screen](app-phone-390-light-fold.webp) | [full](pair-phone-390-light.webp), [first screen](pair-phone-390-light-fold.webp) |
| Open 1440 light | [before](before/open-1440-light.webp) | [first screen](../../design/v7/frames/open-1440-light-fold.webp) | [first screen](app-open-1440-light.webp) | [first screen](pair-open-1440-light.webp) |

## Pages without a canvas frame (before and after)

| Page | Before | After |
|---|---|---|
| Home, phone dark | (none) | [390 dark](after/home-390-dark.webp) |
| Step, dark and phone | [390](before/step-390-light.webp) | [1440 dark](after/step-1440-dark.webp), [390](after/step-390-light.webp) |
| Open a session, phone | [390](before/open-390-light.webp) | [390](after/open-390-light.webp) |
| Opened file (`trouble.jsonl`) | (none) | [1440](after/opened-1440-light.webp), [full](after/opened-1440-light-full.webp), [390](after/opened-390-light.webp) |
| Map a chat | (none) | [1440](after/chat-import-1440-light.webp), [390](after/chat-import-390-light.webp) |
| A mapped chat | [1440](before/chat-map-1440-light.webp) | [1440](after/chat-map-1440-light.webp), [full](after/chat-map-1440-light-full.webp), [390](after/chat-map-390-light.webp) |
| Local viewer (CLI map) | [1440](before/cli-viewer-1440-light.webp) | [1440](after/cli-viewer-1440-light.webp), [full](after/cli-viewer-1440-light-full.webp), [dark](after/cli-viewer-1440-dark.webp), [390](after/cli-viewer-390-light.webp) |
| How to read a map | (a folded section of the old home) | [1440](after/how-1440-light.webp), [full](after/how-1440-light-full.webp), [390](after/how-390-light.webp) |
| Install | [1440](before/install-1440-light.webp) | [1440](after/install-1440-light.webp), [390](after/install-390-light.webp) |
| Share dialog | [1440](before/share-dialog-1440-light.webp) | [1440](after/share-dialog-1440-light.webp), [390](after/share-dialog-390-light.webp) |
| Next-token garden | [1440](before/garden-1440-light.webp) | [1440](after/garden-1440-light.webp), [390](after/garden-390-light.webp) |
| Lens on a sentence | [1440](before/lens-1440-light.webp) | [1440](after/lens-1440-light.webp), [390](after/lens-390-light.webp) |
