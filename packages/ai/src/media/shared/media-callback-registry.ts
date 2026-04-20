/**
 * Media-specific callback registry. Media responses carry raw bytes and
 * therefore cannot be funnelled through the existing
 * `CallbackRegistry.fulfill(id, AgentResponse)` path, which is typed for
 * textual agent output.
 *
 * The shape mirrors `InMemoryCallbackRegistry`: pending results buffer when a
 * job completes before callbacks register; onFulfilled/onRejected accept
 * listener functions keyed by an opaque `handleId`.
 */

export type MediaFulfillCallback<T> = (value: T) => void | Promise<void>;
export type MediaRejectCallback = (error: Error) => void | Promise<void>;

interface Entry<T> {
  onFulfilled: MediaFulfillCallback<T>[];
  onRejected: MediaRejectCallback[];
  pendingResult?: { kind: 'fulfilled'; value: T } | { kind: 'rejected'; error: Error };
}

export interface MediaCallbackRegistry<T> {
  onFulfilled(handleId: string, cb: MediaFulfillCallback<T>): void;
  onRejected(handleId: string, cb: MediaRejectCallback): void;
  fulfill(handleId: string, value: T): Promise<void>;
  reject(handleId: string, error: Error): Promise<void>;
}

export class InMemoryMediaCallbackRegistry<T> implements MediaCallbackRegistry<T> {
  private entries = new Map<string, Entry<T>>();

  private entry(handleId: string): Entry<T> {
    let e = this.entries.get(handleId);
    if (!e) {
      e = { onFulfilled: [], onRejected: [] };
      this.entries.set(handleId, e);
    }
    return e;
  }

  onFulfilled(handleId: string, cb: MediaFulfillCallback<T>): void {
    const e = this.entry(handleId);
    const pending = e.pendingResult;
    if (pending?.kind === 'fulfilled') {
      void cb(pending.value);
      this.entries.delete(handleId);
      return;
    }
    e.onFulfilled.push(cb);
  }

  onRejected(handleId: string, cb: MediaRejectCallback): void {
    const e = this.entry(handleId);
    const pending = e.pendingResult;
    if (pending?.kind === 'rejected') {
      void cb(pending.error);
      this.entries.delete(handleId);
      return;
    }
    e.onRejected.push(cb);
  }

  async fulfill(handleId: string, value: T): Promise<void> {
    const e = this.entry(handleId);
    if (e.onFulfilled.length === 0 && e.onRejected.length === 0) {
      e.pendingResult = { kind: 'fulfilled', value };
      return;
    }
    for (const cb of e.onFulfilled) await cb(value);
    this.entries.delete(handleId);
  }

  async reject(handleId: string, error: Error): Promise<void> {
    const e = this.entry(handleId);
    if (e.onFulfilled.length === 0 && e.onRejected.length === 0) {
      e.pendingResult = { kind: 'rejected', error };
      return;
    }
    for (const cb of e.onRejected) await cb(error);
    this.entries.delete(handleId);
  }

  /** @internal — test-only */
  _size(): number {
    return this.entries.size;
  }
}

export function generateHandleId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
