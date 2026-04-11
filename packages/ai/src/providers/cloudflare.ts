import type { AIClient } from '@roost/cloudflare';
import type { AIProvider } from './interface.js';
import type { ProviderRequest, ProviderResponse } from '../types.js';

export class CloudflareAIProvider implements AIProvider {
  name = 'cloudflare-ai';

  constructor(private client: AIClient) {}

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
}
