import type { AgentPromptOptions, PromptResult } from '../types.js';
import type { PromptCallback, RejectCallback } from './callback-registry.js';
import { getCallbackRegistry } from './callback-registry.js';

/**
 * Handle returned by `agent.queue(input)` — carries the prompt id plus
 * builder-style `.then()` / `.catch()` registration. Not a `Promise` — do not
 * `await` it. Use callbacks or inspect `promptId` to poll externally.
 */
export class QueuedPromptHandle {
  constructor(public readonly promptId: string) {}

  then(cb: PromptCallback): this {
    getCallbackRegistry().onFulfilled(this.promptId, cb);
    return this;
  }

  catch(cb: RejectCallback): this {
    getCallbackRegistry().onRejected(this.promptId, cb);
    return this;
  }
}

/** @internal — generate a prompt id. Exposed for tests. */
export function generatePromptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ai_prompt_${crypto.randomUUID()}`;
  }
  return `ai_prompt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface QueueOptions extends AgentPromptOptions {
  /** When provided, the caller can correlate queued prompts with other state. */
  promptId?: string;
  /** Args passed to the agent constructor when re-materialized. */
  agentArgs?: unknown[];
  /** Explicit class-name alias registered with AgentRegistry; defaults to the agent's constructor name. */
  agentClass?: string;
}
