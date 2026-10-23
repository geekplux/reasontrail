# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (a private security advisory). Do not open a public issue, and do not include real secrets or real session transcripts in the report; a minimal synthetic example is enough.

We aim to reply within a week. Once a fix is ready we publish the advisory and credit you, unless you prefer not to be named.

## Supported versions

Reasontrail is in early development. Only the latest commit on `main` (and, once published, the latest npm release) gets security fixes.

## Scope

In scope:

- **The CLI's file handling** (`cli/`): it reads session transcripts under `~/.claude`, `~/.codex`, `~/.grok` (or the paths in their environment variables) and paths you pass, and writes one HTML file. Reports here include reading files outside those locations, writing outside the output path, path traversal through session ids or file names, and script injection from transcript content into the generated HTML.
- **Redaction** (`shared/session/redact.ts`): `--share`, "Save shareable copy…" and the AI labels' request bodies must replace secrets, tokens, emails and home paths. A secret format that passes through unredacted is in scope.
- **The skill** (`skills/reasontrail/`): its kit must only run the CLI on the current session and never send files anywhere.
- **The Cloudflare Worker** (`worker/`): `/api/structure` and `/api/next-tokens`, including input validation, rate limits, the daily budget, caching and anything that could make it call the model without limits or leak one user's data to another.
- **The website**: files dropped on the page are parsed in the browser and must never be uploaded.

Out of scope: the private local map is unredacted by design (it shows your own transcript on your own machine); issues in the agents' own session formats; denial of service by sending a huge file to your own CLI.

## What Reasontrail does with your data

The CLI and the website make no network request unless you opt in to AI labels (`--ai`, or "AI labels…" then "Send"), which sends redacted one-line step summaries to the Worker. The lens grows a sentence live only after you ask it to. Nothing else leaves your machine.
