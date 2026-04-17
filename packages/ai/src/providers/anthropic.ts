import type { AIProvider, ProviderCapabilities } from './interface.js';
import type { ProviderRequest, ProviderResponse, AgentMessage, ToolCall } from '../types.js';
import { Lab } from '../enums.js';

const CAPS: ProviderCapabilities = {
  name: Lab.Anthropic,
  supported: new Set(['chat', 'stream', 'tools', 'structured-output', 'thinking']),
  cheapestChat: 'claude-haiku-4-5-20251001',
  smartestChat: 'claude-opus-4-7',
};

interface AnthropicToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

type AnthropicContentBlock = AnthropicToolUse | AnthropicTextBlock;

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
}

export interface AnthropicProviderConfig {
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
}

export class AnthropicProvider implements AIProvider {
  readonly name = Lab.Anthropic;

  constructor(private config: AnthropicProviderConfig) {}

  capabilities(): ProviderCapabilities {
    return CAPS;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const url = `${this.config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`;
    const system = request.messages.find((m) => m.role === 'system')?.content;
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: request.messages.filter((m) => m.role !== 'system').map(toAnthropicMessage),
      ...(system ? { system } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
      ...(request.providerOptions ?? {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.apiVersion ?? '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic ${response.status}: ${text}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = data.content
      .filter((b): b is AnthropicTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const toolCalls: ToolCall[] = data.content
      .filter((b): b is AnthropicToolUse => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, arguments: b.input }));

    return {
      text,
      toolCalls,
      usage: data.usage
        ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens }
        : undefined,
    };
  }
}

function toAnthropicMessage(m: AgentMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: m.toolCallId,
          content: m.content,
        },
      ],
    };
  }
  return { role: m.role, content: m.content };
}
