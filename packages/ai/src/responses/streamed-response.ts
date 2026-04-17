import type { StreamEvent, AgentMessage, ToolCall, Usage } from '../types.js';

/**
 * Collected streaming result passed to `.then()` hooks once the stream
 * terminates. The full implementation lands in Phase 3 (Streaming).
 */
export interface StreamedAgentResponse {
  text: string;
  events: StreamEvent[];
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  usage?: Usage;
}

/**
 * Placeholder for the full streaming response object shipped in Phase 3.
 * Kept as a type-only export in Phase 1 so downstream code can reference
 * the name without importing an empty implementation.
 */
export type StreamableAgentResponsePlaceholder = AsyncIterable<StreamEvent> & {
  usingVercelDataProtocol(): StreamableAgentResponsePlaceholder;
  then(fn: (r: StreamedAgentResponse) => void | Promise<void>): StreamableAgentResponsePlaceholder;
  toResponse(): Promise<Response>;
};
