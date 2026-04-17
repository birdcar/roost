import type { AIProvider, ProviderCapabilities } from './interface.js';
import type { ProviderRequest, ProviderResponse, AgentMessage, ToolCall, StreamEvent } from '../types.js';
import { Lab } from '../enums.js';
import { iterateSSELines } from '../streaming/sse-lines.js';

const CAPS: ProviderCapabilities = {
  name: Lab.Gemini,
  supported: new Set(['chat', 'stream', 'tools', 'structured-output']),
  cheapestChat: 'gemini-2.0-flash',
  smartestChat: 'gemini-2.5-pro',
};

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<
        | { text: string }
        | { functionCall: { name: string; args: Record<string, unknown> } }
      >;
    };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
}

export interface GeminiProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export class GeminiProvider implements AIProvider {
  readonly name = Lab.Gemini;

  constructor(private config: GeminiProviderConfig) {}

  capabilities(): ProviderCapabilities {
    return CAPS;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const base = this.config.baseUrl ?? 'https://generativelanguage.googleapis.com';
    const url = `${base}/v1beta/models/${request.model}:generateContent?key=${this.config.apiKey}`;
    const system = request.messages.find((m) => m.role === 'system')?.content;

    const body: Record<string, unknown> = {
      contents: request.messages.filter((m) => m.role !== 'system').map(toGeminiContent),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: [
              {
                functionDeclarations: request.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                })),
              },
            ],
          }
        : {}),
      generationConfig: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
      },
      ...(request.providerOptions ?? {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as GeminiResponse;
    const parts = data.candidates[0]?.content.parts ?? [];
    const text = parts
      .filter((p): p is { text: string } => 'text' in p)
      .map((p) => p.text)
      .join('');
    const toolCalls: ToolCall[] = parts
      .filter((p): p is { functionCall: { name: string; args: Record<string, unknown> } } => 'functionCall' in p)
      .map((p, i) => ({
        id: `call_${i}_${p.functionCall.name}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args,
      }));

    return {
      text,
      toolCalls,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
          }
        : undefined,
    };
  }

  async *stream(request: ProviderRequest): AsyncIterable<StreamEvent> {
    const base = this.config.baseUrl ?? 'https://generativelanguage.googleapis.com';
    const url = `${base}/v1beta/models/${request.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;
    const system = request.messages.find((m) => m.role === 'system')?.content;
    const body: Record<string, unknown> = {
      contents: request.messages.filter((m) => m.role !== 'system').map(toGeminiContent),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: [
              {
                functionDeclarations: request.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                })),
              },
            ],
          }
        : {}),
      generationConfig: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
      },
      ...(request.providerOptions ?? {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      const text = response.body ? await response.text() : '';
      yield { type: 'error', message: `Gemini ${response.status}: ${text}` };
      yield { type: 'done' };
      return;
    }

    let toolIndex = 0;
    let lastUsage: { promptTokens: number; completionTokens: number } | undefined;

    for await (const payload of iterateSSELines(response.body)) {
      let chunk: GeminiResponse;
      try { chunk = JSON.parse(payload) as GeminiResponse; } catch { continue; }
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if ('text' in part && part.text) {
          yield { type: 'text-delta', text: part.text };
        } else if ('functionCall' in part) {
          yield {
            type: 'tool-call',
            id: `call_${toolIndex++}_${part.functionCall.name}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args,
          };
        }
      }
      if (chunk.usageMetadata) {
        lastUsage = {
          promptTokens: chunk.usageMetadata.promptTokenCount,
          completionTokens: chunk.usageMetadata.candidatesTokenCount,
        };
      }
    }
    if (lastUsage) yield { type: 'usage', ...lastUsage };
    yield { type: 'done' };
  }
}

function toGeminiContent(m: AgentMessage): Record<string, unknown> {
  const role = m.role === 'assistant' ? 'model' : m.role === 'tool' ? 'function' : 'user';
  if (m.role === 'tool') {
    return {
      role: 'function',
      parts: [{ functionResponse: { name: m.toolName ?? 'tool', response: { result: m.content } } }],
    };
  }
  return { role, parts: [{ text: m.content }] };
}
