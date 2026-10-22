// The parse worker (PLAN phase 19, V1): the dropped file is read and mapped here, off the main thread. Nothing is sent
// anywhere: the only messages go back to the page. A newer job stops an older read between chunks; Cancel ends the
// worker itself (see intake.ts).
import type { FromWorker, ToWorker } from './messages';
import { parseFile } from './parseFile';

let current = 0;
const send = (m: FromWorker) => postMessage(m);

addEventListener('message', (e: MessageEvent<ToWorker>) => {
  const { id, file, pick } = e.data;
  current = id;
  void parseFile(file, file.name, {
    onProgress: (lines, total) => send({ type: 'progress', id, lines, total }),
    cancelled: () => current !== id,
    pick,
  })
    .catch(() => ({ ok: false as const, error: 'unreadable' as const }))
    .then((result) => {
      if (result && current === id) send({ type: 'done', id, result });
    });
});
