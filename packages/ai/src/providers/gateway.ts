import type { AIProvider } from './interface.js';
import type { ProviderRequest, ProviderResponse, AgentMessage } from '../types.js';
import type { CloudflareAIProvider } from './cloudflare.js';

// GatewayAIProvider routes requests through Cloudflare AI Gateway REST endpoint.
// This adds ~10ms latency vs the direct binding path due to the extra HTTP hop,
// but enables caching, observability, and session affinity headers.
//
// Gateway URL format:
// https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/workers-ai/{model}

interface GatewayConfig {
  accountId: string;
  gatewayId: string;
}

interface WorkersAiGatewayResponse {
  result: {
    response?: string;
    tool_calls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>;
  };
  success: boolean;
  errors: Array<{ message: string }>;
}

export class GatewayAIProvider implements AIProvider {
  name = 'cloudflare-ai-gateway';

  constructor(
    private config: GatewayConfig,
    private fallback: CloudflareAIProvider,
  ) {}

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const url = `https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gatewayId}/workers-ai/${request.model}`;

    const body = {
      messages: request.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
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
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.hasConversationHistory(request.messages)) {
      headers['x-session-affinity'] = 'true';
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error(
          `[GatewayAIProvider] Gateway returned ${response.status} — falling back to direct provider`,
        );
        return this.fallback.chat(request);
      }

      const data = (await response.json()) as WorkersAiGatewayResponse;

      return {
        text: data.result.response ?? '',
        toolCalls: (data.result.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })),
      };
    } catch (err) {
      console.error('[GatewayAIProvider] Gateway unreachable — falling back to direct provider', err);
      return this.fallback.chat(request);
    }
  }

  private hasConversationHistory(messages: AgentMessage[]): boolean {
    // More than system + first user message means we have history worth routing
    return messages.filter((m) => m.role !== 'system').length > 1;
  }
}
