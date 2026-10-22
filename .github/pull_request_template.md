## What and why

<!-- One change, reviewable in about 20 minutes. Link the issue if there is one. -->

## How it was checked

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- [ ] `pnpm check:docs` (if docs changed), `pnpm audit:samples` (if samples or fixtures changed)
- [ ] Tests added or updated next to the code
- [ ] A line in `CHANGELOG.md` under "Unreleased"

## UI changes

<!-- Screenshots (light and dark if colours changed). -->

- [ ] Works with the keyboard alone, and focus is always visible
- [ ] Controls and readouts have screen-reader names
- [ ] Colour is never the only signal, and categories stay distinct under a protanopia, deuteranopia and tritanopia simulation
- [ ] Motion stops under reduced motion
- [ ] `pnpm check:browser` reports no axe violations

## Privacy

- [ ] No real session transcripts, secrets or private paths in this pull request
