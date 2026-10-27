// The website's opt-in AI pass: a small state machine around `sendBatches`.
//   idle → consent-needed → sending (k of n) → ready | unavailable | error
// Nothing is sent until `consent()`; then exactly ⌈steps / 200⌉ ≤ 5 POSTs, one after another, abortable.
// The overlay is kept apart from the graph, so dropping it restores the deterministic map.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ProviderError, type ProviderErrorCode } from '../../shared/llm/types';
import { buildBatches, type StructureRequest } from '../../shared/session/structure';
import { sendBatches, STRUCTURE_ENDPOINT, structureMessage, summarize, type StructureSummary } from '../../shared/structureClient';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';

export type StructureState =
  | { status: 'idle' }
  | { status: 'consent-needed'; summary: StructureSummary }
  | { status: 'sending'; done: number; total: number }
  | { status: 'ready'; overlay: LabelOverlay }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; code: ProviderErrorCode; message: string; retryAfterSec?: number };

export interface StructureOptions {
  endpoint?: string;
  fetch?: typeof fetch;
}

export interface StructureController {
  getState(): StructureState;
  subscribe(listener: () => void): () => void;
  /** What would be sent; computed locally, sends nothing. */
  summary(): StructureSummary;
  /** Opens consent (idle, error or unavailable → consent-needed). Sends nothing. */
  request(): void;
  /** The only call that sends: consent-needed → sending → ready | unavailable | error. */
  consent(): Promise<void>;
  /** Closes the dialog or aborts sending; back to idle, no partial overlay. */
  cancel(): void;
  /** Drops the overlay (ready → idle). */
  clear(): void;
  /** Aborts anything in flight (on unmount or a new graph). */
  dispose(): void;
}

export function createStructureController(graph: SessionGraph, opts: StructureOptions = {}): StructureController {
  const endpoint = opts.endpoint ?? STRUCTURE_ENDPOINT;
  let batches: StructureRequest[] | undefined;
  const getBatches = () => (batches ??= buildBatches(graph));
  let state: StructureState = { status: 'idle' };
  let inflight: AbortController | undefined;
  const listeners = new Set<() => void>();
  const set = (next: StructureState) => {
    state = next;
    for (const l of listeners) l();
  };
  const cancel = () => {
    if (state.status !== 'consent-needed' && state.status !== 'sending') return;
    inflight?.abort();
    inflight = undefined;
    set({ status: 'idle' });
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    summary: () => summarize(getBatches(), endpoint),
    request() {
      if (state.status === 'sending' || state.status === 'ready') return;
      set({ status: 'consent-needed', summary: summarize(getBatches(), endpoint) });
    },
    async consent() {
      if (state.status !== 'consent-needed') return;
      const ctrl = (inflight = new AbortController());
      const all = getBatches();
      set({ status: 'sending', done: 0, total: all.length });
      try {
        const overlay = await sendBatches(endpoint, all, {
          ...(opts.fetch ? { fetch: opts.fetch } : {}),
          signal: ctrl.signal,
          onProgress: (k, n) => k > 1 && !ctrl.signal.aborted && set({ status: 'sending', done: k - 1, total: n }),
        });
        if (!ctrl.signal.aborted) set({ status: 'ready', overlay });
      } catch (e) {
        if (ctrl.signal.aborted) return; // cancel() already went back to idle
        const err = e instanceof ProviderError ? e : new ProviderError('upstream_error', String(e));
        const message = structureMessage(err.code, err.retryAfterSec);
        if (err.code === 'unavailable') set({ status: 'unavailable', message });
        else set({ status: 'error', code: err.code, message, ...(err.retryAfterSec === undefined ? {} : { retryAfterSec: err.retryAfterSec }) });
      } finally {
        if (inflight === ctrl) inflight = undefined;
      }
    },
    cancel,
    clear() {
      if (state.status === 'ready') set({ status: 'idle' });
    },
    dispose: () => state.status === 'sending' && cancel(),
  };
}

/** The controller for `graph`; a new graph (or endpoint) gets a fresh one and aborts the old one's requests. */
export function useStructure(graph: SessionGraph, opts: StructureOptions = {}): StructureController & { state: StructureState } {
  const { endpoint, fetch } = opts;
  const ctrl = useMemo(
    () => createStructureController(graph, { ...(endpoint ? { endpoint } : {}), ...(fetch ? { fetch } : {}) }),
    [graph, endpoint, fetch],
  );
  useEffect(() => () => ctrl.dispose(), [ctrl]);
  const state = useSyncExternalStore(ctrl.subscribe, ctrl.getState, ctrl.getState);
  return { ...ctrl, state };
}
