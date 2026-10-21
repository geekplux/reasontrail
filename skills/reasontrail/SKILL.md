---
name: reasontrail
description: Map how the current coding-agent session reasoned and worked. Turns this session's transcript into a local, self-contained HTML map (task, route, trouble, outcome), opens it in the browser and replies with the file path. Use only when the user asks to see, map or review how this session (or "you") reasoned or worked, for example "map this session", "show how this session reasoned", "show me your reasoning trail" or "/reasontrail". Do not use it to explain code, summarise files, answer general questions about reasoning, or review code changes.
license: MIT
compatibility: Written for Claude Code; Grok Build reads the same ~/.claude/skills folder. Needs Node.js 20.19+. Codex support is planned.
---

# Reasontrail

Reasontrail draws the session you are in as a trail map: the task, the route of episodes, the trouble along the way and the outcome. It runs on this machine and writes one HTML file.

## Steps

1. Run the kit from this skill's folder:

   ```sh
   node "${CLAUDE_SKILL_DIR}/kit/run.mjs"
   ```

   `${CLAUDE_SKILL_DIR}` is this skill's folder. Claude Code fills it in; if it is still literal, use the folder this file is in. Add `--no-open` when there is no browser (SSH, CI, a container). The kit finds this session from `CLAUDE_CODE_SESSION_ID`, else the newest session for the current folder, and prints the session file it used on stderr.
2. On success the kit prints exactly one line on stdout: `MAP: <path>`. Reply in three short lines: the path, unchanged, followed by "Opened in your browser." (or "Open it in a browser." when you passed `--no-open`); then "The map stays on this machine and is unredacted. Written reasoning is the agent's own account, not a record of how the model computed."; then the offer in step 3. If stderr says it used the newest session instead of this one, say so first.
3. Offer a shareable copy in one line, "Want a copy you can share? I can write one with secrets, emails and home paths replaced.", and run it only if the user says yes:

   ```sh
   node "${CLAUDE_SKILL_DIR}/kit/run.mjs" --share
   ```

   It writes `reasontrail-<id>.html` into the current folder with secrets, emails and home paths replaced, and prints what it replaced. Never upload, attach or send the file anywhere yourself.

If there is no `MAP:` line, relay the kit's message. Exit 2 means no session was found and exit 3 means the session could not be read; `references/troubleshooting.md` has the fixes.

## Privacy

Everything runs locally. The kit reads only this session's transcript files and writes one HTML file. It makes no network request and uploads nothing. The default map is private and unredacted: it shows the transcript as it is, so only `--share` copies are meant for other people. Details: `references/privacy.md`.

## Honesty

The map is built from the transcript by deterministic rules, with no AI. It shows what the agent wrote and did. Written reasoning is the agent's own account, not a record of how the model computed. Episode names and trouble markers are heuristics, and the page says so in its honesty label. Do not claim more than the map shows.

## References

Read these when you need them:

- `references/formats.md`: where Claude Code, Grok Build and Codex keep sessions, and which ones Reasontrail reads today.
- `references/privacy.md`: what is read and written, what `--share` replaces, and what is never sent anywhere.
- `references/troubleshooting.md`: no session found, the wrong session, no browser, the CLI not found.
