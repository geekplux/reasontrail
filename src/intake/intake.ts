// The page's side of the intake. The worker script is fetched once, when the site is idle, and kept as a blob URL, so
// parsing a file later needs no request at all (V1) and still works offline (AC3). Cancel ends the worker at once (even
// mid-parse) and the next file gets a fresh one from the same blob. Small files fall back to the main thread.
import { MAIN_THREAD_MAX, MAX_BYTES, type FromWorker, type IntakeResult } from './messages';
import workerUrl from './parse.worker?worker&url';

let source: Promise<string | null> | undefined;
let worker: Worker | null = null;
let seq = 0;

/** Fetches the worker script (once) and starts a worker if none is running. Resolves to null if it cannot start. */
export function warmIntake(): Promise<Worker | null> {
  // In dev the worker is an ES module with imports, which a blob URL cannot resolve; start it from its own URL.
  source ??= import.meta.env.DEV
    ? Promise.resolve(workerUrl)
    : fetch(workerUrl)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((js) => URL.createObjectURL(new Blob([js], { type: 'text/javascript' })))
        .catch(() => null);
  return source.then((url) => {
    if (url && !worker) {
      try {
        worker = new Worker(url, import.meta.env.DEV ? { type: 'module' } : {});
      } catch {
        return null;
      }
    }
    return worker;
  });
}

export interface Job {
  /** The result, or `null` once cancelled. */
  result: Promise<IntakeResult | null>;
  cancel(): void;
}

/** Reads and maps `file` in the browser. `onProgress` gets lines read so far of the file's total. */
export function startParse(file: File, onProgress: (lines: number, total: number) => void): Job {
  if (file.size > MAX_BYTES) return { result: Promise.resolve({ ok: false, error: 'too-large' }), cancel() {} };
  const id = ++seq;
  let running = true;
  let settle: (r: IntakeResult | null) => void = () => {};
  const result = new Promise<IntakeResult | null>((resolve) => (settle = resolve));
  const finish = (r: IntakeResult) => {
    if (!running) return;
    running = false;
    settle(r);
  };
  const fallback = () => {
    if (!running) return;
    if (file.size >= MAIN_THREAD_MAX) return finish({ ok: false, error: 'worker' });
    void import('./parseFile')
      .then((m) => m.parseFile(file, file.name, { onProgress, cancelled: () => !running }))
      .then((r) => r && finish(r), () => finish({ ok: false, error: 'unreadable' }));
  };
  void warmIntake().then((w) => {
    if (!running) return;
    if (!w) return fallback();
    const off = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e: MessageEvent<FromWorker>) => {
      if (e.data.id !== id) return;
      if (e.data.type === 'progress') return onProgress(e.data.lines, e.data.total);
      off();
      finish(e.data.result);
    };
    const onError = () => {
      off();
      if (worker === w) worker = null;
      fallback();
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ type: 'parse', id, file });
  });
  return {
    result,
    /** Stops a running read (ending its worker); does nothing once the result is in. */
    cancel() {
      if (!running) return;
      running = false;
      settle(null);
      worker?.terminate();
      worker = null;
    },
  };
}
