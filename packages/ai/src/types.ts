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

/**
 * Streaming protocol events emitted by `Agent.stream()` and `provider.stream()`.
 * Discriminated union — narrow on `type` to access payload fields.
 */
export type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; content: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done' };

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

/* ------------------------------ Phase 2: Sessions ----------------------------- */

/** Opaque identifier for a Sessions-backed conversation. */
export type ConversationId = string;

/** Role of a message within a session node. Matches `AgentMessage.role`. */
export type SessionNodeRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A single node in the Sessions tree. `parentId` is `null` for the root node
 * of a conversation; forks ("branches") reuse an existing node as the parent
 * of a new linear path.
 */
export interface SessionNode {
  id: string;
  parentId: string | null;
  role: SessionNodeRole;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

/**
 * Summary returned by `Sessions.list()`. Carries just enough to render a
 * conversation list without walking the full tree.
 */
export interface ConversationSummary {
  id: ConversationId;
  userId?: string;
  createdAt: number;
  messageCount: number;
  /** `content` of the most recent node, truncated to ~140 chars for preview. */
  preview?: string;
}

/**
 * Returned from `Sessions.branch()` — the id of the new branch conversation
 * and the node id within the parent conversation the branch forked from.
 */
export interface SessionBranch {
  conversationId: ConversationId;
  branchedFrom: string;
}

/** Compaction strategies supported by `Sessions.compact()`. */
export type CompactionStrategy =
  | { kind: 'summarize'; tokenBudget?: number }
  | { kind: 'drop-oldest'; keep?: number; tokenBudget?: number }
  | { kind: 'llm'; summarize: (nodes: SessionNode[]) => Promise<string> };
