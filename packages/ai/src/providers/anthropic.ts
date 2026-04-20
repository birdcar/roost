import type { AIProvider, ProviderCapabilities } from './interface.js';
import type { ProviderRequest, ProviderResponse, AgentMessage, ToolCall, StreamEvent } from '../types.js';
import { Lab } from '../enums.js';
import { iterateSSELines } from '../streaming/sse-lines.js';
import { encodeAll, type EncodedAttachment } from './attachment-encoding.js';

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
    const encodedAttachments = await encodeAll(request.attachments);
    const messages = buildAnthropicMessages(
      request.messages.filter((m) => m.role !== 'system'),
      encodedAttachments,
    );
    const tools = buildAnthropicTools(request);
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
      ...(system ? { system } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(tools ? { tools } : {}),
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

  async *stream(request: ProviderRequest): AsyncIterable<StreamEvent> {
    const url = `${this.config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`;
    const system = request.messages.find((m) => m.role === 'system')?.content;
    const encodedAttachments = await encodeAll(request.attachments);
    const messages = buildAnthropicMessages(
      request.messages.filter((m) => m.role !== 'system'),
      encodedAttachments,
    );
    const tools = buildAnthropicTools(request);
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      messages,
      ...(system ? { system } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(tools ? { tools } : {}),
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

    if (!response.ok || !response.body) {
      const text = response.body ? await response.text() : '';
      yield { type: 'error', message: `Anthropic ${response.status}: ${text}` };
      yield { type: 'done' };
      return;
    }

    // Block-indexed accumulation of `input_json_delta` tool-call arguments.
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    for await (const line of iterateSSELines(response.body)) {
      let event: AnthropicStreamEvent;
      try { event = JSON.parse(line) as AnthropicStreamEvent; } catch { continue; }

      switch (event.type) {
        case 'message_start':
          if (event.message?.usage) inputTokens = event.message.usage.input_tokens;
          break;
        case 'content_block_start':
          if (event.content_block?.type === 'tool_use' && event.index !== undefined) {
            toolBlocks.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: '' });
          }
          break;
        case 'content_block_delta': {
          const delta = event.delta;
          if (!delta) break;
          if (delta.type === 'text_delta' && delta.text) {
            yield { type: 'text-delta', text: delta.text };
          } else if (delta.type === 'input_json_delta' && event.index !== undefined) {
            const block = toolBlocks.get(event.index);
            if (block && delta.partial_json) block.json += delta.partial_json;
          }
          break;
        }
        case 'content_block_stop':
          if (event.index !== undefined && toolBlocks.has(event.index)) {
            const block = toolBlocks.get(event.index)!;
            let args: Record<string, unknown> = {};
            try { args = block.json ? (JSON.parse(block.json) as Record<string, unknown>) : {}; } catch { /* drop malformed */ }
            yield { type: 'tool-call', id: block.id, name: block.name, arguments: args };
            toolBlocks.delete(event.index);
          }
          break;
        case 'message_delta':
          if (event.usage?.output_tokens !== undefined) outputTokens = event.usage.output_tokens;
          break;
        case 'message_stop':
          if (inputTokens !== undefined || outputTokens !== undefined) {
            yield { type: 'usage', promptTokens: inputTokens ?? 0, completionTokens: outputTokens ?? 0 };
          }
          yield { type: 'done' };
          return;
        default:
          break;
      }
    }
    yield { type: 'done' };
  }
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  message?: { usage?: { input_tokens: number } };
  content_block?: { type: string; id: string; name: string };
  delta?: { type: string; text?: string; partial_json?: string };
  usage?: { output_tokens?: number };
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

function buildAnthropicMessages(
  messages: AgentMessage[],
  attachments: EncodedAttachment[],
): Array<Record<string, unknown>> {
  const encoded = messages.map(toAnthropicMessage);
  if (attachments.length === 0) return encoded;

  for (let i = encoded.length - 1; i >= 0; i--) {
    const msg = encoded[i]!;
    if (msg.role !== 'user') continue;
    const existing = Array.isArray(msg.content)
      ? (msg.content as Array<Record<string, unknown>>)
      : [{ type: 'text', text: String(msg.content ?? '') }];
    const attachmentBlocks = attachments.map(toAnthropicAttachmentBlock);
    encoded[i] = { ...msg, content: [...attachmentBlocks, ...existing] };
    return encoded;
  }

  encoded.push({ role: 'user', content: attachments.map(toAnthropicAttachmentBlock) });
  return encoded;
}

function toAnthropicAttachmentBlock(att: EncodedAttachment): Record<string, unknown> {
  const blockType = att.isImage ? 'image' : 'document';
  if (att.source === 'url' && att.url) {
    return { type: blockType, source: { type: 'url', url: att.url } };
  }
  if (att.source === 'id' && att.providerFileId) {
    return { type: blockType, source: { type: 'file', file_id: att.providerFileId } };
  }
  return {
    type: blockType,
    source: { type: 'base64', media_type: att.mimeType, data: att.base64 ?? '' },
  };
}

function buildAnthropicTools(request: ProviderRequest): Array<Record<string, unknown>> | undefined {
  const userTools = request.tools?.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  })) ?? [];
  const providerTools = (request.providerTools ?? []).map((pt) => pt.toRequest(Lab.Anthropic));
  const combined = [...userTools, ...providerTools];
  return combined.length > 0 ? combined : undefined;
}
