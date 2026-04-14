import type { JsonSchemaOutput } from '@roost/schema';

export interface AgentConfig {
  provider?: string;
  model?: string;
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  queued?: boolean;
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

export interface AgentResponse {
  text: string;
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
}

export type PromptResult =
  | { queued: false; text: string; messages: AgentMessage[]; toolCalls: ToolCall[]; usage?: { promptTokens: number; completionTokens: number } }
  | { queued: true; taskId: string };

export interface StreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done';
  text?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

export interface ProviderRequest {
  model: string;
  messages: AgentMessage[];
  tools?: ProviderTool[];
  maxTokens?: number;
  temperature?: number;
  queueRequest?: boolean;
}

export interface ProviderTool {
  name: string;
  description: string;
  parameters: JsonSchemaOutput;
}

export interface ProviderResponse {
  text: string;
  toolCalls: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
  taskId?: string;
}
