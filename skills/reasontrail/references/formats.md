# Session formats

Checked 2026-10-21. Agent tools change their stores; if a path below is out of date, `references/troubleshooting.md` says how to point Reasontrail at a file directly.

| Tool | Where sessions live | How the current session is found | Read today |
|---|---|---|---|
| Claude Code | `~/.claude/projects/<folder>/<session id>.jsonl`, where `<folder>` is the working directory with every character other than a letter or digit replaced by `-`. Subagents are in `<session id>/subagents/agent-*.jsonl`, each with a `.meta.json` (agent type, description). `CLAUDE_CONFIG_DIR` moves `~/.claude`. | `CLAUDE_CODE_SESSION_ID`, which Claude Code sets for the commands it runs; otherwise the newest `.jsonl` in the folder | Yes |
| Grok Build | `${GROK_HOME:-~/.grok}/sessions/<url-encoded folder>/<session id>/updates.jsonl`, with `summary.json` (title, model, start and last-active times) and `subagents/` | `GROK_SESSION_ID`; otherwise the highest `last_active_at` | Planned (phase 18) |
| Codex CLI | `${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl` | No variable; the newest rollout whose first `session_meta` record has the current folder as `cwd` | Planned (phase 18) |

Session files grow while the agent works. Reasontrail reads up to the last complete line, so mapping a live session is safe.

The skill folder itself: Claude Code loads skills from `~/.claude/skills/<name>/SKILL.md`, and Grok Build scans the same folder (or `~/.grok/skills/` when `~/.claude` is absent). `npx reasontrail install-skill` puts the skill there.
