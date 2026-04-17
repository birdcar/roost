import type { AIProvider, ProviderCapabilities } from './interface.js';
import type { ProviderRequest, ProviderResponse, AgentMessage } from '../types.js';
import type { WorkersAIProvider } from './workers-ai.js';
import { Lab } from '../enums.js';

// GatewayAIProvider routes requests through Cloudflare AI Gateway REST endpoint.
// This adds ~10ms latency vs the direct binding path due to the extra HTTP hop,
// but enables caching, observability, session affinity, and provider fanout.
//
// URL formats:
//   Workers AI:   /v1/{accountId}/{gatewayId}/workers-ai/{model}
//   OpenAI:       /v1/{accountId}/{gatewayId}/openai/chat/completions
//   Anthropic:    /v1/{accountId}/{gatewayId}/anthropic/v1/messages
//   Gemini:       /v1/{accountId}/{gatewayId}/google-ai-studio/v1/...

interface GatewayConfig {
  accountId: string;
  gatewayId: string;
  /** Upstream provider routed through the gateway (defaults to Workers AI). */
  upstream?: 'workers-ai' | 'openai' | 'anthropic' | 'google-ai-studio';
  /** Auth token for the upstream provider (required for non-Workers-AI upstreams). */
  upstreamToken?: string;
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

const CAPS: ProviderCapabilities = {
  name: Lab.Gateway,
  supported: new Set(['chat', 'tools']),
};

export class GatewayAIProvider implements AIProvider {
  readonly name = Lab.Gateway;

  constructor(
    private config: GatewayConfig,
    private fallback: WorkersAIProvider,
  ) {}

  capabilities(): ProviderCapabilities {
    return CAPS;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const upstream = this.config.upstream ?? 'workers-ai';
    const url =
      upstream === 'workers-ai'
        ? `https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gatewayId}/workers-ai/${request.model}`
        : `https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gatewayId}/${upstream}/${this.upstreamPath(upstream)}`;

    const body =
      upstream === 'workers-ai' ? this.workersAiBody(request) : this.externalBody(request, upstream);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (upstream !== 'workers-ai') {
      if (!this.config.upstreamToken) {
        throw new Error(`Gateway upstream '${upstream}' requires upstreamToken`);
      }
      if (upstream === 'openai') headers.Authorization = `Bearer ${this.config.upstreamToken}`;
      if (upstream === 'anthropic') {
        headers['x-api-key'] = this.config.upstreamToken;
        headers['anthropic-version'] = '2023-06-01';
      }
    }
    if (this.hasConversationHistory(request.messages)) {
      headers['x-session-affinity'] = 'true';
    }

    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) {
        console.error(
          `[GatewayAIProvider] Gateway returned ${response.status} — falling back to direct provider`,
        );
        return this.fallback.chat(request);
      }
      return upstream === 'workers-ai'
        ? this.parseWorkersAi(await response.json())
        : this.parseExternal(await response.json(), upstream);
    } catch (err) {
      console.error('[GatewayAIProvider] Gateway unreachable — falling back to direct provider', err);
      return this.fallback.chat(request);
    }
  }

  private upstreamPath(upstream: 'openai' | 'anthropic' | 'google-ai-studio'): string {
    switch (upstream) {
      case 'openai':
        return 'chat/completions';
      case 'anthropic':
        return 'v1/messages';
      case 'google-ai-studio':
        return 'v1beta/models/generateContent';
    }
  }

  private workersAiBody(request: ProviderRequest): Record<string, unknown> {
    return {
      messages: request.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      tools: request.tools?.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    };
  }

  private externalBody(request: ProviderRequest, upstream: string): Record<string, unknown> {
    // Delegate to provider-specific body shaping by importing the same shape
    // helpers used by native providers. This keeps Gateway a thin proxy.
    // For Phase 1 we keep this minimal — external providers via Gateway only
    // forward the base chat shape; detailed feature parity lives in the
    // native provider classes.
    return {
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.providerOptions ?? {}),
    };
  }

  private parseWorkersAi(data: unknown): ProviderResponse {
    const typed = data as WorkersAiGatewayResponse;
    return {
      text: typed.result.response ?? '',
      toolCalls: (typed.result.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
    };
  }

  private parseExternal(data: unknown, upstream: string): ProviderResponse {
    // Minimal passthrough parsing for external upstreams — each upstream's
    // full response semantics live in its native provider class. Gateway
    // mode is best-effort for external providers in P1.
    if (upstream === 'openai') {
      const typed = data as { choices?: Array<{ message?: { content?: string } }> };
      return { text: typed.choices?.[0]?.message?.content ?? '', toolCalls: [] };
    }
    if (upstream === 'anthropic') {
      const typed = data as { content?: Array<{ type: string; text?: string }> };
      const text = (typed.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
      return { text, toolCalls: [] };
    }
    // google-ai-studio
    const typed = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (typed.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    return { text, toolCalls: [] };
  }

  private hasConversationHistory(messages: AgentMessage[]): boolean {
    return messages.filter((m) => m.role !== 'system').length > 1;
  }
}
