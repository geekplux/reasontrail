import { LogoMark } from './LogoMark';

/** The wordmark (docs/DESIGN.md §2): the leaf at 20px, an 8px gap, then "Reasontrail" in Geist 600 14px. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span>Reasontrail</span>
    </span>
  );
}
