import { LogoMark } from './LogoMark';

/** The wordmark (docs/design/v7/PROMPT.md §3.4): the leaf at 20px, an 8px gap, then "Reasontrail" in Geist 600 14px. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span>Reasontrail</span>
    </span>
  );
}
