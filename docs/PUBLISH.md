# Publishing the `reasontrail` CLI to npm

The CLI lives in `cli/` as its own zero-dependency package. It is not on npm yet: `cli/package.json` keeps
`"private": true` so nothing can be published by accident.

> **Approval required (PLAN D36).** Publishing is like deploying: a name and a version on npm cannot be taken back.
> Steps 3 and 4 are run only by Sean, or by someone else after his explicit approval. Steps 1 and 2 are safe at any
> time.

## 1. Build and check the tarball

```sh
pnpm install --frozen-lockfile && pnpm build:cli && pnpm check:pack
```

`check:pack` (`scripts/check-pack.mjs`) runs `pnpm --dir cli pack` into a temporary folder, lists the tarball and
fails unless it holds exactly these files, with the viewer's data slot still empty and no session data:

```text
LICENSE            a copy of the root LICENSE (MIT)
README.md          cli/README.md, the npm page
dist/cli.mjs       the CLI, one file, no dependencies (about 150 KB)
dist/viewer.html   the self-contained viewer template (about 230 KB)
package.json
```

No fixtures, samples, sessions or source files are included (`"files": ["dist"]` in `cli/package.json`; npm always
adds `package.json`, `README.md` and `LICENSE`). The temporary tarball is deleted afterwards; never commit a `.tgz`.
CI runs the same check.

To look at the tarball by hand: `pnpm --dir cli pack --pack-destination .tmp` and `tar -tzf .tmp/reasontrail-*.tgz`.

## 2. The name (PLAN D25)

The package and its bin are both `reasontrail`, written everywhere through `PKG_NAME` in `shared/commands.ts`.
`npm view reasontrail` answered `404 Not Found` on 2026-10-22, so the name was free then. Check again right before
publishing:

```sh
npm view reasontrail   # E404 means the name is free
```

If it is taken, pick a scoped name (for example `@geekplux/reasontrail`), change `name` in `cli/package.json` and
`PKG_NAME` in `shared/commands.ts`, and run `pnpm test` and `pnpm check:docs`; the bin can stay `reasontrail`.

## 3. Publish (Sean, or after his approval)

1. Set the version in `cli/package.json` (`0.1.0` for the first release) and add the release date to
   `CHANGELOG.md`'s `[0.1.0]` heading.
2. Remove the line `"private": true,` from `cli/package.json`.
3. Rebuild, check and publish from `cli/`:

   ```sh
   pnpm build:cli && pnpm check:pack
   npm login                                   # once, as the account that will own the package
   cd cli && npm publish --access public       # add --otp <code> if the account uses 2FA
   ```

4. Commit the `package.json` change, then tag the release: `git tag v0.1.0`.

## 4. After publishing

1. **Pin the skill kit.** In `skills/reasontrail/kit/run.mjs`, turn on the last fallback as
   `npx --yes reasontrail@<version> --current` (the comment at the top of the file marks the spot), so a skill
   installed without a local CLI still works and always runs the version it was tested with. Run
   `pnpm skill:audit && pnpm skill:evals`.
2. **Docs.** Remove the README's "Not on npm yet" note (the "From a clone" section can stay for contributors) and
   update `docs/LAUNCH.md`'s checklist.
3. **Verify from a clean folder,** outside the repository, with no global install:

   ```sh
   cd "$(mktemp -d)" && npx --yes reasontrail@<version> --help && npx --yes reasontrail@<version> --version
   ```

   The help starts with `reasontrail <version>:` and the command exits 0. Then try `npx reasontrail` in a folder
   that has a Claude Code session.

To withdraw a broken release, prefer `npm deprecate reasontrail@<version> "<why>"` and publish a fix; `npm unpublish`
works only within 72 hours and blocks the version number for good.
