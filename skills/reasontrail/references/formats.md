# Session formats

Checked 2026-10-21. Agent tools change their stores; if a path below is out of date, `references/troubleshooting.md` says how to point Reasontrail at a file directly.

| Tool | Where sessions live | How the current session is found | Read today |
|---|---|---|---|
| Claude Code | `~/.claude/projects/<folder>/<session id>.jsonl`, where `<folder>` is the working directory with every character other than a letter or digit replaced by `-`. Subagents are in `<session id>/subagents/agent-*.jsonl`, each with a `.meta.json` (agent type, description). `CLAUDE_CONFIG_DIR` moves `~/.claude`. | `CLAUDE_CODE_SESSION_ID`, which Claude Code sets for the commands it runs; otherwise the newest `.jsonl` in the folder | Yes |
| Grok Build | `${GROK_HOME:-~/.grok}/sessions/<url-encoded folder>/<session id>/updates.jsonl` (an ACP `session/update` stream), with `summary.json` (title, model, start and last-active times) and `subagents/<child id>/meta.json`; a child session's own `updates.jsonl` sits next to its parent's folder | `GROK_SESSION_ID` (documented for hooks; whether commands the agent runs get it is not verified yet); otherwise the highest `last_active_at` | Yes. Checked against Grok Build 1.0.34; the format has no published stability promise |
| Codex CLI | `${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl`, one `{timestamp, type, payload}` line per item (`session_meta`, `turn_context`, `response_item`, `event_msg`, `compacted`) | `CODEX_THREAD_ID`, which Codex sets for the commands it runs; otherwise the newest rollout whose `session_meta` record has the current folder as `cwd` | Yes, built from the public Codex source; not yet checked against a real session |

With no session id set, Reasontrail takes the most recent session for the folder across all three stores; `--source claude-code|grok|codex` limits it to one, and `--list` shows them side by side.

Session files grow while the agent works. Reasontrail reads up to the last complete line, so mapping a live session is safe.

The skill folder itself: Claude Code loads skills from `~/.claude/skills/<name>/SKILL.md`, and Grok Build scans the same folder (or `~/.grok/skills/` when `~/.claude` is absent). Codex loads user skills from `~/.agents/skills/<name>/SKILL.md` (Agent Skills format, with `agents/openai.yaml` for its display name); type `$reasontrail` or pick it from `/skills`. `node cli/dist/cli.mjs install-skill` (from a clone; `npx reasontrail install-skill` once published) puts the skill in all of these.
