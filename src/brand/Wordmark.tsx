import { LogoMark } from './LogoMark';

/**
 * The wordmark (PLAN §3.5): the mark, "token" in IBM Plex Mono 500 and "garden" in Instrument Serif Italic,
 * baseline-aligned. A visually hidden hyphen makes it copy as "token-garden"; as a logo image it is announced as one
 * name, "token-garden" (the hidden hyphen alone made screen readers split it into "token - garden").
 */
export function Wordmark() {
  return (
    <span className="wordmark" role="img" aria-label="token-garden">
      <LogoMark />
      <span className="wordmark-text">
        <span className="wordmark-token">token</span>
        <span className="visually-hidden">-</span>
        <span className="wordmark-garden">garden</span>
      </span>
    </span>
  );
}
