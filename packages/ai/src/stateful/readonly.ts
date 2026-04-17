import type { StatefulAgent } from './agent.js';

/**
 * A read-only view of a `StatefulAgent`'s persisted state. Returned by
 * `createReadonlyConnection(agent)`. Consumers (dashboards, observer clients)
 * can inspect state and subscribe to changes; any attempted mutation is
 * prevented both at the type level (`readonly`) and at runtime (`Object.freeze`).
 */
export interface ReadonlyConnection {
  /** Return a deeply-frozen snapshot of the agent's persisted state. */
  state(): Promise<Readonly<Record<string, unknown>>>;
  /**
   * Subscribe to changes of a single persisted key. Returns an unsubscribe
   * function. The implementation is a no-op until Phase 3 wires the WebSocket
   * delivery path; present here so callers can code against the final shape.
   */
  subscribe(key: string, fn: (value: unknown) => void): () => void;
}

type SubscriberMap = Map<string, Set<(value: unknown) => void>>;

const subscribers = new WeakMap<object, SubscriberMap>();

export function createReadonlyConnection(agent: StatefulAgent): ReadonlyConnection {
  return {
    async state() {
      const entries = await agent._ctx.storage.list();
      const record: Record<string, unknown> = {};
      for (const [key, value] of entries) record[key] = value;
      return deepFreeze(record);
    },
    subscribe(key, fn) {
      const map = subscribers.get(agent) ?? new Map<string, Set<(value: unknown) => void>>();
      subscribers.set(agent, map);
      const set = map.get(key) ?? new Set();
      map.set(key, set);
      set.add(fn);
      return () => {
        set.delete(fn);
        if (set.size === 0) map.delete(key);
      };
    },
  };
}

/**
 * Internal: called by `StatefulAgent` when a persisted key changes so
 * existing subscribers observe the new value. Not part of the public API.
 */
export function _notifyReadonlySubscribers(agent: StatefulAgent, key: string, value: unknown): void {
  const map = subscribers.get(agent);
  const set = map?.get(key);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(value);
    } catch (err) {
      console.error('[@roostjs/ai] readonly subscriber threw:', err);
    }
  }
}

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return Object.freeze(obj);
}