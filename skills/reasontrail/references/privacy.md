# Privacy

Reasontrail runs on your machine. It has no server, no account and no telemetry.

## What is read

- The session's main transcript, `<session id>.jsonl`.
- Its subagent transcripts and their `.meta.json` files, in `<session id>/subagents/`.
- Only the folder listing of the other sessions for this project, to find the newest one.

Nothing else in your home folder or project is opened.

## What is written

- One HTML file. By default it goes to `<temp folder>/reasontrail/claude-code-<session id>.html`, and `--out <file>` chooses another place.
- With `--share`, `reasontrail-<id>.html` in the current folder.
- `install-skill` writes only the skill's own folder (`~/.claude/skills/reasontrail/`, or `~/.grok/skills/reasontrail/`) and its `.reasontrail-install.json` record of what it installed.

## What is sent

Nothing. The kit and the CLI make no network request, and the HTML file loads nothing from the internet: fonts and code are inside it. Opening the file uses your normal browser.

## Private map and shareable copy

The default map is **private and unredacted**. It can show anything the session saw: file contents, command output, access tokens or passwords pasted into the chat. Keep it on your machine.

`--share` writes a separate copy for other people. Before it writes, it replaces:

- known secret formats (API keys and access tokens, JWTs, private-key blocks), `Authorization` headers, and `name=value` pairs whose name ends in key, token, secret, password, auth, cookie or session;
- email addresses;
- home-folder paths (`/home/<you>/…` becomes `~/…`).

It prints how many of each it replaced. Redaction is pattern-based, so read the copy before you post it.
