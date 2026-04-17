import type { AIProvider, ProviderCapabilities, EmbedRequest, EmbedResponse } from './interface.js';
import type { ProviderRequest, ProviderResponse, AgentMessage, ToolCall, StreamEvent } from '../types.js';
import { Lab } from '../enums.js';
import { iterateSSELines } from '../streaming/sse-lines.js';

const CAPS: ProviderCapabilities = {
  name: Lab.OpenAI,
  supported: new Set(['chat', 'stream', 'embed', 'tools', 'structured-output']),
  cheapestChat: 'gpt-4o-mini',
  smartestChat: 'gpt-4o',
  defaultEmbed: 'text-embedding-3-small',
};

interface OpenAIChoice {
  message: {
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason?: string;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

export class OpenAIProvider implements AIProvider {
  readonly name = Lab.OpenAI;

  constructor(private config: OpenAIProviderConfig) {}

  capabilities(): ProviderCapabilities {
    return CAPS;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const url = `${this.config.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(toOpenAIMessage),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
      ...(request.providerOptions ?? {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices[0];
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeParse(tc.function.arguments),
    }));

    return {
      text: choice.message.content ?? '',
      toolCalls,
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
        : undefined,
    };
  }

  async *stream(request: ProviderRequest): AsyncIterable<StreamEvent> {
    const url = `${this.config.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(toOpenAIMessage),
      stream: true,
      stream_options: { include_usage: true },
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
      ...(request.providerOptions ?? {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const text = response.body ? await response.text() : '';
      yield { type: 'error', message: `OpenAI ${response.status}: ${text}` };
      yield { type: 'done' };
      return;
    }

    // OpenAI streams tool-call arguments incrementally under `.delta.tool_calls[i]`.
    const toolCalls = new Map<number, { id?: string; name?: string; args: string }>();

    for await (const payload of iterateSSELines(response.body)) {
      if (payload === '[DONE]') break;
      let chunk: OpenAIStreamChunk;
      try { chunk = JSON.parse(payload) as OpenAIStreamChunk; } catch { continue; }

      if (chunk.usage) {
        yield { type: 'usage', promptTokens: chunk.usage.prompt_tokens ?? 0, completionTokens: chunk.usage.completion_tokens ?? 0 };
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) yield { type: 'text-delta', text: delta.content };
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const slot = toolCalls.get(tc.index) ?? { args: '' };
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name = tc.function.name;
          if (tc.function?.arguments) slot.args += tc.function.arguments;
          toolCalls.set(tc.index, slot);
        }
      }

      if (chunk.choices?.[0]?.finish_reason === 'tool_calls') {
        for (const slot of toolCalls.values()) {
          if (!slot.id || !slot.name) continue;
          yield { type: 'tool-call', id: slot.id, name: slot.name, arguments: safeParse(slot.args) };
        }
        toolCalls.clear();
      }
    }
    yield { type: 'done' };
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const model = request.model ?? CAPS.defaultEmbed ?? 'text-embedding-3-small';
    const url = `${this.config.baseUrl ?? 'https://api.openai.com'}/v1/embeddings`;
    const body: Record<string, unknown> = {
      model,
      input: request.input,
      ...(request.dimensions ? { dimensions: request.dimensions } : {}),
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`OpenAI embed ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return { data: data.data.map((d) => d.embedding), model };
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.config.organization) headers['OpenAI-Organization'] = this.config.organization;
    return headers;
  }
}

function toOpenAIMessage(m: AgentMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
  }
  return { role: m.role, content: m.content };
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
