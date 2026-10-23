# Publishing the `reasontrail` CLI to npm

The CLI lives in `cli/` as its own zero-dependency package. It is not on npm yet: `cli/package.json` keeps
`"private": true` so nothing can be published by accident.

> **Approval required (PLAN D36).** Publishing is like deploying: a name and a version on npm cannot be taken back.
> Steps 3 and 4 are run only by Sean, or by someone else after his explicit approval. Steps 1 and 2 are safe at any
> time, and so is a manual dry run of the publish workflow.

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

Releases are published by GitHub Actions: `.github/workflows/publish-cli.yml`. It runs when a GitHub release
whose tag is `cli-v<version>` is published. It checks that the tag matches `version` in `cli/package.json`, that
`"private": true` is gone and that the version is not on npm yet. Then it runs lint, typecheck, tests,
`build:cli`, `check:pack` and `cli.mjs --version`, and only after that runs `npm publish --access public` from
`cli/`. A pre-release goes out under the dist-tag `next`. A manual run (Actions → publish-cli → Run workflow)
is a dry run by default and publishes nothing.

### 3a. One-time setup (Sean)

npm trusted publishing (OIDC) needs no stored token, but npm can only attach a trusted publisher to a package
that **already exists**. So the very first version goes out with a short-lived token (or by hand), and every
later release uses OIDC.

1. **First publish (bootstrap).** Pick one:
   - **From the workflow (recommended):** on npmjs.com create a **granular access token** (Access Tokens →
     Generate New Token → Granular): permission *Read and write*, packages *All packages* (the package does not
     exist yet), expiry 7 days. In GitHub, add it as the secret `NPM_TOKEN` (repo Settings → Secrets and
     variables → Actions, or as an environment secret of the `npm` environment). Then cut the release as in 3b.
   - **By hand:** `npm login`, then `pnpm build:cli && pnpm check:pack && cd cli && npm publish --access public`
     (add `--otp <code>` with 2FA). Then tag and release as in 3b so the tag exists.
2. **Add the trusted publisher.** On npmjs.com: Packages → `reasontrail` → Settings → Trusted publishing →
   GitHub Actions, and enter exactly:

   | Field | Value |
   |---|---|
   | Organization or user | `geekplux` |
   | Repository | `reasontrail` |
   | Workflow filename | `publish-cli.yml` |
   | Environment name | `npm` |
   | Allowed actions | tick **npm publish** (configurations created since 2026-09-03 allow only `npm stage publish` by default) |

   The first publish through the new configuration must happen within 2 days, or it expires and has to be
   recreated.
3. **Remove the token.** Delete the `NPM_TOKEN` secret and revoke the token on npmjs.com. Then under Settings →
   Publishing access choose "Require two-factor authentication and disallow tokens". OIDC keeps working.
4. **Optional:** in GitHub, Settings → Environments → `npm` (created on the first run), add yourself as a
   required reviewer so every publish waits for a click.

**Token-only fallback.** If you skip trusted publishing, keep `NPM_TOKEN` as a granular token limited to the
`reasontrail` package with *Read and write*, and rotate it before it expires. The workflow uses it whenever the
secret is set.

**Provenance.** npm attaches a provenance statement automatically with OIDC, but only for public repositories.
While `geekplux/reasontrail` is private, packages are published without provenance; nothing needs to change in
the workflow when the repository goes public.

### 3b. Each release

1. Set the version in `cli/package.json` (`0.1.0` for the first release) and add the release date to
   `CHANGELOG.md`'s `[0.1.0]` heading. For the first release, also delete the line `"private": true,` from
   `cli/package.json`.
2. Run `pnpm build:cli && pnpm check:pack`, commit, and push to `main`.
3. Create the release. The tag must be `cli-v` plus the version:

   ```sh
   gh release create cli-v0.1.0 --target main --title "reasontrail CLI 0.1.0" --notes-file <notes.md>
   ```

   (or GitHub → Releases → Draft a new release, tag `cli-v0.1.0`). Watch the run under Actions → publish-cli.

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
