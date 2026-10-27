// The lens's provider: a sentence's recording answers first and never touches the network; live growth
// through the Worker happens only once `live` is switched on (the reader's opt-in), stops LIVE_MAX_DEPTH tokens past the
// opening words, and goes through the tab's one cached provider, so a repeated prefix costs nothing.
import { ProviderError, type LogprobProvider, type TokenChoice } from '../../shared/llm/types';
import { LIVE_K, LIVE_MAX_DEPTH, liveProvider, type CachedProvider } from '../llm/cachedProvider';
import { RecordedProvider } from '../llm/recordedProvider';
import type { SampleGarden } from '../samples/types';

export interface LensHooks {
  /** The reader's opt-in to live growth, read at each call (or call `goLive()`). */
  isLive?(): boolean;
  /** A live call settled: `err` when it failed (the lens shows `providerMessage(err.code)`), null when it answered or
   * was stopped. The calls-left count may have changed. */
  onSettled?(err: ProviderError | null): void;
}

export class LensProvider implements LogprobProvider {
  readonly #prompt: string;
  readonly #garden: SampleGarden | null;
  readonly #recorded: RecordedProvider | null;
  readonly #hooks: LensHooks;
  readonly #source: () => CachedProvider;
  /** Tokens past the prompt, by full prefix, learnt from every answer (the prompt itself is 0). */
  readonly #depth = new Map<string, number>();
  #live = false;

  constructor(prompt: string, garden: SampleGarden | null, hooks: LensHooks = {}, source: () => CachedProvider = liveProvider) {
    this.#prompt = prompt;
    this.#garden = garden;
    this.#recorded = garden ? new RecordedProvider(garden) : null;
    this.#hooks = hooks;
    this.#source = source;
  }

  /** Whether live growth is switched on. */
  get live(): boolean {
    return this.#live || (this.#hooks.isLive?.() ?? false);
  }

  /** The reader opted in: from now on, what the recording lacks grows live. */
  goLive(): void {
    this.#live = true;
  }

  get kind(): LogprobProvider['kind'] {
    return this.live ? 'worker' : 'recorded';
  }

  get model(): string {
    return this.live || !this.#recorded ? this.#source().model : this.#recorded.model;
  }

  /** Live calls this tab can still make. */
  get callsLeft(): number {
    return this.#source().callsLeft;
  }

  /** Whether a branch `depth` tokens past the prompt can still be grown live. */
  static canGrowLive(depth: number): boolean {
    return depth < LIVE_MAX_DEPTH;
  }

  async nextTokens(prefix: string, k: number, opts?: { signal?: AbortSignal }): Promise<TokenChoice[]> {
    const key = prefix.startsWith(this.#prompt) ? prefix.slice(this.#prompt.length) : null;
    let out: TokenChoice[];
    if (this.#recorded && key !== null && Object.hasOwn(this.#garden!.nodes, key)) out = await this.#recorded.nextTokens(prefix, k, opts);
    else if (!this.live || key === null) throw new ProviderError('not_recorded', 'This branch is not in the recording.');
    else if (!LensProvider.canGrowLive(this.#depth.get(prefix) ?? 0)) throw new ProviderError('not_recorded', 'The lens grows no deeper here.');
    else {
      try {
        out = (await this.#source().nextTokens(prefix, LIVE_K, opts)).slice(0, Math.max(1, k));
      } catch (err) {
        this.#hooks.onSettled?.(err instanceof ProviderError && err.code !== 'aborted' ? err : null);
        throw err;
      }
      this.#hooks.onSettled?.(null);
    }
    const depth = (this.#depth.get(prefix) ?? 0) + 1;
    for (const c of out) this.#depth.set(prefix + c.token, depth);
    return out;
  }
}
