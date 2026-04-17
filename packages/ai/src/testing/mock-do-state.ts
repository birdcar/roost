/**
 * In-memory implementations of the Durable Object state surface used by
 * `StatefulAgent` unit tests. These mirror the subset of `DurableObjectState`,
 * `DurableObjectStorage`, and `DurableObjectId` the agent actually calls so
 * tests do not need a real miniflare instance.
 *
 * The integration suite (`stateful-agent.miniflare.test.ts`) exercises the
 * same surface against real bindings.
 */

export interface MockDurableObjectId {
  toString(): string;
  equals(other: MockDurableObjectId): boolean;
  readonly name?: string;
}

export interface ListOptions {
  prefix?: string;
  limit?: number;
  start?: string;
  end?: string;
  reverse?: boolean;
}

export class MockDurableObjectStorage {
  private store = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined>;
  async get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
  async get<T = unknown>(keyOrKeys: string | string[]): Promise<T | undefined | Map<string, T>> {
    if (Array.isArray(keyOrKeys)) {
      const result = new Map<string, T>();
      for (const k of keyOrKeys) {
        if (this.store.has(k)) result.set(k, this.store.get(k) as T);
      }
      return result;
    }
    return this.store.get(keyOrKeys) as T | undefined;
  }

  async put<T = unknown>(key: string, value: T): Promise<void>;
  async put<T = unknown>(entries: Record<string, T>): Promise<void>;
  async put<T = unknown>(keyOrEntries: string | Record<string, T>, value?: T): Promise<void> {
    if (typeof keyOrEntries === 'string') {
      this.store.set(keyOrEntries, value);
      return;
    }
    for (const [k, v] of Object.entries(keyOrEntries)) this.store.set(k, v);
  }

  async delete(key: string): Promise<boolean>;
  async delete(keys: string[]): Promise<number>;
  async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
    if (Array.isArray(keyOrKeys)) {
      let count = 0;
      for (const k of keyOrKeys) if (this.store.delete(k)) count++;
      return count;
    }
    return this.store.delete(keyOrKeys);
  }

  async list<T = unknown>(options: ListOptions = {}): Promise<Map<string, T>> {
    const prefix = options.prefix ?? '';
    const start = options.start;
    const end = options.end;
    const reverse = options.reverse ?? false;
    const limit = options.limit ?? Infinity;

    const entries: Array<[string, T]> = [];
    for (const [k, v] of this.store.entries()) {
      if (!k.startsWith(prefix)) continue;
      if (start !== undefined && k < start) continue;
      if (end !== undefined && k >= end) continue;
      entries.push([k, v as T]);
    }
    entries.sort(([a], [b]) => (reverse ? (a < b ? 1 : a > b ? -1 : 0) : a < b ? -1 : a > b ? 1 : 0));
    return new Map(entries.slice(0, limit));
  }

  async deleteAll(): Promise<void> {
    this.store.clear();
  }

  /** Escape hatch for tests that want to inspect the raw map. */
  _rawEntries(): Array<[string, unknown]> {
    return Array.from(this.store.entries());
  }
}

export class MockDurableObjectState {
  readonly id: MockDurableObjectId;
  readonly storage: MockDurableObjectStorage;
  private _sockets: WeakRef<object>[] = [];
  private _socketTags = new WeakMap<object, string[]>();
  private _alarm: number | null = null;

  constructor(name = 'mock-do') {
    this.id = {
      name,
      toString: () => name,
      equals: (other) => other.toString() === name,
    };
    this.storage = new MockDurableObjectStorage();
  }

  async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  waitUntil(promise: Promise<unknown>): void {
    // In tests we let the runtime garbage-collect the promise; if it throws
    // we surface to console so tests see the failure.
    void promise.catch((err) => console.error('[MockDurableObjectState.waitUntil]', err));
  }

  acceptWebSocket(ws: object, tags: string[] = []): void {
    this._sockets.push(new WeakRef(ws));
    this._socketTags.set(ws, tags);
  }

  getWebSockets(): object[] {
    const live: object[] = [];
    for (const ref of this._sockets) {
      const socket = ref.deref();
      if (socket) live.push(socket);
    }
    return live;
  }

  getTags(ws: object): string[] {
    return this._socketTags.get(ws) ?? [];
  }

  async getAlarm(): Promise<number | null> {
    return this._alarm;
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this._alarm = typeof scheduledTime === 'number' ? scheduledTime : scheduledTime.getTime();
  }

  async deleteAlarm(): Promise<void> {
    this._alarm = null;
  }
}