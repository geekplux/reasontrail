// Best-effort reading of shell commands (agents mostly write files through Bash, DESIGN §14.3): which files a command
// writes, deletes or reverts, a normalized key for "the same command", and whether it is a verification run.
// A small quote-aware lexer, not a shell: globs, variables and command substitution are not expanded (those paths are skipped).

interface Segment {
  words: string[];
  /** The segment reads a pipe (`a | b`: true for b). */
  piped: boolean;
}

/** What a command does to files. Paths are resolved against the cwd (and any `cd` before them). */
export interface ShellEffects {
  writes: string[];
  deletes: string[];
  /** Paths a `git checkout/restore` puts back. */
  reverts: string[];
  /** `git reset --hard` (or `git checkout .`): every touched file is put back. */
  revertAll: boolean;
  /** Deletes that look like folders: targets of a recursive `rm` with no file extension (also listed in `deletes`). */
  dirs: string[];
}

/** Drop heredoc bodies (`<<EOF … EOF`), keeping the line that opens them. */
function stripHeredocs(cmd: string): string {
  const lines = cmd.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i++] ?? '';
    out.push(line);
    for (const m of line.matchAll(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/g)) {
      while (i < lines.length && lines[i]?.trim() !== m[2]) i++;
      i++;
    }
  }
  return out.join('\n');
}

function lex(cmd: string): Segment[] {
  const segs: Segment[] = [{ words: [], piped: false }];
  let word = '';
  let has = false;
  let quote = '';
  const cur = () => segs[segs.length - 1] as Segment;
  const push = () => {
    if (has) cur().words.push(word);
    word = '';
    has = false;
  };
  const split = (piped: boolean) => {
    push();
    if (cur().words.length > 0) segs.push({ words: [], piped });
    else cur().piped = piped;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i] as string;
    if (quote) {
      if (c === quote) quote = '';
      else if (c === '\\' && quote === '"' && i + 1 < cmd.length) word += cmd[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < cmd.length) {
      word += cmd[++i];
      has = true;
    } else if (c === ' ' || c === '\t') push();
    else if (c === '>' || c === '<') {
      const fd = has && /^[0-9&]$/.test(word) ? word : '';
      if (fd) {
        word = '';
        has = false;
      } else push();
      let op = fd + c;
      if (cmd[i + 1] === c) op += cmd[++i];
      if (cmd[i + 1] === '&') op += cmd[++i];
      cur().words.push(op);
    } else if (c === '&' && cmd[i + 1] === '>') {
      push();
      word = '&';
      has = true;
    } else if (c === '\n' || c === ';' || c === '&' || c === '|') {
      const double = (c === '&' || c === '|') && cmd[i + 1] === c;
      if (double) i++;
      split(c === '|' && !double);
    } else {
      word += c;
      has = true;
    }
  }
  push();
  return segs.filter((s) => s.words.length > 0);
}

const isRedirect = (w: string) => /^[0-9&]?(>>?|<<?)&?$/.test(w);
const usable = (p: string | undefined): p is string => !!p && p !== '-' && !p.startsWith('/dev/') && !/[*?$`{}]/.test(p);

/** Resolve `p` against `cwd` and normalise `.` and `..` segments. `~` paths are kept as they are. */
export function resolvePath(cwd: string | undefined, p: string): string {
  if (p.startsWith('~')) return p;
  const full = p.startsWith('/') || !cwd ? p : `${cwd}/${p}`;
  const out: string[] = [];
  for (const s of full.split('/')) {
    if (s === '..') out.pop();
    else if (s !== '.' && s !== '') out.push(s);
  }
  return (full.startsWith('/') ? '/' : '') + out.join('/');
}

/** Words without leading `VAR=x`, `sudo` or `command`, split into the redirect targets and the plain arguments. */
function splitWords(words: string[]): { name: string; args: string[]; redirects: { op: string; target: string }[] } {
  let k = 0;
  while (k < words.length && (/^[A-Za-z_]\w*=/.test(words[k] as string) || words[k] === 'sudo' || words[k] === 'command')) k++;
  const args: string[] = [];
  const redirects: { op: string; target: string }[] = [];
  for (let i = k; i < words.length; i++) {
    const w = words[i] as string;
    if (isRedirect(w)) {
      const target = words[++i] ?? '';
      redirects.push({ op: w, target: w.endsWith('&') ? '' : target });
    }
    else args.push(w);
  }
  return { name: args.shift() ?? '', args, redirects };
}

const plain = (args: string[]) => args.filter((a) => !a.startsWith('-'));

/** Files a shell command writes, deletes or reverts (best effort, documented in DECISIONS.md). */
export function shellEffects(command: string, cwd?: string): ShellEffects {
  const fx: ShellEffects = { writes: [], deletes: [], reverts: [], revertAll: false, dirs: [] };
  let dir = cwd;
  const at = (list: string[], paths: (string | undefined)[]) => {
    for (const p of paths) if (usable(p)) list.push(resolvePath(dir, p));
  };
  let scriptDir = cwd;
  for (const seg of lex(stripHeredocs(command))) {
    const { name, args, redirects } = splitWords(seg.words);
    at(fx.writes, redirects.filter((r) => r.op.includes('>')).map((r) => r.target));
    const sub = name === 'git' ? (args.find((a) => !a.startsWith('-')) ?? '') : '';
    const rest = sub ? args.slice(args.indexOf(sub) + 1) : args;
    if (name === 'cd') dir = usable(args[0]) ? resolvePath(dir, args[0]) : dir;
    else if (/^(python3?|node|ruby|perl)$/.test(name)) scriptDir = dir;
    if (name === 'tee' || name === 'touch') at(fx.writes, plain(args));
    else if (name === 'sed' && args.some((a) => /^-[a-zA-Z]*i|^--in-place/.test(a))) {
      const files: string[] = [];
      let script = false;
      for (let i = 0; i < args.length; i++) {
        const a = args[i] as string;
        if (a === '-e' || a === '-f' || a === '--expression') {
          i++;
          script = true;
        } else if (!a.startsWith('-')) files.push(a);
      }
      at(fx.writes, script ? files : files.slice(1));
    } else if (name === 'cp' || name === 'mv' || sub === 'mv') {
      const p = plain(rest);
      if (p.length >= 2) {
        at(fx.writes, [p[p.length - 1]]);
        if (name !== 'cp') at(fx.deletes, p.slice(0, -1));
      }
    } else if (name === 'rm' || sub === 'rm') {
      at(fx.deletes, plain(rest));
      if (rest.some((a) => /^-[a-zA-Z]*[rR]|^--recursive$/.test(a))) at(fx.dirs, plain(rest).filter((p) => !/\.[^./]+$/.test(p.replace(/\/+$/, ''))));
    }
    else if (sub === 'checkout' || (sub === 'restore' && (!rest.includes('--staged') || rest.includes('--worktree')))) {
      const dd = rest.indexOf('--');
      const paths = dd >= 0 ? rest.slice(dd + 1) : plain(rest).filter((_, i) => sub === 'restore' || i > 0 || rest.length === 1);
      if (paths.includes('.')) fx.revertAll = true;
      else at(fx.reverts, paths.filter((p) => sub === 'restore' || dd >= 0 || /[./]/.test(p)));
    } else if (sub === 'reset' && rest.includes('--hard')) fx.revertAll = true;
  }
  // Writes from inline scripts (python heredocs, node -e): open(p, 'w'|'a'|'x'), Path(p).write_text(), fs.writeFileSync(p).
  const scripted = /\bopen\(\s*[rfb]?(['"])([^'"\n]+)\1\s*,\s*(['"])[wax]|\bPath\(\s*(['"])([^'"\n]+)\4\s*\)\.write_(?:text|bytes)|\b(?:writeFileSync|appendFileSync|writeFile)\(\s*(['"`])([^'"`\n]+)\6/g;
  dir = scriptDir;
  for (const m of command.matchAll(scripted)) at(fx.writes, [m[2] ?? m[5] ?? m[7]]);
  return fx;
}

const FILTERS = /^(head|tail|grep|rg|wc|sort|uniq|cat|less|tee|cut|tr)$/;

/** A normalized form of a command for "the same command again": no `cd`, no output filters, no redirects, single spaces. */
export function commandKey(command: string): string {
  return lex(stripHeredocs(command))
    .filter((s) => s.words[0] !== 'cd' && !(s.piped && FILTERS.test(s.words[0] ?? '')))
    .map((s) => s.words.filter((w, i, all) => !isRedirect(w) && !isRedirect(all[i - 1] ?? '')).join(' '))
    .join(' && ');
}

const DIRECT = /^(vitest|jest|mocha|pytest|tsc|oxlint|eslint|playwright|tsgo)$/;
const RUNNER = /^(pnpm|npm|yarn|bun|npx|pnpx|bunx|deno|cargo|go|make|just|uv|poetry|python3?|node)$/;
const VERIFY = /^(--test|test|tests|vitest|jest|mocha|pytest|build|lint|oxlint|eslint|typecheck|tsc|check|clippy|vet)(:[\w:.-]+)?$/;

/** True when the command runs tests, a build, a linter or a typechecker. */
export function isVerification(command: string): boolean {
  return lex(stripHeredocs(command)).some((s) => {
    if (s.piped) return false;
    const { name, args } = splitWords(s.words);
    if (DIRECT.test(name)) return true;
    return RUNNER.test(name) && args.slice(0, 4).some((a) => VERIFY.test(a));
  });
}

/** First words of a command for titles: "pnpm test", "git status". */
export function commandHead(command: string): string {
  const seg = lex(stripHeredocs(command)).find((s) => s.words[0] !== 'cd');
  if (!seg) return command.trim().split(/\s+/, 1)[0] ?? '';
  const { name, args } = splitWords(seg.words);
  const next = args.filter((a) => !a.startsWith('-') && !/\s/.test(a));
  const take = next[0] === 'run' || next[0] === 'exec' ? 2 : 1;
  return [name, ...next.slice(0, take)].join(' ').slice(0, 60);
}

/** The verification runs inside a command, without `cd`, flags like `-s` or what follows them: `cd x && pnpm -s lint &&
 * echo OK && pnpm typecheck` → "pnpm lint && pnpm typecheck". Empty when the command runs none (DESIGN §8.9). */
export function verifyCommand(command: string): string {
  const runs: string[] = [];
  for (const s of lex(stripHeredocs(command))) {
    if (s.piped) continue;
    const { name, args } = splitWords(s.words);
    const words = [name, ...args.filter((a) => a !== '-s' && a !== '--silent')];
    const at = RUNNER.test(name) ? words.slice(1, 5).findIndex((a) => VERIFY.test(a)) : -1;
    const run = DIRECT.test(name) ? name : at >= 0 ? words.slice(0, at + 2).join(' ') : '';
    if (run && !runs.includes(run)) runs.push(run);
  }
  return runs.join(' && ');
}

/** What the verification runs of a command check, as nouns for titles: "tests", "lint", "typecheck", "build", "browser check". */
export function verifyNouns(command: string): string[] {
  const nouns = verifyCommand(command).split(' && ').flatMap((run) => {
    const word = run.split(' ').pop() ?? '';
    if (!word) return [];
    if (/^(--test|tests?|vitest|jest|mocha|pytest|playwright)(:|$)/.test(word)) return ['tests'];
    if (/^(lint|oxlint|eslint|clippy|vet)(:|$)/.test(word)) return ['lint'];
    if (/^(typecheck|tsc|tsgo)(:|$)/.test(word)) return ['typecheck'];
    if (/^build(:|$)/.test(word)) return ['build'];
    const sub = /^check:([\w-]+)/.exec(word)?.[1];
    return [sub ? `${sub} check` : 'checks'];
  });
  return [...new Set(nouns)];
}

const PAGERS = /^(cat|head|tail|nl|wc|less|more|bat|sed|awk)$/;
const SEARCHERS = /^(grep|egrep|rg|ag)$/;

/** Files a read-only shell command looks at (`sed -n 1,9p a.ts`, `cat a.ts`, `head -n 5 a.ts`) and the patterns it
 * searches for (`grep -n foo src`). Best effort, like `shellEffects`; paths are resolved against the cwd. */
export function shellReads(command: string, cwd?: string): { files: string[]; patterns: string[] } {
  const out = { files: [] as string[], patterns: [] as string[] };
  let dir = cwd;
  for (const seg of lex(stripHeredocs(command))) {
    const { name, args } = splitWords(seg.words);
    if (name === 'cd') dir = usable(args[0]) ? resolvePath(dir, args[0]) : dir;
    if (seg.piped) continue;
    const takesValue = name === 'head' || name === 'tail' ? /^-[nc]$/ : SEARCHERS.test(name) ? /^-[ABCme]$/ : undefined;
    const plainArgs = args.filter((a, i) => !a.startsWith('-') && !(i > 0 && takesValue?.test(args[i - 1] as string)));
    let files: string[] = [];
    if (SEARCHERS.test(name)) {
      const e = args.indexOf('-e');
      const pattern = e >= 0 ? args[e + 1] : plainArgs[0];
      if (pattern) out.patterns.push(pattern);
      files = e >= 0 ? plainArgs : plainArgs.slice(1);
    } else if (PAGERS.test(name)) {
      const scripted = (name === 'sed' || name === 'awk') && !args.includes('-e') && !args.includes('-f');
      files = scripted ? plainArgs.slice(1) : plainArgs;
    }
    for (const f of files) if (usable(f) && /[./]/.test(f) && !/^\d/.test(f)) out.files.push(resolvePath(dir, f));
  }
  return out;
}
