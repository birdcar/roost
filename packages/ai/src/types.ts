import type { JsonSchemaOutput } from '@roostjs/schema';
import type { Lab } from './enums.js';
import type { ModelResolver } from './capability-table.js';

// Transitional re-export: `AgentResponse` has moved to `./responses/agent-response.js`.
// This bridge preserves imports from `./types.js` during the Phase 1 rewrite.
// Remove after `agent.ts` and `index.ts` are migrated (C6 + C8).
export type { AgentResponse } from './responses/agent-response.js';

export interface AgentConfig {
  /**
   * A single provider or an ordered list for failover. When an array is given,
   * providers are tried in order; a provider failure (5xx, 429, network error)
   * routes to the next in the list.
   */
  provider?: Lab | Lab[] | string | string[];
  model?: string;
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  /** HTTP timeout (seconds). */
  timeout?: number;
  /** @deprecated Use `.queue()` on the agent instance instead. */
  queued?: boolean;
  /** Set by `@UseCheapestModel` / `@UseSmartestModel`. Resolved at prompt time. */
  modelResolver?: ModelResolver;
}

export type ProviderOptions = Record<string, unknown>;

export interface AgentPromptOptions extends Partial<AgentConfig> {
  attachments?: StorableFileLike[];
  /** Provider-specific options merged into the outgoing request body. */
  providerOptions?: ProviderOptions;
}

/**
 * Structural placeholder for attachment inputs. Concrete types ship in Phase 4
 * under `src/attachments/`. Kept minimal here to avoid a circular dep.
 */
export interface StorableFileLike {
  name(): string;
  mimeType(): string;
  bytes(): Promise<Uint8Array>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Retained from v0.2 for narrow back-compat in consumer code paths that
 * still distinguish queued vs immediate. New code should consume
 * `AgentResponse` directly and use `agent.queue()` for the async path.
 */
export type PromptResult =
  | { queued: false; text: string; messages: AgentMessage[]; toolCalls: ToolCall[]; usage?: Usage; conversationId?: string }
  | { queued: true; taskId: string };

export interface StreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'usage' | 'error' | 'done';
  text?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  usage?: Usage;
  message?: string;
  code?: string;
}

export interface ProviderRequest {
  model: string;
  messages: AgentMessage[];
  tools?: ProviderTool[];
  maxTokens?: number;
  temperature?: number;
  queueRequest?: boolean;
  /** Provider-specific options merged from `HasProviderOptions` contract. */
  providerOptions?: ProviderOptions;
  /** Structural attachments (images, documents) — encoding is provider-specific. */
  attachments?: StorableFileLike[];
}

export interface ProviderTool {
  name: string;
  description: string;
  parameters: JsonSchemaOutput;
}

export interface ProviderResponse {
  text: string;
  toolCalls: ToolCall[];
  usage?: Usage;
  taskId?: string;
}
