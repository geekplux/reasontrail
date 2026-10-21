# record-samples

Records Reasontrail's built-in sample gardens (`src/samples/*.json`) from a real language model, so the app's first view needs no network and no API key.

By default it runs [SmolLM2-135M](https://huggingface.co/onnx-community/SmolLM2-135M-ONNX) (base model, q8, pinned revision) on your CPU with [transformers.js](https://github.com/huggingface/transformers.js). No key, no account, no GPU. One forward pass per fork gives the full next-token distribution for the raw text, which is exactly what a garden shows.

This folder has its own `package.json` and lockfile. It is **not** part of the app's install, so the app never ships or downloads the model.

## Quick start

From the repo root:

```sh
pnpm samples:record                     # all prompts in prompts.json -> src/samples/
pnpm samples:record --only cat          # one garden
```

`samples:record` installs this folder's dependencies on first use (about 490 MB, mostly onnxruntime), then runs `record.mjs`. The model download is about 134 MB and lands in `tools/record-samples/.cache/` (gitignored). The full run of six gardens took 12 s on an 8-core Linux box, with a peak RSS of about 590 MB.

To install by hand:

```sh
cd tools/record-samples
pnpm install --ignore-workspace --ignore-scripts
node record.mjs --help
```

`--ignore-scripts` skips onnxruntime-node's postinstall, which would download CUDA/TensorRT provider libraries (about 260 MB more). The CPU runtime ships inside the npm package, so CPU inference works without that step. This was checked on Linux x64.

## Options

| Flag | Default | Meaning |
|---|---|---|
| `--provider local-onnx\|worker` | `local-onnx` | Model source. `worker` posts to a running Reasontrail Worker's `POST /api/next-tokens` (for example `wrangler dev`). |
| `--url <url>` | `http://127.0.0.1:8787` | Worker base URL, used with `--provider worker`. |
| `--prompts <file>` | `prompts.json` here | List of `{ id, title, prompt }`. |
| `--only <id>` | (all) | Record one id from the list. |
| `--prompt <text> --id <id> --title <title>` | | Record one ad-hoc garden instead of the list. |
| `--k <n>` | `5` | Branches stored per fork (at most 8 with `worker`). |
| `--full-depth <n>` | `2` | Expand every node down to this depth (1 + 5 + 25 = 31 forks). |
| `--spine-depth <n>` | `6` | Extend the most probable paths to this depth. |
| `--spine-paths <n>` | `2` | How many paths to extend. |
| `--out <dir>` | `src/samples` | Where `<id>.json` is written. |
| `--cache-dir <dir>` | `tools/record-samples/.cache` | Model download cache. |
| `--date <YYYY-MM-DD>` | today (UTC) | The `recordedAt` value. Pass the committed date to reproduce a file byte for byte. |

## What it records

Format and policy are described in [docs/llm-provider.md](../../docs/llm-provider.md) §4.

- For each fork, it reads the top 20 tokens and decodes each id on its own. It drops empty, special and broken-UTF-8 (U+FFFD) tokens, merges tokens whose text is identical, and keeps the top `k`.
- Logprobs are natural logs rounded to 3 decimals. Ties are broken by token text, and keys are written in a fixed pre-order.
- onnxruntime runs single-threaded, so the same model and flags give byte-identical JSON on re-runs.
- Before writing, it checks the file's structure: sorted lists, `logprob <= 0`, probabilities summing to at most 1, every node expanded to `--full-depth`, the spines present, and at most 15 KB. If any check fails, it writes nothing for that garden and exits non-zero. The app's `src/samples/validate.ts` test is the authoritative gate.

## Add a garden to the app

1. Add `{ "id": "kettle", "title": "The kettle", "prompt": "The kettle began to" }` to `prompts.json`. Keep prompts neutral and everyday.
2. Run `pnpm samples:record --only kettle`.
3. Read the new file's root and spine branches. If the top branches are unpleasant, choose another prompt.
4. Import it in `src/samples/index.ts` and add it to the `samples` list.
5. Run `pnpm test` (it validates every sample) and `pnpm check:size`.

## Clean up

The recorder is a one-off. Free the disk afterwards:

```sh
rm -rf tools/record-samples/node_modules tools/record-samples/.cache
```
