# Publishing the `reasontrail` CLI to npm

The CLI lives in `cli/` as its own zero-dependency package, published to npm as
[`reasontrail`](https://www.npmjs.com/package/reasontrail) (0.1.0 by hand on 2026-10-27; later versions from a tag).

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

Releases are published by GitHub Actions, the same way as vert and markvis: `.github/workflows/release.yml`
runs when a `v<version>` tag is pushed (for example `v0.1.1`). It runs the whole `ci.yml` first, fails unless the
tag is `v` + `version` in `cli/package.json`, runs `build:cli`, `check:pack` and `cli.mjs --version`, and then
`npm publish --provenance --access public` from `cli/`. npm trusted publishing authenticates it through GitHub
OIDC: no token is stored anywhere.

### 3a. Once: the first version, by hand

npm lets a trusted publisher be set only on a package that exists, so 0.1.0 goes up from your machine:

```sh
git switch main && git pull     # a clean main
pnpm install --frozen-lockfile
pnpm build:cli && pnpm check:pack
npm login                       # the geekplux account
cd cli && npm publish --access public   # add --otp <code> if npm asks for it
```

Do not push a `v0.1.0` tag: `release.yml` would try to publish 0.1.0 again and fail.

Then on npmjs.com: Packages → `reasontrail` → **Settings** → **Trusted publishing** → **GitHub Actions**:

| Field | Value |
|---|---|
| Organization or user | `geekplux` |
| Repository | `reasontrail` |
| Workflow filename | `release.yml` |
| Environment name | leave blank |

Then under **Settings** → **Publishing access**, choose "Require two-factor authentication and disallow tokens";
trusted publishing keeps working.

### 3b. Every release after that

1. In a pull request: bump `version` in `cli/package.json` and `VERSION` in `skills/reasontrail/kit/run.mjs` (a test
   keeps them equal), and add a dated `## [<version>] - <date>` heading to `CHANGELOG.md`. Merge it.
2. Tag the merge and push the tag:

   ```sh
   git switch main && git pull
   git tag v0.1.1 && git push origin v0.1.1
   ```

   Watch the run under Actions → release.

## 4. After publishing

1. **Verify from a clean folder,** outside the repository, with no global install:

   ```sh
   cd "$(mktemp -d)" && npx --yes reasontrail@<version> --help && npx --yes reasontrail@<version> --version
   ```

   The help starts with `reasontrail <version>:` and the command exits 0. Then try `npx reasontrail` in a folder
   that has a Claude Code session.

To withdraw a broken release, prefer `npm deprecate reasontrail@<version> "<why>"` and publish a fix; `npm unpublish`
works only within 72 hours and blocks the version number for good.
