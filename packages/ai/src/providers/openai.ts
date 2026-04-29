import type {
  AIProvider,
  ProviderCapabilities,
  EmbedRequest,
  EmbedResponse,
  ImageRequest,
  ImageResponse,
  AudioRequest,
  AudioResponse,
  TranscribeRequest,
  TranscribeResponse,
} from './interface.js';
import { UnsupportedOptionDropped } from '../media/shared/events.js';
import { dispatchEvent } from '../events.js';
import { audioMimeType, detectImageMimeType } from '../media/shared/mime.js';
import type { StorableFileLike, ProviderRequest, ProviderResponse, AgentMessage, ToolCall, StreamEvent } from '../types.js';
import { Lab } from '../enums.js';
import { iterateSSELines } from '../streaming/sse-lines.js';
import { encodeAll, type EncodedAttachment } from './attachment-encoding.js';
import { base64ToBytes } from '../internal/base64.js';

const CAPS: ProviderCapabilities = {
  name: Lab.OpenAI,
  supported: new Set([
    'chat',
    'stream',
    'embed',
    'tools',
    'structured-output',
    'files',
    'stores',
    'image',
    'audio',
    'transcribe',
  ]),
  cheapestChat: 'gpt-4o-mini',
  smartestChat: 'gpt-4o',
  defaultEmbed: 'text-embedding-3-small',
};

const DEFAULT_IMAGE_MODEL = 'gpt-image-1';
const DEFAULT_AUDIO_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-transcribe';

const MALE_DEFAULT_VOICE = 'onyx';
const FEMALE_DEFAULT_VOICE = 'alloy';

const MODELS_WITHOUT_SEED = new Set(['dall-e-3', 'dall-e-2', 'gpt-image-1']);

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
    const encodedAttachments = await encodeAll(request.attachments);
    const messages = buildOpenAIMessages(request.messages, encodedAttachments);
    const tools = buildOpenAITools(request);
    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(tools ? { tools } : {}),
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
    const encodedAttachments = await encodeAll(request.attachments);
    const messages = buildOpenAIMessages(request.messages, encodedAttachments);
    const tools = buildOpenAITools(request);
    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(tools ? { tools } : {}),
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

  async image(request: ImageRequest): Promise<ImageResponse> {
    const model = request.model ?? DEFAULT_IMAGE_MODEL;
    const base = this.config.baseUrl ?? 'https://api.openai.com';
    const url = `${base}/v1/images/generations`;

    if (typeof request.seed === 'number' && MODELS_WITHOUT_SEED.has(model)) {
      await dispatchEvent(
        UnsupportedOptionDropped,
        new UnsupportedOptionDropped('image', this.name, 'seed', `${model} ignores the seed parameter`),
      );
    }

    if (request.referenceImages && request.referenceImages.length > 0) {
      await ensureAttachmentsEncodable(request.referenceImages);
      await dispatchEvent(
        UnsupportedOptionDropped,
        new UnsupportedOptionDropped(
          'image',
          this.name,
          'referenceImages',
          `${model} does not accept reference images via the /images/generations endpoint`,
        ),
      );
    }

    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      ...(request.aspect ? { size: openAiImageSize(request.aspect) } : {}),
      ...(request.quality ? { quality: request.quality === 'medium' ? 'standard' : request.quality } : {}),
      n: 1,
      response_format: 'b64_json',
      ...(typeof request.seed === 'number' && !MODELS_WITHOUT_SEED.has(model) ? { seed: request.seed } : {}),
      ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
      ...(request.providerOptions ?? {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`OpenAI image ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as OpenAIImageResponse;
    const payload = data.data?.[0];
    if (!payload) throw new Error('OpenAI image: no image in response');

    let bytes: Uint8Array;
    if (payload.b64_json) {
      bytes = base64ToBytes(payload.b64_json);
    } else if (payload.url) {
      const image = await fetch(payload.url);
      bytes = new Uint8Array(await image.arrayBuffer());
    } else {
      throw new Error('OpenAI image response carried neither b64_json nor url');
    }

    return {
      bytes,
      mimeType: detectImageMimeType(bytes, 'image/png'),
      model,
      provider: this.name,
    };
  }

  async audio(request: AudioRequest): Promise<AudioResponse> {
    const model = request.model ?? DEFAULT_AUDIO_MODEL;
    const base = this.config.baseUrl ?? 'https://api.openai.com';
    const url = `${base}/v1/audio/speech`;
    const voice = request.voice ?? defaultVoiceForGender(request.gender);
    const format = request.format ?? 'mp3';

    const body: Record<string, unknown> = {
      model,
      input: request.text,
      voice,
      response_format: format,
      ...(request.instructions && supportsInstructions(model) ? { instructions: request.instructions } : {}),
      ...(typeof request.speed === 'number' ? { speed: request.speed } : {}),
      ...(request.providerOptions ?? {}),
    };

    if (request.instructions && !supportsInstructions(model)) {
      await dispatchEvent(
        UnsupportedOptionDropped,
        new UnsupportedOptionDropped('audio', this.name, 'instructions', `${model} does not accept instructions`),
      );
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`OpenAI audio ${response.status}: ${await response.text()}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      format,
      mimeType: audioMimeType(format),
      model,
      provider: this.name,
    };
  }

  async transcribe(request: TranscribeRequest): Promise<TranscribeResponse> {
    const model = request.model ?? DEFAULT_TRANSCRIBE_MODEL;
    const base = this.config.baseUrl ?? 'https://api.openai.com';
    const url = `${base}/v1/audio/transcriptions`;

    const form = new FormData();
    const blob = new Blob([request.bytes], { type: request.mimeType });
    form.append('file', blob, fileNameForMime(request.mimeType));
    form.append('model', model);
    form.append('response_format', request.timestampGranularity ? 'verbose_json' : 'json');
    if (request.language) form.append('language', request.language);
    if (request.prompt) form.append('prompt', request.prompt);
    if (typeof request.temperature === 'number') form.append('temperature', String(request.temperature));
    if (request.timestampGranularity) form.append('timestamp_granularities[]', request.timestampGranularity);
    if (request.diarize) form.append('diarize', 'true');

    const response = await fetch(url, {
      method: 'POST',
      headers: this.authHeadersWithoutJson(),
      body: form,
    });
    if (!response.ok) throw new Error(`OpenAI transcribe ${response.status}: ${await response.text()}`);

    const data = (await response.json()) as OpenAITranscribeResponse;
    return {
      text: data.text ?? '',
      segments: data.segments?.map((s) => ({ start: s.start, end: s.end, text: s.text })),
      diarizedSegments: data.segments
        ?.filter((s): s is typeof s & { speaker: string } => typeof s.speaker === 'string')
        .map((s) => ({ start: s.start, end: s.end, text: s.text, speaker: s.speaker })),
      language: data.language ?? request.language,
      duration: data.duration,
      model,
      provider: this.name,
    };
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.config.organization) headers['OpenAI-Organization'] = this.config.organization;
    return headers;
  }

  private authHeadersWithoutJson(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.config.organization) headers['OpenAI-Organization'] = this.config.organization;
    return headers;
  }
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
}

interface OpenAITranscribeResponse {
  text?: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string; speaker?: string }>;
}

function openAiImageSize(aspect: 'square' | 'portrait' | 'landscape'): string {
  switch (aspect) {
    case 'square':
      return '1024x1024';
    case 'portrait':
      return '1024x1536';
    case 'landscape':
      return '1536x1024';
  }
}

function defaultVoiceForGender(gender: 'male' | 'female' | undefined): string {
  if (gender === 'male') return MALE_DEFAULT_VOICE;
  if (gender === 'female') return FEMALE_DEFAULT_VOICE;
  return FEMALE_DEFAULT_VOICE;
}

function supportsInstructions(model: string): boolean {
  return model.includes('gpt-4o') || model.includes('mini-tts');
}

function fileNameForMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'audio.mp3',
    'audio/wav': 'audio.wav',
    'audio/webm': 'audio.webm',
    'audio/mp4': 'audio.m4a',
    'audio/ogg': 'audio.ogg',
    'audio/opus': 'audio.opus',
    'audio/flac': 'audio.flac',
    'audio/aac': 'audio.aac',
  };
  return map[mime] ?? 'audio.bin';
}

async function ensureAttachmentsEncodable(refs: readonly StorableFileLike[]): Promise<void> {
  // Pre-flight check so attachment failures surface with a clear message before
  // the remote call. Reuses the existing encoder for consistency.
  await encodeAll(refs);
}

function toOpenAIMessage(m: AgentMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
  }
  return { role: m.role, content: m.content };
}

function buildOpenAIMessages(
  messages: AgentMessage[],
  attachments: EncodedAttachment[],
): Array<Record<string, unknown>> {
  const encoded = messages.map(toOpenAIMessage);
  if (attachments.length === 0) return encoded;

  for (let i = encoded.length - 1; i >= 0; i--) {
    const msg = encoded[i]!;
    if (msg.role !== 'user') continue;
    const existing = typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : Array.isArray(msg.content)
        ? (msg.content as Array<Record<string, unknown>>)
        : [];
    const attachmentParts = attachments.map(toOpenAIAttachmentPart);
    encoded[i] = { ...msg, content: [...attachmentParts, ...existing] };
    return encoded;
  }

  encoded.push({ role: 'user', content: attachments.map(toOpenAIAttachmentPart) });
  return encoded;
}

function toOpenAIAttachmentPart(att: EncodedAttachment): Record<string, unknown> {
  if (att.isImage) {
    if (att.source === 'url' && att.url) {
      return { type: 'image_url', image_url: { url: att.url } };
    }
    if (att.source === 'id' && att.providerFileId) {
      return { type: 'image_url', image_url: { url: att.providerFileId } };
    }
    return { type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${att.base64 ?? ''}` } };
  }
  if (att.source === 'id' && att.providerFileId) {
    return { type: 'file', file: { file_id: att.providerFileId } };
  }
  return {
    type: 'file',
    file: { filename: att.name, file_data: `data:${att.mimeType};base64,${att.base64 ?? ''}` },
  };
}

function buildOpenAITools(request: ProviderRequest): Array<Record<string, unknown>> | undefined {
  const userTools = request.tools?.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  })) ?? [];
  const providerTools = (request.providerTools ?? []).map((pt) => pt.toRequest(Lab.OpenAI));
  const combined = [...userTools, ...providerTools];
  return combined.length > 0 ? combined : undefined;
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
