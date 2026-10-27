# Logprob provider: spike findings and design

Written 2026-10-19, when the provider was chosen. Code comments cite its sections for the provider contract (§3), the sample format (§4), the Worker API (§5) and caching (§6).

reasontrail needs one thing from a model: **for a text prefix, the top-k next tokens with their log-probabilities**. Every live expansion is exactly one such query. This doc records what was evaluated, the evidence, the choice, and the contract the app and Worker build against.

## TL;DR

- **Default and tests: recorded fixtures.** Committed sample gardens (JSON) are served by a `RecordedProvider`. They work offline, need no key, and are the first view.
- **Live mode: Cloudflare Worker -> Workers AI `@cf/zai-org/glm-4.7-flash`.** Its published schema has `logprobs` + `top_logprobs` (0-20), and the response is OpenAI-shaped (`choices[0].logprobs.content[].top_logprobs[]`). It runs through the Worker's `AI` binding, so there is **no third-party API key**. KV caches results per prefix, and requests are rate-limited and budget-capped.
- **Initial recordings: local SmolLM2-135M (ONNX, q8) via transformers.js in Node.** This was spiked successfully on this box: no key, 134 MB, about 590 MB RSS, and 50-150 ms per query. It is a true base model, so it gives a real continuation distribution. Each garden is labelled with the model that recorded it.
- **Fallbacks:** (1) the Worker's upstream adapter also accepts any OpenAI-compatible `chat/completions` endpoint with logprobs (key via `wrangler secret`). (2) An opt-in in-browser provider (transformers.js) is a possible later stretch. It is not in the MVP because of the 134 MB download and the RAM it needs in the headless verifier.
- **Blocker:** `CLOUDFLARE_API_TOKEN` on this box is rejected by the Cloudflare API (`6003 Invalid request headers / 6111 Invalid format for Authorization header`; the value is not in API-token format). Because of that, the Workers AI logprob behaviour is **verified from the published schemas only, not by a live call**. A valid token is needed for live Workers AI checks, Workers AI recordings, and the eventual deploy. Everything else proceeds on recorded data.

## 1. Options evaluated

### 1.1 OpenAI-compatible `chat/completions` with `logprobs` + `top_logprobs`

Evidence: docs and prior knowledge only. There is no OpenAI key on this box, so nothing was called.

- Request: `POST /v1/chat/completions` `{model, messages, max_tokens: 1, logprobs: true, top_logprobs: k}` with `k` from 0 to 20.
- Response: `choices[0].logprobs.content[i] = {token, logprob, bytes, top_logprobs: [{token, logprob, bytes}]}`, with one entry per generated position.
- Legacy `POST /v1/completions` takes `logprobs: <int, max 5>` and returns `choices[0].logprobs.top_logprobs: [{"<token>": logprob}]`. It is only available on old instruct/base models, but it is the only raw-prefix (no chat template) option.
- Reasoning-class models generally do **not** return logprobs. The Cloudflare catalog lists several hosted frontier models with `"top_logprobs": 0` and `"logprobs": []`.
- The same shape is served by vLLM-based hosts (and many OpenAI-compatible gateways), which makes it a good **adapter target**.
- Trade-offs: it needs a third-party key (a blocker on this box) and per-call cost. Chat models continue an *assistant turn*, not a raw prefix (see 1.4).

### 1.2 Cloudflare Workers AI (preferred: deploy target is Cloudflare)

Evidence:

1. **Live calls: blocked.** `GET /client/v4/accounts` with the box's `CLOUDFLARE_API_TOKEN` returned `{"success": false, "errors": [{"code": 6003, "message": "Invalid request headers", "error_chain": [{"code": 6111, "message": "Invalid format for Authorization header"}]}]}`. A local format check (the value itself was never printed) shows it contains whitespace and is not a single API-token string. No account id was obtained and no `ai/run` call was possible.
2. **Published model schemas** (`cloudflare/cloudflare-docs`, `src/content/workers-ai-models/*.json`, read via `gh api`):
   - Models whose schema has `top_logprobs`: `glm-4.7-flash`, `glm-5.2`, `glm-5.3`, `glm-5.3-flash`, `kimi-k2.6`, `kimi-k2.7-code`, `qwen3.8-27b`, `gemma-4-26b-a4b-it`, `nemotron-3-120b-a12b`, `deepseek-v4-flash-0731`, `deepseek-v4-pro-0813`, `phonellm-mini-alpha-2`.
   - `@cf/zai-org/glm-4.7-flash` input (both `Prompt` and `Messages` variants):
     - `logprobs` is "Whether to return log probabilities of the output tokens."
     - `top_logprobs` is an integer from 0 to 20: "How many top log probabilities to return at each token position (0-20). Requires logprobs=true."
     - `chat_template_kwargs.enable_thinking` is boolean and **defaults to true**.
     - `max_tokens` and `temperature` are also accepted.
   - Output: `choices[].logprobs.content[] = {token, logprob, bytes, top_logprobs: [{token, logprob, bytes}]}`. This is **the same shape as OpenAI**, so one parser serves both.
   - Older models such as `qwen3-30b-a3b-fp8` document only `prompt_logprobs` ("Log probabilities for the prompt (if requested)") and no `top_logprobs`.
   - The docs page `workers-ai/configuration/open-ai-compatibility` lists `/v1/chat/completions` and `/v1/embeddings` (and `/v1/responses` for GPT-OSS). It does not mention a legacy `/v1/completions` or logprobs.
3. **Why `glm-4.7-flash`:**
   - It has logprobs in both input variants.
   - "Flash" tier: low latency, and the cheapest listed tier in its schema.
   - It has a 131k context, far more than needed.
   - Thinking can be switched off with `chat_template_kwargs: {enable_thinking: false}`. This is required, otherwise the first tokens are reasoning tokens.
   - Alternatives: `phonellm-mini-alpha-2` has no reasoning flag but is an alpha. `nemotron-3-120b-a12b` is larger and slower. The model id is a Worker var (`MODEL_ID`), so swapping is a config change.
4. Trade-offs:
   - It is a chat/instruct model, so the distribution is conditioned on a continuation instruction (see 1.4).
   - The logprob behaviour is unverified until a valid token exists. The Worker phase must start with a one-call smoke test: check that `logprobs.content[0].top_logprobs` has length k and that the first token is not a thinking marker.

### 1.3 In-browser / local small model via transformers.js (no key)

Evidence: a real spike in Node on this box. `@huggingface/transformers` 4.3.1 with `onnxruntime-node` ran on CPU from a temp dir. The models were deleted afterwards and nothing was left running.

| Model (dtype) | Download in cache | Load (warm disk) | Peak RSS | Per query (one forward pass) | Vocab |
|---|---|---|---|---|---|
| `onnx-community/SmolLM2-135M-ONNX` (q8, base) | 134 MB | 2.5 s | 586 MB | 47-151 ms | 49,152 |
| `Xenova/distilgpt2` (q8) | 228 MB pulled (85 MB model file) | 3.2 s | 470 MB | 24-30 ms | 50,257 |

Sample output (top-5, natural-log probabilities):

- SmolLM2, prompt "Once upon a time, a small robot": ` named` -0.80, ` called` -3.33, `,` -4.01, ` robot` -4.09, ` entered` -4.17.
- SmolLM2, prompt "The best way to learn a new language is": ` to` -0.67, ` by` -1.74, ` with` -2.78, ` through` -2.79, ` not` -3.89.
- distilgpt2, prompt "Once upon a time, a small robot": ` was` -1.77, ` is` -3.44, ` could` -3.54, ...

SmolLM2 gives noticeably more sensible branches.

Findings:

- It gives the **full distribution over a raw prefix** (a base model with no chat template), deterministically, with no key and no cost. That is the purest data for this product.
- In a browser it would use onnxruntime-web: WASM by default, WebGPU when available. Expect:
  - several times slower than native Node;
  - single-threaded WASM unless the page is cross-origin isolated (COOP/COEP);
  - a first-visit download of about 134 MB per user, which breaks "first step costs almost nothing" unless it is opt-in;
  - about 0.5-0.8 GB of tab RAM.
- The installed `node_modules` was 752 MB, because `onnxruntime-node` postinstall pulls CUDA/TensorRT provider libraries. Any committed recorder must isolate this dependency (see 6) and must not add it to the app's dependencies.
- Headless verifier on this box (about 2 GB free):
  - Loading the model inside headless Chrome (about 300 MB for Chrome plus about 600-800 MB for the model) is possible but risky while other agents run.
  - WebGPU is normally unavailable in headless Linux Chrome.
  - Verdict: do not make the verifier load a real model in the browser. Unit-test the in-browser provider with a mocked pipeline.
- Role: **use it as the recording engine now** (Node, one-off, no key). The in-browser live provider is an optional later stretch behind an explicit "Run a small model in your browser (about 134 MB download)" opt-in.

### 1.4 Chat models vs raw continuation

Workers AI and modern OpenAI models are chat models: they generate an assistant reply, not a raw continuation of the user's text. The Worker therefore sends:

```
system: "You continue text. Reply with only the next words that continue the user's text exactly where it stops, with no preamble or quotes."
user:   <prefix>
max_tokens: 1, logprobs: true, top_logprobs: K_FETCH, chat_template_kwargs: {enable_thinking: false}
```

Expanding a child appends the chosen token to `prefix` and repeats the call. During the smoke test, also try assistant prefill (a trailing assistant message holding the partial continuation). Use it only if Workers AI honours it; it is not in the schema.

Leading-space tokens (` named`) are kept verbatim. Re-tokenisation drift from appending decoded text is acceptable at string level.

Temperature needs **no extra calls**. The UI rescales the returned top-k client-side (`p_i ∝ exp(logprob_i / T)`, renormalised over the k shown, plus an "other" remainder). This keeps AI calls minimal.

## 2. Recommendation

| Use | Provider | Key needed |
|---|---|---|
| First view, offline, all unit/e2e tests | `RecordedProvider` (committed JSON) | none |
| Live mode (deployed) | Worker `/api/next-tokens` -> Workers AI `@cf/zai-org/glm-4.7-flash` via `AI` binding | none in the app; Cloudflare account auth for `wrangler dev`/deploy |
| Live mode, alternative upstream | same Worker, `UPSTREAM=openai-compatible`, `OPENAI_BASE_URL` var + `OPENAI_API_KEY` secret | yes (`.dev.vars` / `wrangler secret put`) |
| Recording sample gardens | Node recorder, `--provider local-onnx` (SmolLM2-135M q8) now; `--provider worker` later | none (local) |
| Optional stretch | `BrowserProvider` (transformers.js, opt-in) | none |

If the Workers AI smoke test fails (no logprobs returned), switch the live upstream to `openai-compatible`, which makes a key a blocker, or promote the in-browser stretch. The UI and recorded path are unaffected either way.

## 3. Provider interface (TypeScript, shared by app, Worker client and recorder)

```ts
// src/llm/types.ts (proposal)
export interface TokenChoice {
  token: string;   // decoded token text, verbatim (may start with a space; never empty)
  logprob: number; // natural log, <= 0
}

export type ProviderErrorCode =
  | 'not_recorded'     // RecordedProvider has no data for this prefix
  | 'invalid_input'    // empty prefix, bad characters, k out of range
  | 'prefix_too_long'
  | 'rate_limited'     // carries retryAfterSec
  | 'budget_exhausted' // daily upstream cap reached
  | 'upstream_error'   // model call failed or returned no logprobs
  | 'unavailable'      // live mode not configured / offline
  | 'aborted';

export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string, public retryAfterSec?: number) { super(message); }
}

export interface LogprobProvider {
  readonly kind: 'recorded' | 'worker' | 'browser';
  readonly model: string; // e.g. "@cf/zai-org/glm-4.7-flash"
  /** Top-k next tokens after `prefix` (prompt + chosen continuation), sorted by logprob desc, length <= k. */
  nextTokens(prefix: string, k: number, opts?: { signal?: AbortSignal }): Promise<TokenChoice[]>;
}
```

Contract (tested once against every implementation):

- `k` is clamped to `[1, K_MAX = 8]`.
- Results are sorted descending, deduplicated by `token` (merge with log-sum-exp), with empty and special tokens removed.
- It is deterministic for the same `(prefix, k)`.
- `RecordedProvider` throws `not_recorded`. The UI then shows "not in the recording; switch to live to grow this branch" and never calls the network implicitly.
- `CachedProvider(inner)` wraps any provider with an in-memory `Map<prefix, TokenChoice[]>`. It deduplicates in-flight requests and serves smaller k by slicing.

## 4. Recorded sample format

One file per garden under `src/samples/<id>.json`, plus `src/samples/index.ts` that imports them all. Importing them into the bundle keeps the first view instant and offline-safe with no extra fetch. The total target is under 100 KB.

```json
{
  "schemaVersion": 1,
  "id": "lighthouse",
  "title": "The lighthouse keeper",
  "prompt": "The old lighthouse keeper opened the door and",
  "model": { "provider": "local-onnx", "name": "onnx-community/SmolLM2-135M-ONNX", "dtype": "q8" },
  "recordedAt": "2026-10-19",
  "k": 5,
  "nodes": {
    "": [
      { "token": " looked", "logprob": -2.417 },
      { "token": " entered", "logprob": -3.125 },
      { "token": " turned", "logprob": -3.31 },
      { "token": " the", "logprob": -3.615 },
      { "token": " stood", "logprob": -3.616 }
    ],
    " looked": [ { "token": " out", "logprob": -1.2 } ]
  }
}
```

- The root list above is real spike output (SmolLM2-135M q8); the `" looked"` entry is illustrative only.
- `nodes` is a flat map keyed by the **continuation text after the prompt**, where `""` is the root. Each value is the top-k at that point. The node for a branch is `parentKey + token`. A branch is expandable offline if and only if its key exists in `nodes`. This makes `RecordedProvider.nextTokens(prefix)` a single lookup of `nodes[prefix.slice(prompt.length)]`. It deduplicates identical text paths, and the tree is derived at load time, so no nesting or ids need to be kept consistent.
- Logprobs are rounded to 3 decimals. `k` is the recorded width, and the UI may show fewer.
- Validation lives in the app as a zod-free hand-written type guard plus a unit test over all sample files. It checks: `schemaVersion === 1`; the prompt is 1-280 chars; every list is sorted with length 1 to k; `logprob <= 0`; the sum of exp is at most 1 + 1e-3; the root exists.
- **Recording policy per prompt:** expand every node to depth 2 (1 + 5 + 25 = 31 queries, giving 3 visible levels). Then extend the 2 most probable paths (by cumulative logprob) to depth 6. That is about 40 queries per prompt and about 10 KB per file.
- **Prompts** (6, with neutral, non-finance everyday themes):
  - "The old lighthouse keeper opened the door and"
  - "Once upon a time, a small robot"
  - "The best way to learn a new language is"
  - "My favorite thing about autumn is"
  - "The recipe calls for two cups of"
  - "In the middle of the night, the cat"

## 5. Worker API

The same Worker serves the static app (Workers static assets) and `/api/*`.

`POST /api/next-tokens`

The request is `{ "prefix": string, "k"?: number }` with `Content-Type: application/json`. The body must be at most 4 KB.

| Limit | Value | Error |
|---|---|---|
| `prefix` length | 1-1000 chars after NFC normalisation; control chars other than `\n`/`\t` are rejected | 400 `invalid_input` / 413 `prefix_too_long` |
| `k` | integer 1-8 (default 5); upstream is always asked for `K_FETCH = 8` | 400 `invalid_input` |
| prompt length (client) | 1-280 chars | client-side |
| depth (client) | at most 12 tokens beyond the prompt | client-side: the branch shows "depth limit" |
| live expansions per tab session (client) | at most 150 | client-side message |

A 200 response looks like this:

```json
{ "model": "@cf/zai-org/glm-4.7-flash", "k": 5, "cached": true,
  "tokens": [ { "token": " looked", "logprob": -2.41 } ] }
```

Errors return `{ "error": { "code": "<ProviderErrorCode>", "message": "<human text>" } }` with these statuses:

- 400 `invalid_input`
- 413 `prefix_too_long`
- 405 for methods other than POST
- 429 `rate_limited` with a `Retry-After` header
- 503 `budget_exhausted`
- 503 `unavailable` (the `AI` binding is missing or the upstream is not configured)
- 502 `upstream_error` (the call failed, `logprobs` is null or empty, or a thinking token came first)

The client maps each code to a calm inline message, and recorded gardens keep working regardless.

**Upstream call (Workers AI):**

```
env.AI.run(env.MODEL_ID, { messages: [system, user(prefix)], max_tokens: 1, logprobs: true, top_logprobs: 8, temperature: 0, chat_template_kwargs: { enable_thinking: false } })
```

The result is parsed from `choices[0].logprobs.content[0].top_logprobs`, using the same parser for the OpenAI-compatible adapter. The upstream call has a 10 s timeout and at most one retry on 5xx.

## 6. Caching, rate limits, budgets

- **KV (`TG_CACHE` binding).** The key is `nt:v1:<MODEL_ID>:<sha256hex(prefix)>` and the value is the full `K_FETCH` list, so one entry serves every k. `expirationTtl` is 30 days. On a hit, the Worker slices to k and returns `cached: true`. On a miss, it calls the upstream, writes to KV with `ctx.waitUntil` (a write failure is logged, not surfaced), and returns `cached: false`. Bump `v1` when the system prompt or the parser changes. Keep KV writes in mind: the free tier allows about 1,000 writes per day, which is in line with the budget below.
- **Client cache.** `CachedProvider` (an in-memory Map per tab) means re-clicking or collapsing and re-expanding never hits the network.
- **Rate limit.** A Workers Rate Limiting binding (`ratelimits` in `wrangler.jsonc`) keyed by `CF-Connecting-IP` allows 20 cache-miss requests per 60 s. KV hits are only checked against a looser 120 per 60 s limit.
- **Daily budget.** A KV counter `budget:<YYYY-MM-DD>` is checked before each upstream call; the cap is `DAILY_UPSTREAM_CAP` (var, default 1000). It is approximate because KV is not atomic, which is acceptable as a soft cap. Exceeding it returns 503 `budget_exhausted`.
- **Lean AI.** Calls happen only on explicit click or keypress. There is no prefetch and no speculative expansion. Temperature is applied client-side.

## 7. No-key fallback and secrets

- The app boots on `RecordedProvider` and never needs the Worker for the first view. With live mode unavailable (offline, `unavailable`, or `budget_exhausted`), the prompt box stays visible with a note, and the samples remain fully explorable.
- Workers AI uses the `AI` binding, so there is no secret in code or config. Local `wrangler dev` needs Cloudflare auth (a valid `CLOUDFLARE_API_TOKEN` in the environment or `wrangler login`), and the AI binding always runs remotely.
- The optional OpenAI-compatible upstream uses `OPENAI_API_KEY` in `.dev.vars` locally (gitignored; ship `.dev.vars.example` with an empty value) and `wrangler secret put OPENAI_API_KEY` when deployed.
- The account id is not written into committed files. Wrangler reads `CLOUDFLARE_ACCOUNT_ID` from the environment when needed.

## 8. How committed samples are produced

- A recorder script, `tools/record-samples/` with its **own** `package.json` (not part of the app's pnpm install), entry `record.mjs`.
- `--provider local-onnx`, the default: it uses `@huggingface/transformers` in Node with `onnx-community/SmolLM2-135M-ONNX` q8. Install it with the CUDA download skipped (onnxruntime-node install flag; verify the exact flag in that phase). It logs RSS and deletes nothing in the repo.
- `--provider worker --url http://127.0.0.1:8787` records through the real Worker, once a valid Cloudflare token exists. The same output format applies, with `model` recording the source.
- Flags are `--prompts prompts.json --k 5 --full-depth 2 --spine-depth 6 --spine-paths 2 --out ../../src/samples`.
- The script is deterministic and idempotent: the same model gives byte-identical JSON. It validates its output with the app's validator before writing.
- Running it for 6 prompts takes about 240 forward passes, which is about 1 minute on this box with under 700 MB RSS. Delete the model cache afterwards (`~/.cache` or the `--cache-dir` passed).
- Run it once in the phase that introduces samples, and commit the JSON. Until then, Phase 1 may ship a tiny hand-checked fixture produced by the same spike numbers above.
