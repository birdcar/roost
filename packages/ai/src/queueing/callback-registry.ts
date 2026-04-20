import type { AgentResponse } from '../responses/agent-response.js';
import type { PromptResult } from '../types.js';

export type PromptCallback = (result: PromptResult) => void | Promise<void>;
export type RejectCallback = (error: Error) => void | Promise<void>;

interface Entry {
  onFulfilled: PromptCallback[];
  onRejected: RejectCallback[];
  /** If the job completes before the caller registers a callback, the result is buffered here. */
  pendingResult?: { kind: 'fulfilled'; value: PromptResult } | { kind: 'rejected'; error: Error };
}

export interface CallbackRegistry {
  onFulfilled(promptId: string, cb: PromptCallback): void;
  onRejected(promptId: string, cb: RejectCallback): void;
  fulfill(promptId: string, result: AgentResponse): Promise<void>;
  reject(promptId: string, error: Error): Promise<void>;
}

/**
 * In-memory callback registry. Adequate when the producer and consumer run in
 * the same worker process. For cross-worker fulfillment a durable adapter
 * (KV-backed) will ship later; the interface is stable.
 */
export class InMemoryCallbackRegistry implements CallbackRegistry {
  private entries = new Map<string, Entry>();

  private entry(promptId: string): Entry {
    let e = this.entries.get(promptId);
    if (!e) {
      e = { onFulfilled: [], onRejected: [] };
      this.entries.set(promptId, e);
    }
    return e;
  }

  onFulfilled(promptId: string, cb: PromptCallback): void {
    const e = this.entry(promptId);
    const pending = e.pendingResult;
    if (pending?.kind === 'fulfilled') {
      void cb(pending.value);
      this.entries.delete(promptId);
      return;
    }
    e.onFulfilled.push(cb);
  }

  onRejected(promptId: string, cb: RejectCallback): void {
    const e = this.entry(promptId);
    const pending = e.pendingResult;
    if (pending?.kind === 'rejected') {
      void cb(pending.error);
      this.entries.delete(promptId);
      return;
    }
    e.onRejected.push(cb);
  }

  async fulfill(promptId: string, result: AgentResponse): Promise<void> {
    const e = this.entry(promptId);
    const promptResult: PromptResult = {
      queued: false,
      text: result.text,
      messages: result.messages,
      toolCalls: result.toolCalls,
      usage: result.usage,
      conversationId: result.conversationId,
    };
    if (e.onFulfilled.length === 0 && e.onRejected.length === 0) {
      e.pendingResult = { kind: 'fulfilled', value: promptResult };
      return;
    }
    for (const cb of e.onFulfilled) await cb(promptResult);
    this.entries.delete(promptId);
  }

  async reject(promptId: string, error: Error): Promise<void> {
    const e = this.entry(promptId);
    if (e.onFulfilled.length === 0 && e.onRejected.length === 0) {
      e.pendingResult = { kind: 'rejected', error };
      return;
    }
    for (const cb of e.onRejected) await cb(error);
    this.entries.delete(promptId);
  }

  /** @internal — test-only */
  _size(): number {
    return this.entries.size;
  }
}

let registry: CallbackRegistry = new InMemoryCallbackRegistry();

export function setCallbackRegistry(r: CallbackRegistry): void {
  registry = r;
}

export function getCallbackRegistry(): CallbackRegistry {
  return registry;
}

export function resetCallbackRegistry(): void {
  registry = new InMemoryCallbackRegistry();
}
