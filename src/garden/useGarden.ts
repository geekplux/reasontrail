import { useCallback, useLayoutEffect, useReducer, useState } from 'react';
import { flushSync } from 'react-dom';
import { ProviderError, type LogprobProvider } from '../../shared/llm/types';
import { gardenReducer, initialGardenState, openPath } from './state';

/**
 * Garden state fed by a provider: opens the default branch and `ranks` once, then grows branches on activation.
 * `ranks` must be stable (read once from the URL). `opened` is null until the first answer is in.
 */
export function useGarden(provider: LogprobProvider, prompt: string, k: number, ranks: readonly number[]) {
  const [state, dispatch] = useReducer(gardenReducer, initialGardenState);
  const [opened, setOpened] = useState<{ complete: boolean } | null>(null);

  useLayoutEffect(() => {
    let live = true;
    void openPath(provider, prompt, k, ranks).then((r) => {
      // Recorded answers resolve in microtasks: committing synchronously means the first paint already shows the garden.
      if (live) flushSync(() => {
        dispatch({ type: 'openPath', ...r });
        setOpened({ complete: r.complete });
      });
    });
    return () => {
      live = false;
    };
  }, [provider, prompt, k, ranks]);

  /** Click (or Enter/Space in phase 5): select, then collapse, re-open from cache, or ask the provider once. */
  const activate = useCallback(
    (key: string) => {
      dispatch({ type: 'select', key });
      if (state.expanded.has(key) || Object.hasOwn(state.nodes, key)) return dispatch({ type: 'toggle', key });
      if (state.status[key]) return; // loading, or already known to be missing: no second request
      dispatch({ type: 'status', key, status: 'loading' });
      provider.nextTokens(prompt + key, k).then(
        (choices) => dispatch({ type: 'expand', key, choices }),
        (err: unknown) => {
          const missing = err instanceof ProviderError && err.code === 'not_recorded';
          dispatch({ type: 'status', key, status: missing ? 'not-recorded' : 'error' });
        },
      );
    },
    [state, provider, prompt, k],
  );

  /** Keyboard focus moved: the focused branch is the selection. */
  const select = useCallback((key: string) => dispatch({ type: 'select', key }), []);

  return { state, opened, activate, select };
}
