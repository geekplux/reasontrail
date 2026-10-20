import { useCallback, useState } from 'react';

/** The page's one polite status region: mounted once and empty at first, so each new message is announced. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <p className="visually-hidden" role="status" data-role="live">
      {message}
    </p>
  );
}

/** Message state for `LiveRegion`. Saying the same text twice still re-announces (a no-break space is toggled). */
export function useAnnouncer() {
  const [message, setMessage] = useState('');
  const announce = useCallback((text: string) => setMessage((m) => (m === text ? `${text} ` : text)), []);
  return [message, announce] as const;
}
