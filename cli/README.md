# reasontrail

See what your coding agent did. One command turns a Claude Code, Grok Build or Codex session into a self-contained
HTML map: the task, the route the agent took, where it got stuck, and what changed. It runs locally and uploads
nothing.

```sh
npx reasontrail install-skill   # once: adds the /reasontrail skill to your agents
npx reasontrail                 # map this folder's newest session and open it
```

Then ask your agent to "map this session" (`/reasontrail`, or `$reasontrail` in Codex). More:

```sh
npx reasontrail --list                  # the 10 most recent sessions for this folder
npx reasontrail path/to/session.jsonl   # any session file or session id
npx reasontrail --share                 # a redacted copy in the current folder; read it before you send it
npx reasontrail --help                  # every option and the exit codes
```

- **Local only.** The map is one HTML file that opens offline. No network request is made unless you pass `--ai`,
  which shows what it would send and asks first.
- **No dependencies.** Node 20.19 or later.

Source, screenshots and docs: <https://github.com/geekplux/reasontrail>. MIT licence.
