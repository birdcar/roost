import type { AIClient } from '@roostjs/cloudflare';
import type { AIProvider, ProviderCapabilities, EmbedRequest, EmbedResponse } from './interface.js';
import type { ProviderRequest, ProviderResponse, StreamEvent } from '../types.js';
import { Lab } from '../enums.js';
import { iterateSSELines } from '../streaming/sse-lines.js';

const CAPS: ProviderCapabilities = {
  name: Lab.WorkersAI,
  supported: new Set(['chat', 'stream', 'embed', 'tools']),
  cheapestChat: '@cf/meta/llama-3.2-3b-instruct',
  smartestChat: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  defaultEmbed: '@cf/baai/bge-base-en-v1.5',
};

export class WorkersAIProvider implements AIProvider {
  readonly name = Lab.WorkersAI;

  constructor(private client: AIClient) {}

  capabilities(): ProviderCapabilities {
    return CAPS;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const messages = request.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    const result = await this.client.run<string>(request.model, {
      messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      tools: request.tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    });

    return {
      text: typeof result === 'string' ? result : JSON.stringify(result),
      toolCalls: [],
    };
  }

  async *stream(request: ProviderRequest): AsyncIterable<StreamEvent> {
    const messages = request.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    const result = await this.client.run<ReadableStream<Uint8Array>>(request.model, {
      messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    } as unknown as Record<string, unknown>);

    if (!result || typeof (result as { getReader?: unknown }).getReader !== 'function') {
      yield { type: 'error', message: 'Workers AI stream returned a non-stream value' };
      yield { type: 'done' };
      return;
    }

    for await (const payload of iterateSSELines(result as ReadableStream<Uint8Array>)) {
      if (payload === '[DONE]') break;
      let chunk: WorkersAiStreamChunk;
      try { chunk = JSON.parse(payload) as WorkersAiStreamChunk; } catch { continue; }
      if (chunk.response) yield { type: 'text-delta', text: chunk.response };
      if (chunk.usage) {
        yield {
          type: 'usage',
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
    yield { type: 'done' };
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const model = request.model ?? CAPS.defaultEmbed ?? '@cf/baai/bge-base-en-v1.5';
    const result = await this.client.run<{ data: number[][] }>(model, { text: request.input });
    if (!result || !('data' in result) || !result.data) {
      throw new Error('Workers AI returned no embedding data');
    }
    return { data: result.data, model };
  }
}

interface WorkersAiStreamChunk {
  response?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * @deprecated Use `WorkersAIProvider`. Retained as an alias during v0.3 rollout.
 */
export { WorkersAIProvider as CloudflareAIProvider };
