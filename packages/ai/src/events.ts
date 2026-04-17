import { Event } from '@roostjs/events';
import type { AgentPrompt } from './prompt.js';
import type { AgentResponse } from './responses/agent-response.js';
import type { ToolCall, ToolResult } from './types.js';
import type { Tool } from './tool.js';
import type { AIProvider } from './providers/interface.js';

/**
 * Dispatch helper that sidesteps the generic `EventClass<T>` constraint
 * (which requires `new (...args: unknown[]) => T`). Our event subclasses
 * have typed constructors, so calling `Event.dispatch.call(Class, instance)`
 * fails strict typecheck without a cast. This helper wraps that cast in one
 * place and preserves fake/restore/assertDispatched semantics because it
 * still calls the class's own `dispatch` static.
 */
export function dispatchEvent<E extends Event>(
  EventCtor: { dispatch(e: E): Promise<void> },
  instance: E,
): Promise<void> {
  return EventCtor.dispatch(instance);
}

/**
 * Dispatched immediately before the provider is called. Listeners can
 * inspect the prompt but cannot modify it (use middleware for that).
 */
export class PromptingAgent extends Event {
  constructor(
    public readonly agentName: string,
    public readonly prompt: AgentPrompt,
  ) {
    super();
  }
}

/** Dispatched after the provider returns a final response. */
export class AgentPrompted extends Event {
  constructor(
    public readonly agentName: string,
    public readonly prompt: AgentPrompt,
    public readonly response: AgentResponse,
  ) {
    super();
  }
}

/** Dispatched before a tool's `handle()` is invoked. */
export class InvokingTool extends Event {
  constructor(
    public readonly tool: Tool,
    public readonly call: ToolCall,
  ) {
    super();
  }
}

/** Dispatched after a tool returns a result. */
export class ToolInvoked extends Event {
  constructor(
    public readonly tool: Tool,
    public readonly call: ToolCall,
    public readonly result: ToolResult,
  ) {
    super();
  }
}

/** Dispatched when a provider in a failover chain fails and execution moves on. */
export class ProviderFailoverTriggered extends Event {
  constructor(
    public readonly failed: AIProvider,
    public readonly fallback: AIProvider,
    public readonly cause: unknown,
  ) {
    super();
  }
}

/** Dispatched when every provider in a failover chain has failed. */
export class AllProvidersFailed extends Event {
  constructor(public readonly causes: unknown[]) {
    super();
  }
}

/** Dispatched when the agent hit `maxSteps` without the model emitting a final answer. */
export class MaxStepsExhausted extends Event {
  constructor(
    public readonly agentName: string,
    public readonly steps: number,
  ) {
    super();
  }
}
