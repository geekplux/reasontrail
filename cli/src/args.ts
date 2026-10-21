// Command-line parsing (C2). Pure: argv in, options or a usage error out.
import { parseStepRange, type StepRange } from '../../shared/session/trim';

export type SourceName = 'claude-code' | 'codex' | 'grok-build';
/** `grok` is accepted as a short name for `grok-build`. */
const SOURCES: readonly SourceName[] = ['claude-code', 'codex', 'grok-build'];

export interface Options {
  /** `auto` = an explicit target if given, else the newest session for the cwd. */
  mode: 'auto' | 'current' | 'latest' | 'list' | 'help' | 'version';
  /** A session file path or a session id. */
  target?: string;
  source?: SourceName;
  out?: string;
  share: boolean;
  json: boolean;
  open: boolean;
  /** Keep only steps `from`…`to` of the full graph (inclusive). */
  trim?: StepRange;
}

export function parseArgs(argv: readonly string[]): Options | { error: string } {
  const opts: Options = { mode: 'auto', share: false, json: false, open: true };
  const modes = new Set<Options['mode']>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const [flag, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const value = (): string | undefined => inline ?? (argv[i + 1] !== undefined && !argv[i + 1]?.startsWith('-') ? argv[++i] : undefined);
    switch (flag) {
      case '-h': case '--help': modes.add('help'); break;
      case '-v': case '--version': modes.add('version'); break;
      case '--current': modes.add('current'); break;
      case '--latest': modes.add('latest'); break;
      case '--list': modes.add('list'); break;
      case '--share': opts.share = true; break;
      case '--json': opts.json = true; break;
      case '--no-open': opts.open = false; break;
      case '--out': {
        const v = value();
        if (!v) return { error: '--out needs a file path' };
        opts.out = v;
        break;
      }
      case '--trim': {
        const v = value();
        const range = v === undefined ? undefined : parseStepRange(v);
        if (!range) return { error: '--trim needs <from>:<to> step numbers, from <= to' };
        opts.trim = range;
        break;
      }
      case '--source': {
        const given = value();
        const v = given === 'grok' ? 'grok-build' : given;
        if (!v || !SOURCES.includes(v as SourceName)) return { error: '--source must be one of claude-code, grok, codex' };
        opts.source = v as SourceName;
        break;
      }
      default:
        if (arg.startsWith('-')) return { error: `unknown option: ${arg}` };
        if (opts.target) return { error: `more than one session given: ${opts.target}, ${arg}` };
        opts.target = arg;
    }
  }
  if (modes.has('help')) return { ...opts, mode: 'help' };
  if (modes.has('version')) return { ...opts, mode: 'version' };
  if (modes.size > 1) return { error: `choose one of ${[...modes].map((m) => `--${m}`).join(', ')}` };
  if (opts.target && modes.size > 0) return { error: `a session path or id cannot be combined with --${[...modes][0]}` };
  const [mode] = modes;
  if (mode) opts.mode = mode;
  return opts;
}
