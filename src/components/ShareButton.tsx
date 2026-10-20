import { useEffect, useRef, useState } from 'react';

/** "Copy link": the address bar already holds the current view (F14). Falls back to a selected text field. */
export function ShareButton() {
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fallback !== null) field.current?.select();
  }, [fallback]);

  // "Link copied" is a passing confirmation: cleared after 4 s (the timer goes with the message or the component).
  useEffect(() => {
    if (message !== 'Link copied') return;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const copy = async () => {
    const url = window.location.href;
    setMessage('');
    try {
      await navigator.clipboard.writeText(url);
      setFallback(null);
      setMessage('Link copied');
    } catch {
      setFallback(url);
      setMessage('Copy the selected link');
    }
  };

  return (
    <span className="share">
      <button type="button" className="header-link share-button" onClick={() => void copy()}>
        Copy link
      </button>
      {fallback !== null ? <input ref={field} className="share-field" readOnly value={fallback} aria-label="Link to this view" onFocus={(e) => e.currentTarget.select()} /> : null}
      <span className="share-status" role="status">
        {message}
      </span>
    </span>
  );
}
