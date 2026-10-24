// Install (DESIGN §13.3, PLAN phase 19 AC2): the skill one-liner and the CLI. Every command comes from
// shared/commands.ts, which the CLI's --help and the skill installer also use; the site flow runs each one.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { COMMANDS, SKILL_CALL, SKILL_HOMES } from '../../shared/commands';

const SAID_MS = 2500;

/** The v7 command box (§4.2): mono text and a copy icon button that turns into a check while "Copied" is said to
 * screen readers. On failure the command is selected so the keyboard copy works. `big`: the page's focal command, the
 * full-width 48px box. */
export function CommandLine({ command, label, big = false }: { command: string; label?: string; big?: boolean }) {
  const [said, setSaid] = useState('');
  const code = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Emptied synchronously, then set 100 ms later, so a second copy is announced again whatever the timing.
  const say = (text: string) => {
    clearTimeout(timer.current);
    flushSync(() => setSaid(''));
    timer.current = setTimeout(() => {
      setSaid(text);
      timer.current = setTimeout(() => setSaid(''), SAID_MS);
    }, 100);
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
    <div className={big ? 'cmdbox big' : 'cmdbox'}>
      <code ref={code} className="code" data-command="">{command}</code>
      <button type="button" className="iconbtn" onClick={copy} aria-label={`Copy ${label ?? 'command'}`}>
        {said === 'Copied' ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className="visually-hidden" role="status">{said}</span>
    </div>
  );
}

const CopyIcon = () => (
  <svg className="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="5.25" y="5.25" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M10.5 3.5v-.25A1.5 1.5 0 0 0 9 1.75H3.25a1.5 1.5 0 0 0-1.5 1.5V9a1.5 1.5 0 0 0 1.5 1.5h.25" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);
const CheckIcon = () => (
  <svg className="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const callLine = (
  <>
    Then ask your agent to “map this session”, or type <code>{SKILL_CALL.slash}</code> in Claude Code or Grok Build,{' '}
    <code>{SKILL_CALL.codex}</code> in Codex.
  </>
);

/** `?view=install`. */
export function Install() {
  return (
    <div className="page install">
      <h1 className="page-title" tabIndex={-1}>Install</h1>
      <section aria-labelledby="h-skill">
        <h2 id="h-skill" className="install-h">The skill</h2>
        <CommandLine command={COMMANDS.installSkill} label="the skill install command" big />
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
        <h2 id="h-cli" className="install-h">Or run it yourself</h2>
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
