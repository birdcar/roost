import type { AgentMessage, ToolCall, Usage } from '../types.js';

/**
 * The canonical agent response. Returned synchronously from `Agent.prompt()`.
 */
export interface AgentResponse {
  text: string;
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  usage?: Usage;
  /** Present when the agent implements `RemembersConversations` (Phase 2). */
  conversationId?: string;
}

export class StructuredOutputValidationError extends Error {
  override readonly name = 'StructuredOutputValidationError';
  constructor(
    message: string,
    public readonly received: unknown,
    public readonly issues: string[],
  ) {
    super(message);
  }
}

/**
 * Agent response carrying a parsed structured payload. Accessing `response.data`
 * returns the typed object; the `Proxy` wrapper also supports `response[key]`
 * for Laravel-style array-like access.
 */
export class StructuredAgentResponse<T extends Record<string, unknown> = Record<string, unknown>> implements AgentResponse {
  readonly text: string;
  readonly messages: AgentMessage[];
  readonly toolCalls: ToolCall[];
  readonly usage?: Usage;
  readonly conversationId?: string;
  readonly data: T;

  constructor(base: AgentResponse, data: T) {
    this.text = base.text;
    this.messages = base.messages;
    this.toolCalls = base.toolCalls;
    this.usage = base.usage;
    this.conversationId = base.conversationId;
    this.data = data;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && prop in data && !(prop in target)) {
          return data[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }
}
