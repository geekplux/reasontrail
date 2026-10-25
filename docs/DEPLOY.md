# Deploying Reasontrail to Cloudflare

One Worker, `reasontrail`, serves the showcase site (static assets from `dist/`) and the two optional AI endpoints,
`POST /api/next-tokens` (the zoom-in lens) and `POST /api/structure` (AI titles). Everything else in Reasontrail runs
on the reader's machine, so the site still works if the endpoints are switched off.

Production deploys run in **Cloudflare Workers Builds**, connected to this GitHub repository: every push to `main`
builds and deploys. Nothing in this repo deploys by itself, and there is no `deploy` script. Connecting the
repository (step 4) is Sean's decision; everything before it is safe to run at any time.

## 1. Prerequisites

- A Cloudflare account with Workers enabled. Workers AI and KV are on every plan; see [cost](#9-cost) for limits.
- Node 22+ (`.nvmrc`; wrangler 4.151 needs Node 22, which Workers Builds also uses) and pnpm 9 (`corepack enable`).
  The published CLI itself still runs on Node 20.19+.
- Authentication for wrangler, either one of:
  - `pnpm exec wrangler login` (a browser login, stored by wrangler), or
  - `CLOUDFLARE_API_TOKEN` (a token from the "Edit Cloudflare Workers" template, plus Workers AI and KV edit
    permissions) and `CLOUDFLARE_ACCOUNT_ID` in the environment. Never commit them; locally they can live in
    `.dev.vars` or your shell.

## 2. Build and dry run

```sh
pnpm install --frozen-lockfile && pnpm build && pnpm run check:deploy
```

`pnpm build` is the production build (there is no separate `build:prod`): it builds the viewer template first and
emits it as `dist/viewer.html`. `pnpm build:cli` builds the npm package (`cli/dist/`) and is not part of the deploy.
`check:deploy` is `wrangler deploy --dry-run --outdir .wrangler/dry-run`: it bundles the Worker, reads `dist/` and
`dist/_headers`, and prints the bindings without contacting Cloudflare (no valid token needed). Expect (v7, wrangler
4.151; the asset count and upload size move with the build):

```text
Read 33 files from the assets directory .../dist
Total Upload: 22.99 KiB / gzip: 7.25 KiB
env.TG_CACHE (91c14bfbe1444937a095418ee3a2f6ac)   KV Namespace
env.AI                                            AI
env.RL_MISS (20 requests/60s)                     Rate Limit
env.RL_ALL (120 requests/60s)                     Rate Limit
env.ASSETS                                        Assets
env.MODEL_ID ("@cf/zai-org/glm-4.7-flash")        Environment Variable
env.UPSTREAM ("workers-ai")                       Environment Variable
env.DAILY_UPSTREAM_CAP ("1000")                   Environment Variable
--dry-run: exiting now.
```

"Total Upload" is the Worker bundle only; the static assets are uploaded separately and only when they change.

If wrangler ever complains about a malformed token during the dry run, run it once with the variable blanked:
`CLOUDFLARE_API_TOKEN= pnpm run check:deploy`.

Optionally run the browser flows under the production headers: `pnpm check:browser --headers` serves `dist/`
through `scripts/serve-dist.mjs`, which applies `public/_headers` the way Workers static assets do.

## 3. Before the first deploy

1. **Social image.** Open the site locally (`pnpm preview`), keep the default sample, choose **Share** on the session
   card → "Download map card (PNG)" (1200×630, light theme), and save it as `public/og-card.png`. Commit it. `index.html`
   already points `og:image` at `/og-card.png`.
2. **KV namespace (done).** The production namespace `REASONTRAIL_CACHE` exists and its id
   (`91c14bfbe1444937a095418ee3a2f6ac`) is pinned on the `TG_CACHE` entry in `wrangler.jsonc`. If you ever recreate
   it, run `pnpm exec wrangler kv namespace create REASONTRAIL_CACHE` and replace the id. Never commit a made-up
   placeholder id; `wrangler deploy` fails on an id that does not exist.
3. **Upstream (optional).** The default upstream is Workers AI through the `AI` binding: no key. Only if you set
   `UPSTREAM` to `openai-compatible` (and `OPENAI_BASE_URL`, `OPENAI_MODEL` in `vars`), add the key as a secret:

   ```sh
   pnpm exec wrangler secret put OPENAI_API_KEY
   ```

4. **Rate limiters (done).** `namespace_id` is account-wide: Workers that share an id share counters. Reasontrail
   uses `6001` (`RL_MISS`) and `6002` (`RL_ALL`) in production and `6101`/`6102` in branch previews; sibling Workers
   on the account use 1xxx–5xxx. If you add a Worker to the account, give it ids outside 6xxx.
5. **Daily cap (done).** `DAILY_UPSTREAM_CAP` (`"1000"`) bounds upstream model calls per UTC day across all users
   (`worker/budget.ts`). The lens page says so beside the live opt-in ("Live model calls are capped per day.") and
   under the live status; past the cap the Worker answers `503 budget_exhausted` and the lens shows a calm message.
6. **Smoke test the model.** One real Workers AI call that checks `top_logprobs` come back (needs
   `CLOUDFLARE_ACCOUNT_ID` and a valid `CLOUDFLARE_API_TOKEN`; prints `SKIPPED` without them):

   ```sh
   node scripts/smoke-workers-ai.mjs
   ```

   If it fails, deploy anyway with `DAILY_UPSTREAM_CAP` set to `"0"` (live calls off; recorded lens data and the
   whole site keep working) and see `docs/llm-provider.md` for the fallbacks.

## 4. Deploy with Workers Builds (Sean, or after his approval)

One-time, in the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**, pick GitHub (authorise
the Cloudflare app for `geekplux/reasontrail` if asked) and select the repository. Use these settings (later under
Workers → reasontrail → Settings → Builds):

| Setting | Value |
|---|---|
| Project / Worker name | `reasontrail` (must equal `name` in `wrangler.jsonc`) |
| Production branch | `main` |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview command (non-production branches) | `npx wrangler preview` (the default) |
| Root directory | `/` (the repository root) |
| Build variables | none needed (Node comes from `.nvmrc`, pnpm from `packageManager`) |

The first build deploys to `reasontrail.geekplux.com` (the custom-domain route in `wrangler.jsonc`) and to
`https://reasontrail.<account-subdomain>.workers.dev`. After that, every push to `main` deploys production.

- **Production** is the top level of `wrangler.jsonc`. There are no named environments, so the bare
  `npx wrangler deploy` deploys it with no "multiple environments" warning.
- **Branch previews** use the `previews` block of `wrangler.jsonc`, because Previews inherit none of the
  top-level bindings. They serve the full site with the AI endpoints off (`UPSTREAM` `"off"` → a clear 503, no AI
  binding, so no model cost), with their own rate-limit counters and without KV. To try live AI on a Preview,
  add `"ai": { "binding": "AI" }`, a separate KV namespace and `UPSTREAM` `"workers-ai"` to that branch's
  `previews` block. If you would rather have no preview builds, turn off **Builds for non-production branches**
  under Settings → Builds → Branch control.
- **Secrets / variables:** none with the default Workers AI upstream. `MODEL_ID`, `UPSTREAM` and
  `DAILY_UPSTREAM_CAP` are `vars` in `wrangler.jsonc`, so they are set on each deploy; change them in the file,
  not the dashboard. Only for `UPSTREAM` `"openai-compatible"` add `OPENAI_BASE_URL` and `OPENAI_MODEL` to `vars`
  and run `pnpm exec wrangler secret put OPENAI_API_KEY` once.
- **Custom domain:** `reasontrail.geekplux.com` is already declared in `wrangler.jsonc`
  (`"routes": [{ "pattern": "reasontrail.geekplux.com", "custom_domain": true }]`), so the first deploy attaches it
  and later deploys keep it. Only to change it: edit that `pattern` in `wrangler.jsonc`, so the next deploy uses the new
  domain.

**Manual alternative** (only before the repository is connected, or if Workers Builds is down; needs wrangler
authentication from step 1):

```sh
pnpm install --frozen-lockfile && pnpm build && pnpm run check:deploy && pnpm exec wrangler deploy
```

It deploys the same top-level production config. Once the repository is connected, let Workers Builds handle
deploys so `main` and production never drift.

## 5. After deploying: checks

Replace `$SITE` with the deployed origin.

```sh
SITE=https://reasontrail.geekplux.com   # the real origin
# The lens endpoint: 200 with tokens (or 503 budget_exhausted if DAILY_UPSTREAM_CAP is 0)
curl -sS -X POST "$SITE/api/next-tokens" -H 'content-type: application/json' \
  -d '{"prefix":"The old lighthouse keeper opened the door and","k":5}'
# The same call again: "cached": true, and no model call
curl -sS -X POST "$SITE/api/next-tokens" -H 'content-type: application/json' \
  -d '{"prefix":"The old lighthouse keeper opened the door and","k":5}'
# AI labels: 200 with labels and links
curl -sS -X POST "$SITE/api/structure" -H 'content-type: application/json' \
  -d '{"steps":[{"id":"s1","kind":"user","text":"Fix the failing test"},{"id":"s2","kind":"tool-call","text":"Run pnpm test"},{"id":"s3","kind":"assistant","text":"The test passes now"}]}'
# Errors are calm and specific: 405 for GET, 404 for an unknown endpoint
curl -sS -o /dev/null -w '%{http_code}\n' "$SITE/api/next-tokens"
# The site, its headers and the social image
curl -sSI "$SITE/" | grep -iE 'content-security-policy|x-content-type-options|cache-control'
curl -sSI "$SITE/og-card.png" | head -1
```

Then, in a browser (v7):

1. **Home first view:** `$SITE/` shows the hero, the default sample's tree, the sample tabs and its session card
   (list and outcome) at once, with no console errors and no `/api/` request.
2. **Step deep link:** `$SITE/?session=planner-pivot&step=s12` opens that sample with step s12 selected: its path is
   highlighted in the tree with a callout, its episode is open in the list and the card shows its detail panel.
   Reload keeps it.
3. **Viewer offline:** on the home, **Share** → "Download HTML", then open the saved file with the network off (or
   `npx reasontrail` on a local session): the map renders with no request.
4. **Lens with the cap:** `$SITE/?session=planner-pivot&sample=lens-planner-pivot-1` grows recorded branches with no
   request; **More options** shows "Grow live with an open model" and the line "Live model calls are capped per day."
   After choosing it, the line under the live status reads "Live model calls are capped per day; recorded gardens
   always work." and branches the recording lacks grow through `/api/next-tokens`.
5. **Open a session** accepts a `.jsonl`, and the social card shows in a link preview tool.

## 6. Demo URL and custom domain (PLAN D20)

The site lives at `https://reasontrail.geekplux.com`. `wrangler.jsonc` declares it as a custom domain
(`"routes": [{ "pattern": "reasontrail.geekplux.com", "custom_domain": true }]`), so `wrangler deploy` keeps the domain
attached in the dashboard. The placeholder `reasontrail.example` used during development has been replaced in the
README, `examples/README.md`, `docs/LAUNCH.md`, `cli/src/meta.ts` (`DEFAULT_AI_ENDPOINT`), `index.html` (absolute
`og:image`, `og:url`, canonical), `scripts/check-docs.mjs` (`DEMO_ORIGIN`) and its tests. If the domain ever changes,
update those files and the route, then run `pnpm check:docs` and `pnpm test`.

## 7. Headers

`public/_headers` is copied into `dist/` and applied by Workers static assets to every non-API response:

- **CSP:** `default-src 'self'`; scripts, styles and fonts only from the site itself (no inline code); `img-src 'self'
  data: blob:`; `connect-src 'self'` (lazy chunks, `/viewer.html`, `/api/*`); `worker-src 'self' blob:` (the intake
  Web Worker starts from a blob URL); `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`
  that switches off camera, microphone, geolocation, payment, USB and topics.
- **Cache:** `/assets/*` (hashed names) `public, max-age=31536000, immutable`; everything else, HTML included,
  `public, max-age=0, must-revalidate`.
- `/viewer.html` (and `/viewer`, where the default HTML handling redirects it) gets its own policy: the template
  runs an inline loader, so it allows inline script and style and nothing from the network.

The `/api/*` responses come from the Worker and are not affected. If you add a third-party resource, widen the CSP
in `public/_headers` and run `pnpm check:browser --headers`.

## 8. Rollback

```sh
pnpm exec wrangler deployments list   # the recent versions
pnpm exec wrangler rollback           # back to the previous version (or: wrangler rollback <version-id>)
```

To switch only the model calls off, set `DAILY_UPSTREAM_CAP` to `"0"` in `wrangler.jsonc` and push to `main`, or
for an immediate stop set it in the dashboard (Workers → reasontrail → Settings → Variables). The next build from
`main` resets the dashboard value to the one in the file. The site and recorded data keep working.

## 9. Cost

- **Workers AI**, `@cf/zai-org/glm-4.7-flash`: $0.0605 per million input tokens and $0.40 per million output tokens
  (published model schema, checked 2026-10-21; DECISIONS). A lens call is about 100–400 input tokens and one output
  token, so a full day at the default cap of 1,000 calls costs a few cents. A structure batch (up to 200 step
  summaries, at most 4,096 output tokens) costs at most about $0.002–0.003, and a session sends at most five. Workers
  AI also has a daily free allocation; check the current pricing page.
- **The daily cap** (`DAILY_UPSTREAM_CAP`, default 1,000) counts upstream calls across all users per UTC day; cache
  hits never count. Rate limits add 20 model calls and 120 requests per minute per IP.
- **KV:** each upstream call writes twice (the cached answer and the day's budget counter). The Workers Free plan
  allows 1,000 KV writes a day, so on Free set `DAILY_UPSTREAM_CAP` to `"400"` or less; past the write limit the
  counter stops moving and the cap no longer holds (the rate limits still do). Workers Paid ($5 a month) includes
  1 million writes a month, enough for the default cap. Reads (one cache and one budget read per request) are well
  inside the free 100,000 a day.
- **Static assets** are free and do not invoke the Worker (`run_worker_first` covers only `/api/*`).
