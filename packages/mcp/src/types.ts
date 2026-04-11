export interface McpRequest {
  params: Record<string, unknown>;
  get<T>(key: string): T;
  all(): Record<string, unknown>;
  uri?(): string;
}

export interface McpResponseContent {
  type: 'text' | 'image' | 'audio' | 'error' | 'structured';
  text?: string;
  data?: string;
  mimeType?: string;
  structuredContent?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface McpPromptDefinition {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
}
