// Install (DESIGN §13.3, PLAN phase 19 AC2): the skill one-liner and the CLI. Every command comes from
// shared/commands.ts, which the CLI's --help and the skill installer also use; the site flow runs each one.
import { useState } from 'react';
import { COMMANDS, SKILL_CALL, SKILL_HOMES } from '../../shared/commands';

/** A command in a mono box with a Copy button. */
export function CommandLine({ command, label }: { command: string; label?: string }) {
  const [said, setSaid] = useState('');
  const copy = () =>
    void (navigator.clipboard?.writeText(command) ?? Promise.reject(new Error('no clipboard'))).then(
      () => setSaid('Copied'),
      () => setSaid('Copy failed; select the command instead'),
    );
  return (
    <div className="command">
      <code data-command="">{command}</code>
      <button type="button" className="text-button" onClick={copy} aria-label={`Copy ${label ?? 'command'}`}>
        Copy
      </button>
      <span className="visually-hidden" aria-live="polite">{said}</span>
    </div>
  );
}

const callLine = (
  <>
    Then ask your agent to “map this session”, or type <code>{SKILL_CALL.slash}</code> in Claude Code or Grok Build,{' '}
    <code>{SKILL_CALL.codex}</code> in Codex.
  </>
);

/** The home page's one install line, after the map. */
export function InstallLine() {
  return (
    <section className="install-line" aria-labelledby="h-install-line">
      <h2 id="h-install-line" className="section-label">Map your own sessions</h2>
      <CommandLine command={COMMANDS.installSkill} label="the skill install command" />
      <p className="muted">
        {callLine} <a href="?view=install">All install options</a>
      </p>
    </section>
  );
}

/** `?view=install`. */
export function Install() {
  return (
    <div className="page install">
      <h1 className="page-title">Install</h1>
      <section aria-labelledby="h-skill">
        <h2 id="h-skill" className="section-label">The skill</h2>
        <CommandLine command={COMMANDS.installSkill} label="the skill install command" />
        <p>{callLine}</p>
        <details>
          <summary>Where it goes, per agent</summary>
          <ul className="plain-list">
            <li>Claude Code: <code>{SKILL_HOMES.claude}/reasontrail</code></li>
            <li>Grok Build: reads <code>{SKILL_HOMES.claude}</code>, or <code>{SKILL_HOMES.grok}/reasontrail</code> when <code>~/.claude</code> is absent</li>
            <li>Codex: <code>{SKILL_HOMES.codex}/reasontrail</code></li>
          </ul>
          <p>One agent only (claude, grok or codex):</p>
          <CommandLine command={COMMANDS.installOne} label="the one-agent install command" />
        </details>
      </section>
      <section aria-labelledby="h-cli">
        <h2 id="h-cli" className="section-label">Or run it yourself</h2>
        <CommandLine command={COMMANDS.open} label="the map command" />
        <p>Maps the newest session for this folder and opens it in your browser. Nothing is uploaded.</p>
        <details>
          <summary>More commands</summary>
          <p>The 10 most recent sessions here:</p>
          <CommandLine command={COMMANDS.list} label="the list command" />
          <p>A redacted copy you can share:</p>
          <CommandLine command={COMMANDS.share} label="the share command" />
        </details>
      </section>
    </div>
  );
}
