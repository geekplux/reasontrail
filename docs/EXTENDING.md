# Extending Reasontrail

Five extension points, each with the files to touch and the check that proves it works:

1. a new **provider** in the app (where next-token distributions come from),
2. a new **Worker upstream** (which model answers live requests),
3. your own **recorded garden**,
4. a new **theme**,
5. a new **session adapter** (another coding agent's transcripts on the map).

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

Return an `Upstream` (`worker/upstream/chat.ts`): a `model` (part of the cache key; `undefined` means "not configured"), `nextTokens(prefix)` that resolves to the normalized list or rejects with `ProviderError`, and `complete(body, timeoutMs)` that sends one OpenAI-style chat body (without `model`) and resolves to the raw completion. Wrap the network call in `callUpstream(name, (signal) => …)` and throw `RetryableError` for a 5xx. Then add a `case` to `selectUpstream`, its vars to `Env` in `worker/env.ts`, and tests with a mocked `fetch` next to `worker/test/limits.test.ts`. The Worker has no runtime dependencies; `pnpm check:size` enforces that.

### The structuring endpoint uses the same upstream

`POST /api/structure` (`worker/structure/`) sends one batch of up to 200 redacted step summaries (≤ 300 chars each, built by `buildBatches` in `shared/session/structure.ts`) through `complete` with a JSON-schema `response_format` and `temperature: 0.1`, and keeps only labels from the fixed set and links between step ids of that batch. It shares the KV cache (`st:v1:<model>:<sha256>`), `RL_ALL`/`RL_MISS` and the daily budget, so a self-hosted OpenAI-compatible upstream needs nothing extra, as long as the server supports `response_format: {type: "json_schema"}`. Bump `STRUCTURE_CACHE_VERSION` in `worker/structure/prompt.ts` when you change the prompt or the schema.

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

## 5. A session adapter

An adapter turns one agent's raw session files into the source-neutral `NormalizedSession` (`shared/session/types.ts`); `buildGraph` does the rest (steps, edges, episodes, trouble, outcome). Adapters are pure: text in, data out, no Node APIs, no throwing. Claude Code (`claudeCode.ts`), Grok Build (`grokBuild.ts`) and Codex (`codex.ts`) are the three in `shared/session/adapters/`.

1. **Add the source name.** Extend `SourceKind` in `shared/session/types.ts` and `SourceName` in `cli/src/args.ts`.
2. **Write the adapter** in `shared/session/adapters/<name>.ts`, exporting a `SessionAdapter`:
   - `sniff(firstLines)` returns true only for this format's record shape (the first five non-blank lines of the main file). It must not accept another adapter's records.
   - `parse(input)` returns one `NormalizedRecord` per raw line that holds something (`file`, 1-based `line`, `t` as ISO time, `items`), the lanes (`main` first, one per subagent), and the stats. Use `readJsonl` and `countSkipped` from `shared/session/jsonl.ts` so broken and half-written lines are counted. Count records you know but do not show as `ignoredRecords`, and everything else as `unknownRecords`; never drop silently.
   - Tool calls are `{ kind: 'tool-call', name, input, callId }` and results `{ kind: 'tool-result', callId, text, status }`. Map the tool's input keys to the ones `describeTool` reads (`file_path`, `path`, `command`, `pattern`, `url`, `query`, `description`, `old_string`/`new_string`), and add the tool names to `CATEGORY` in `shared/session/build/tools.ts` so reads, edits and shell runs are recognised.
3. **Register it** in `adapters` in `shared/session/adapter.ts`.
4. **Add a fixture** under `fixtures/sessions/<name>/`: synthetic content, written by hand, in the same file layout as the real store. Never copy a real session.
5. **Prove it with the contract suite** in a test next to the adapter:

   ```ts
   import { checkAdapterContract } from '../adapterContract';
   expect(checkAdapterContract(myAdapter, input)).toEqual([]);
   ```

   `checkAdapterContract` checks that sniff accepts the input, the output is deterministic, every step has provenance and a known lane, steps are in time order, edges point forward, and that a malformed line, an unknown record and a partial last line are each counted.
6. **Teach the CLI where the sessions are.** Add `cli/src/locate/<name>.ts` exporting a `Store` (`cli/src/locate/store.ts`): the env variable naming the current session, `listForCwd`, `findById`, `claims` for a path, `files` (paths relative to the store, so the graph never holds absolute paths) and `describe` for `--list`. Add it to `STORES` in `cli/src/locate/index.ts`, and a sandbox helper plus tests in `cli/test/`.
7. **Check real sessions** without printing them: `TG_REAL_SESSIONS=<path>[,<path>…] pnpm vitest run shared/session/real.test.ts` logs counts only (steps, skipped, unknown, timings).

### Worked example: Grok Build

Grok Build keeps each session in `~/.grok/sessions/<url-encoded cwd>/<session id>/`: `updates.jsonl` is an ACP stream of `session/update` records, `summary.json` has the title and model, and `subagents/<child id>/meta.json` describes each subagent, whose own `updates.jsonl` is in the folder next to its parent's.

- **Sniff.** A Grok line looks like `{"timestamp":1792058401,"method":"session/update","params":{"sessionId":"…","update":{"sessionUpdate":"user_message_chunk","content":{"type":"text","text":"Add a word"}}}}`. `grokBuildAdapter.sniff` accepts a `method` ending in `session/update` with a string `params.update.sessionUpdate`; Claude Code lines have a top-level `type` and Codex lines a `payload`, so they never match.
- **Chunks merge.** Consecutive `user_message_chunk`, `agent_message_chunk` or `agent_thought_chunk` updates join into one user, assistant or thinking item, kept on the first chunk's line.
- **Calls and results.** `tool_call` opens a call (the name comes from `_meta["x.ai/tool"].name`); a later `tool_call_update` without a status fills in `rawInput` (`target_file` becomes `file_path`); one with `status: "completed"` or `"failed"` becomes the result. A shell result with a non-zero `rawOutput.exit_code` is an error, so failed test runs show up as trouble.
- **Plans and turns.** A standalone `plan` update becomes a system step (`Plan: 1/3 done` plus the entries); one right after `todo_write` repeats it and is ignored. `turn_completed` with `stop_reason: "cancelled"` becomes an interruption.
- **Lanes.** Each subagent log becomes a lane named by its `meta.json`, linked to the spawning call by the call id in `meta.json` or the child id in the `spawn_subagent` result.
- **Store.** `cli/src/locate/grokBuild.ts` honours `GROK_HOME`, picks the highest `summary.json` `last_active_at`, and leaves subagent child sessions out of `--list`.
- **Tests.** `shared/session/adapters/grokCodex.test.ts` runs the contract suite on `fixtures/sessions/grok-build/notes/` and checks the merged text, the failed and passing test runs, the subagent lane and the outcome; `cli/test/locate.test.ts` and `cli/test/run.test.ts` cover the store in a sandbox `HOME`.

Run `pnpm vitest run shared/session/adapters cli/` and then `pnpm build:cli && node cli/dist/cli.mjs <path to updates.jsonl> --no-open` to see the map.
