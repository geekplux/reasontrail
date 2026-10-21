# Extending Reasontrail

Four extension points, each with the files to touch and the check that proves it works:

1. a new **provider** in the app (where next-token distributions come from),
2. a new **Worker upstream** (which model answers live requests),
3. your own **recorded garden**,
4. a new **theme**.

Run `pnpm lint`, `pnpm typecheck` and `pnpm test` after each change.

## 1. A provider: `LogprobProvider`

Every source of distributions implements one interface, defined in `shared/llm/types.ts`:

```ts
interface LogprobProvider {
  readonly kind: 'recorded' | 'worker' | 'browser';
  readonly model: string;
  nextTokens(prefix: string, k: number, opts?: { signal?: AbortSignal }): Promise<TokenChoice[]>; // {token, logprob}[]
}
```

The rules: results are sorted by `logprob` (natural log, <= 0) in descending order, tokens are unique and never empty, `k` is clamped to `[1, K_MAX]` with `clampK()`, the same `(prefix, k)` always gives the same answer, and the only error a provider rejects with is `ProviderError` (its `code` is one of `ProviderErrorCode`, and the UI shows one message per code).

The executable spec lives in `src/llm/providerContract.ts`. Run it against your provider from a test file, the way `src/llm/recordedProvider.test.ts` does for `RecordedProvider`:

```ts
import { providerContract } from './providerContract';
providerContract('MyProvider', () => new MyProvider(), ['The cat', 'The cat sat']);
```

The prefixes you pass must be ones your provider can answer. Tests must never call a real model: use recorded data or a mocked `fetch`.

## 2. A Worker upstream

On a cache miss, `POST /api/next-tokens` asks an upstream for the first token's top 8 logprobs. `worker/upstream/select.ts` picks the upstream from the `UPSTREAM` var:

| `UPSTREAM` | File | Needs |
|---|---|---|
| `workers-ai` (default) | `worker/upstream/workersAi.ts` | the `AI` binding and `MODEL_ID` |
| `openai-compatible` | `worker/upstream/openaiCompatible.ts` | `OPENAI_BASE_URL`, `OPENAI_MODEL`, secret `OPENAI_API_KEY` |

Rate limits (`worker/limits.ts`), the daily budget (`worker/budget.ts`) and the KV cache (`worker/cache.ts`) sit in `worker/handler.ts` in front of every upstream, so a new upstream gets them for free.

### Worked example: any OpenAI-compatible server

`openaiCompatible.ts` POSTs to `${OPENAI_BASE_URL}/chat/completions` with `Authorization: Bearer ${OPENAI_API_KEY}` and the shared body from `worker/upstream/chat.ts` (`chatBody`: system prompt, the prefix as the user message, `max_tokens: 1`, `logprobs: true`, `top_logprobs: 8`, `temperature: 0`). It parses the answer with the same `tokensFromCompletion` (`choices[0].logprobs.content[0].top_logprobs`) as Workers AI. All upstreams share `callUpstream`: a 10 s timeout and one retry on a 5xx (never on a 4xx or a timeout). A missing base URL, key or model gives 503 `unavailable`.

To point your own deployment at, for example, a vLLM server:

1. In `wrangler.jsonc` `vars`, set `"UPSTREAM": "openai-compatible"`, `"OPENAI_BASE_URL": "https://your-host/v1"` and `"OPENAI_MODEL": "<model id>"`.
2. Store the key as a secret: `wrangler secret put OPENAI_API_KEY`. Locally, copy `.dev.vars.example` to `.dev.vars` (gitignored) and fill it in. Never commit a key.
3. Run `pnpm run check:deploy` (a dry run) to see the bindings and vars.

Thinking models must have thinking switched off on the server side: the Worker rejects an answer whose first token is `<think>`.

### Writing another upstream

Return an `Upstream` (`worker/upstream/chat.ts`): a `model` (part of the cache key; `undefined` means "not configured") and `nextTokens(prefix)` that resolves to the normalized list or rejects with `ProviderError`. Wrap the network call in `callUpstream(name, (signal) => …)` and throw `RetryableError` for a 5xx. Then add a `case` to `selectUpstream`, its vars to `Env` in `worker/env.ts`, and tests with a mocked `fetch` next to `worker/test/limits.test.ts`. The Worker has no runtime dependencies; `pnpm check:size` enforces that.

### Does a host return `top_logprobs`?

Check before you write code. `scripts/smoke-workers-ai.mjs` shows the pattern: one real request with the exact body the Worker sends, then print `choices[0].logprobs.content[0].top_logprobs` and fail when it is empty or a thinking token comes first. For an OpenAI-compatible host, copy that script, change the URL to `${OPENAI_BASE_URL}/chat/completions`, add `model` to the body, and drop `chat_template_kwargs`. Read the key from the environment and never print it. Run it with `node`; it is not part of `pnpm test`.

## 3. Record your own garden

Gardens are committed JSON in `src/samples/`, recorded by the standalone tool in `tools/record-samples/` (its README lists every flag). The default model runs on your CPU, with no key needed:

1. Add `{ "id": "kettle", "title": "The kettle", "prompt": "The kettle began to" }` to `tools/record-samples/prompts.json`. Keep prompts neutral and everyday.
2. Run `pnpm samples:record --only kettle`. This writes `src/samples/kettle.json`. For a one-off garden, use `pnpm samples:record --prompt "The kettle began to" --id kettle --title "The kettle"`.
3. Import the file in `src/samples/index.ts` and add it to the `samples` list. The first entry is the default view.
4. Run `pnpm test` (`src/samples/validate.test.ts` checks every garden) and `pnpm check:size`.

`--provider worker --url http://127.0.0.1:8787` records through a running Worker instead of the local model.

## 4. A theme

Every colour is a CSS custom property in `src/styles/tokens.css`: the light theme in `:root` and the dark theme under `@media (prefers-color-scheme: dark)`. Change the `--tg-*` values there and nowhere else.

Then run `pnpm vitest run src/styles/tokens.test.ts`. It checks the following:

- each colour's contrast on paper matches the `CONTRAST` table (update the table on purpose when you change a colour);
- text reaches 4.5:1 and marks reach 3:1 on `--tg-paper` and `--tg-surface`;
- the colours that must stay apart remain apart (ΔE >= 20) under protanopia, deuteranopia and tritanopia;
- `public/favicon.svg` and `public/logo.svg` draw in `--tg-branch-hi`, and the `theme-color` in `index.html` matches `--tg-paper` (static files cannot read CSS variables, so update those copies too).

Colour is never the only signal in Reasontrail: thickness, markers, dash patterns and labels carry the meaning. Keep it that way.
