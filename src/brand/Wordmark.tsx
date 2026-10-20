import { LogoMark } from './LogoMark';

/**
 * The wordmark (PLAN §3.5): the mark, "token" in IBM Plex Mono 500 and "garden" in Instrument Serif Italic,
 * baseline-aligned. A visually hidden hyphen makes it read and copy as "token-garden".
 */
export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span className="wordmark-text">
        <span className="wordmark-token">token</span>
        <span className="visually-hidden">-</span>
        <span className="wordmark-garden">garden</span>
      </span>
    </span>
  );
}
