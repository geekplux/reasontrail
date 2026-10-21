// Install (DESIGN §13.3, PLAN phase 19 AC2): the skill one-liner and the CLI. Every command comes from
// shared/commands.ts, which the CLI's --help and the skill installer also use; the site flow runs each one.
import { useEffect, useRef, useState } from 'react';
import { COMMANDS, SKILL_CALL, SKILL_HOMES } from '../../shared/commands';

const SAID_MS = 2500;

/** A command in a mono box with a Copy button, and a visible status line after it ("Copied"). On failure the command
 * is selected so the keyboard copy works. */
export function CommandLine({ command, label }: { command: string; label?: string }) {
  const [said, setSaid] = useState('');
  const code = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const frame = useRef(0);
  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    clearTimeout(timer.current);
  }, []);
  // Cleared first, then set on the next frame, so a second copy is announced again.
  const say = (text: string) => {
    clearTimeout(timer.current);
    cancelAnimationFrame(frame.current);
    setSaid('');
    frame.current = requestAnimationFrame(() => {
      setSaid(text);
      timer.current = setTimeout(() => setSaid(''), SAID_MS);
    });
  };
  const selectCommand = () => {
    const el = code.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const copy = () =>
    void (navigator.clipboard?.writeText(command) ?? Promise.reject(new Error('no clipboard'))).then(
      () => say('Copied'),
      () => {
        selectCommand();
        say('Copy failed; the command is selected — press Ctrl or Cmd+C');
      },
    );
  return (
    <div className="command">
      <code ref={code} data-command="">{command}</code>
      <button type="button" className="text-button" onClick={copy} aria-label={`Copy ${label ?? 'command'}`}>
        Copy
      </button>
      <span className="copy-said" role="status">{said}</span>
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
      <h2 id="h-install-line" className="section-label">Install the skill</h2>
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
      <h1 className="page-title" tabIndex={-1}>Install</h1>
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
