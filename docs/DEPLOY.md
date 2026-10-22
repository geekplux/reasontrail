# Deploying Reasontrail to Cloudflare

One Worker, `reasontrail`, serves the showcase site (static assets from `dist/`) and the two optional AI endpoints,
`POST /api/next-tokens` (the zoom-in lens) and `POST /api/structure` (AI labels). Everything else in Reasontrail runs
on the reader's machine, so the site still works if the endpoints are switched off.

> **Approval required.** Nothing has been deployed. The deploy command below is run only by Sean, or by someone else
> after his explicit approval. Everything before it is safe to run at any time: it deploys nothing.

## 1. Prerequisites

- A Cloudflare account with Workers enabled. Workers AI and KV are on every plan; see [cost](#9-cost) for limits.
- Node 20.19+ and pnpm 9 (`corepack enable`).
- Authentication for wrangler, either one of:
  - `pnpm exec wrangler login` (a browser login, stored by wrangler), or
  - `CLOUDFLARE_API_TOKEN` (a token from the "Edit Cloudflare Workers" template, plus Workers AI and KV edit
    permissions) and `CLOUDFLARE_ACCOUNT_ID` in the environment. Never commit them; locally they can live in
    `.dev.vars` or your shell.

## 2. Build and dry run

```sh
pnpm install --frozen-lockfile && pnpm build && pnpm run check:deploy
```

`pnpm build` builds the viewer template first and emits it as `dist/viewer.html`. `check:deploy` is
`wrangler deploy --dry-run --outdir .wrangler/dry-run`: it bundles the Worker, reads `dist/` and `dist/_headers`, and
prints the bindings without contacting Cloudflare (no valid token needed). Expect:

```text
env.TG_CACHE                                 KV Namespace
env.AI                                       AI
env.RL_MISS (20 requests/60s)                Rate Limit
env.RL_ALL (120 requests/60s)                Rate Limit
env.ASSETS                                   Assets
env.MODEL_ID ("@cf/zai-org/glm-4.7-flash")   Environment Variable
env.UPSTREAM ("workers-ai")                  Environment Variable
env.DAILY_UPSTREAM_CAP ("1000")              Environment Variable
```

If wrangler ever complains about a malformed token during the dry run, run it once with the variable blanked:
`CLOUDFLARE_API_TOKEN= pnpm run check:deploy`.

Optionally run the browser flows under the production headers: `pnpm check:browser --headers` serves `dist/`
through `scripts/serve-dist.mjs`, which applies `public/_headers` the way Workers static assets do.

## 3. Before the first deploy

1. **Social image.** Open the site locally (`pnpm preview`), keep the default sample, choose "Save shareable copy…" →
   "Download map card" (1200×630 PNG, light theme), and save it as `public/og-card.png`. Commit it. `index.html`
   already points `og:image` at `/og-card.png`.
2. **KV namespace (optional).** `wrangler.jsonc` has no `id` for `TG_CACHE` (PLAN D10), and the first deploy
   provisions a namespace for it. To create it yourself instead and pin the id:

   ```sh
   pnpm exec wrangler kv namespace create TG_CACHE
   ```

   and add the printed `"id"` to the `kv_namespaces` entry in `wrangler.jsonc`.
3. **Upstream (optional).** The default upstream is Workers AI through the `AI` binding: no key. Only if you set
   `UPSTREAM` to `openai-compatible` (and `OPENAI_BASE_URL`, `OPENAI_MODEL` in `vars`), add the key as a secret:

   ```sh
   pnpm exec wrangler secret put OPENAI_API_KEY
   ```

4. **Smoke test the model.** One real Workers AI call that checks `top_logprobs` come back (needs
   `CLOUDFLARE_ACCOUNT_ID` and a valid `CLOUDFLARE_API_TOKEN`; prints `SKIPPED` without them):

   ```sh
   node scripts/smoke-workers-ai.mjs
   ```

   If it fails, deploy anyway with `DAILY_UPSTREAM_CAP` set to `"0"` (live calls off; recorded lens data and the
   whole site keep working) and see `docs/llm-provider.md` for the fallbacks.

## 4. Deploy (Sean, or after his approval)

```sh
pnpm exec wrangler deploy
```

Wrangler prints the URL (`https://reasontrail.<account-subdomain>.workers.dev`). A custom domain is added in the
Cloudflare dashboard (Workers → reasontrail → Settings → Domains & Routes) or with a `routes` entry in
`wrangler.jsonc`.

## 5. After deploying: checks

Replace `$SITE` with the deployed origin.

```sh
SITE=https://reasontrail.example   # the real origin
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

Then open `$SITE` in a browser: the default map loads with no console errors, "Map your own session" accepts a
`.jsonl`, a lens sentence grows, and the share dialog saves a copy. Check the social card with a link preview tool.

## 6. Replace the placeholder URL (PLAN D20)

Until the site exists, every demo link uses `https://reasontrail.example`. After deploying, replace it with the
real origin in:

| File | What |
|---|---|
| `README.md` | the "Live demo: coming soon" link near the top becomes the real link |
| `examples/README.md` | each sample's "Open it" link and the note about the placeholder |
| `docs/LAUNCH.md` | the post drafts, demo scenarios and the checklist note |
| `cli/src/meta.ts` | `DEFAULT_AI_ENDPOINT` (`--ai`'s default, `<origin>/api/structure`); then rebuild the CLI |
| `index.html` | make `og:image` absolute (`<origin>/og-card.png`) and add `<meta property="og:url" content="<origin>/">` |
| `scripts/check-docs.mjs` | `DEMO_ORIGIN` (the demo-link check derives its pattern from it) |
| `scripts/check-docs.test.mjs` | the example links in the tests |
| `scripts/browser/flows/gallery.mjs` | the comment naming the placeholder |

Find any stragglers with `git grep -n reasontrail.example -- ':!docs/PLAN.md' ':!docs/STATUS.md' ':!docs/DEPLOY.md'`
(PLAN and STATUS are history), then run `pnpm check:docs` and `pnpm test`.

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

To switch only the model calls off without a redeploy of code, set `DAILY_UPSTREAM_CAP` to `"0"` in the dashboard
(Workers → reasontrail → Settings → Variables). The site and recorded data keep working.

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
