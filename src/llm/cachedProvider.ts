// Lean live growth (old F9 rules, PLAN Z1): a prefix is fetched at most once per tab, concurrent requests for it
// share one call, smaller k is served by slicing, and a tab makes at most LIVE_MAX_CALLS live calls.
import { clampK, ProviderError, type LogprobProvider, type TokenChoice } from '../../shared/llm/types';
import { WorkerProvider } from './workerProvider';

/** Branches asked for per live fork. */
export const LIVE_K = 5;
/** Deepest live fork, in tokens beyond the lens prompt; callers stop growing there and show "depth limit". */
export const LIVE_MAX_DEPTH = 12;
/** Live calls per tab session; the next one rejects with `session_limit`. */
export const LIVE_MAX_CALLS = 150;

interface InFlight {
  k: number;
  promise: Promise<TokenChoice[]>;
  controller: AbortController;
  waiters: number;
}

/** Wraps any provider with an in-memory prefix cache, in-flight dedupe and a call cap. */
export class CachedProvider implements LogprobProvider {
  readonly #inner: LogprobProvider;
  readonly #maxCalls: number;
  readonly #cache = new Map<string, { k: number; tokens: TokenChoice[] }>();
  readonly #inFlight = new Map<string, InFlight>();
  #calls = 0;

  constructor(inner: LogprobProvider, opts: { maxCalls?: number } = {}) {
    this.#inner = inner;
    this.#maxCalls = opts.maxCalls ?? LIVE_MAX_CALLS;
  }

  get kind(): LogprobProvider['kind'] {
    return this.#inner.kind;
  }

  get model(): string {
    return this.#inner.model;
  }

  /** Calls made to the inner provider so far (cache hits and shared requests are free). */
  get calls(): number {
    return this.#calls;
  }

  /** Calls left before `session_limit`. */
  get callsLeft(): number {
    return Math.max(0, this.#maxCalls - this.#calls);
  }

  /** True when `nextTokens(prefix, k)` would be answered without a call. */
  has(prefix: string, k: number): boolean {
    return this.#lookup(prefix, clampK(k)) !== undefined;
  }

  async nextTokens(prefix: string, k: number, opts?: { signal?: AbortSignal }): Promise<TokenChoice[]> {
    const n = clampK(k);
    if (opts?.signal?.aborted) throw new ProviderError('aborted', 'Stopped.');
    const hit = this.#lookup(prefix, n);
    if (hit) return hit;
    let flight = this.#inFlight.get(prefix);
    if (!flight || flight.k < n) {
      if (this.#calls >= this.#maxCalls) throw new ProviderError('session_limit', `This tab has made its ${this.#maxCalls} live calls.`);
      this.#calls++;
      flight = this.#start(prefix, n);
    }
    return this.#wait(prefix, flight, n, opts?.signal);
  }

  #lookup(prefix: string, n: number): TokenChoice[] | undefined {
    const entry = this.#cache.get(prefix);
    // A list shorter than the k it was fetched with is the whole distribution, so it answers any k.
    return entry && (entry.k >= n || entry.tokens.length < entry.k) ? entry.tokens.slice(0, n) : undefined;
  }

  #start(prefix: string, n: number): InFlight {
    const controller = new AbortController();
    const flight: InFlight = { k: n, controller, waiters: 0, promise: Promise.resolve([]) };
    flight.promise = this.#inner.nextTokens(prefix, n, { signal: controller.signal }).then(
      (tokens) => {
        const prev = this.#cache.get(prefix);
        if (!prev || prev.k < n) this.#cache.set(prefix, { k: n, tokens });
        this.#settle(prefix, flight);
        return tokens;
      },
      (err: unknown) => {
        this.#settle(prefix, flight);
        throw err instanceof ProviderError ? err : new ProviderError('upstream_error', 'The model call failed.');
      },
    );
    flight.promise.catch(() => {}); // a call every waiter abandoned has no listener left
    this.#inFlight.set(prefix, flight);
    return flight;
  }

  #settle(prefix: string, flight: InFlight): void {
    if (this.#inFlight.get(prefix) === flight) this.#inFlight.delete(prefix);
  }

  /** Waits for a shared call; one waiter aborting leaves it running for the others, the last one cancels it. */
  #wait(prefix: string, flight: InFlight, n: number, signal: AbortSignal | undefined): Promise<TokenChoice[]> {
    flight.waiters++;
    return new Promise((resolve, reject) => {
      let finished = false;
      /** Detaches this waiter once; false if it already left. */
      const leave = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener('abort', onAbort);
        flight.waiters--;
        return true;
      };
      const onAbort = () => {
        if (!leave()) return;
        if (flight.waiters === 0) {
          this.#settle(prefix, flight);
          flight.controller.abort();
        }
        reject(new ProviderError('aborted', 'Stopped.'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      flight.promise.then(
        (tokens) => {
          if (leave()) resolve(tokens.slice(0, n));
        },
        (err: unknown) => {
          if (leave()) reject(err);
        },
      );
    });
  }
}

let live: CachedProvider | undefined;

/** The tab's one live provider: the Worker behind the cache and the call cap. Created on first use. */
export function liveProvider(): CachedProvider {
  live ??= new CachedProvider(new WorkerProvider());
  return live;
}
