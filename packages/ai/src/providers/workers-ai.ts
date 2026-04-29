import type { AIClient } from '@roostjs/cloudflare';
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
import { CapabilityNotSupportedError } from './interface.js';
import type { ProviderRequest, ProviderResponse, StreamEvent } from '../types.js';
import { base64ToBytes } from '../internal/base64.js';
import { Lab } from '../enums.js';
import { iterateSSELines } from '../streaming/sse-lines.js';
import { UnsupportedProviderToolError } from '../tool.js';
import { detectImageMimeType, audioMimeType } from '../media/shared/mime.js';

const CAPS: ProviderCapabilities = {
  name: Lab.WorkersAI,
  supported: new Set(['chat', 'stream', 'embed', 'tools', 'image', 'audio', 'transcribe']),
  cheapestChat: '@cf/meta/llama-3.2-3b-instruct',
  smartestChat: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  defaultEmbed: '@cf/baai/bge-base-en-v1.5',
};

const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const DEFAULT_AUDIO_MODEL = '@cf/myshell-ai/melotts';
const DEFAULT_TRANSCRIBE_MODEL = '@cf/openai/whisper-large-v3-turbo';

export class WorkersAIProvider implements AIProvider {
  readonly name = Lab.WorkersAI;

  constructor(private client: AIClient) {}

  capabilities(): ProviderCapabilities {
    return CAPS;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (request.providerTools && request.providerTools.length > 0) {
      throw new UnsupportedProviderToolError(request.providerTools[0]!.name, Lab.WorkersAI);
    }
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
    if (request.providerTools && request.providerTools.length > 0) {
      throw new UnsupportedProviderToolError(request.providerTools[0]!.name, Lab.WorkersAI);
    }
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

  async image(request: ImageRequest): Promise<ImageResponse> {
    const model = request.model ?? DEFAULT_IMAGE_MODEL;
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
      ...(typeof request.seed === 'number' ? { seed: request.seed } : {}),
      ...(typeof request.steps === 'number' ? { steps: request.steps } : {}),
      ...(request.aspect ? { aspect_ratio: mapAspect(request.aspect) } : {}),
      ...(request.providerOptions ?? {}),
    };
    const result = await this.client.run<WorkersAiImageResponse | Uint8Array | ReadableStream<Uint8Array>>(
      model,
      body as unknown as Record<string, unknown>,
    );
    if (isAsyncTaskId(result)) throw new Error('Workers AI returned an async task id; media queueing is not supported here');
    const bytes = await normalizeImageResult(result);
    const mimeType = detectImageMimeType(bytes, 'image/png');
    return { bytes, mimeType, model, provider: this.name };
  }

  async audio(request: AudioRequest): Promise<AudioResponse> {
    const model = request.model ?? DEFAULT_AUDIO_MODEL;
    const body: Record<string, unknown> = {
      prompt: request.text,
      ...(request.voice ? { voice: request.voice } : {}),
      ...(request.providerOptions ?? {}),
    };
    const result = await this.client.run<WorkersAiAudioResponse | Uint8Array | ReadableStream<Uint8Array>>(
      model,
      body as unknown as Record<string, unknown>,
    );
    if (isAsyncTaskId(result)) throw new Error('Workers AI returned an async task id; media queueing is not supported here');
    const bytes = await normalizeBinaryResult(result, 'audio');
    const format = request.format ?? 'mp3';
    return {
      bytes,
      format,
      mimeType: audioMimeType(format),
      model,
      provider: this.name,
    };
  }

  async transcribe(request: TranscribeRequest): Promise<TranscribeResponse> {
    if (request.diarize) {
      throw new CapabilityNotSupportedError(
        'transcribe',
        this.name,
        'Workers AI Whisper does not support diarization — use OpenAI or ElevenLabs via Gateway.',
      );
    }
    const model = request.model ?? DEFAULT_TRANSCRIBE_MODEL;
    const body: Record<string, unknown> = {
      audio: Array.from(request.bytes),
      ...(request.language ? { language: request.language } : {}),
      ...(request.prompt ? { initial_prompt: request.prompt } : {}),
      ...(request.providerOptions ?? {}),
    };
    const result = await this.client.run<WorkersAiTranscribeResponse>(model, body);
    if (isAsyncTaskId(result)) throw new Error('Workers AI returned an async task id; media queueing is not supported here');
    const text = typeof result === 'string' ? result : result?.text ?? '';
    const segments = typeof result === 'object' && result !== null && 'segments' in result ? result.segments : undefined;
    const language = typeof result === 'object' && result !== null && 'language' in result ? result.language : request.language;
    const duration = typeof result === 'object' && result !== null && 'duration' in result ? result.duration : undefined;
    return {
      text,
      segments,
      language,
      duration,
      model,
      provider: this.name,
    };
  }
}

function isAsyncTaskId(value: unknown): value is { id: string } {
  return !!value && typeof value === 'object' && !('getReader' in value) && 'id' in value &&
    typeof (value as { id: unknown }).id === 'string' &&
    !(value instanceof Uint8Array) &&
    !('image' in value) && !('audio' in value) && !('text' in value) && !('bytes' in value) &&
    !('language' in value) && !('segments' in value);
}

function mapAspect(aspect: 'square' | 'portrait' | 'landscape'): string {
  switch (aspect) {
    case 'square':
      return '1:1';
    case 'portrait':
      return '9:16';
    case 'landscape':
      return '16:9';
  }
}

interface WorkersAiImageResponse {
  image?: string;
  bytes?: Uint8Array;
}

interface WorkersAiAudioResponse {
  audio?: string;
  bytes?: Uint8Array;
}

interface WorkersAiTranscribeResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

async function normalizeImageResult(
  result: WorkersAiImageResponse | Uint8Array | ReadableStream<Uint8Array> | string,
): Promise<Uint8Array> {
  if (result instanceof Uint8Array) return result;
  if (typeof result === 'string') return base64ToBytes(result);
  if (isReadableStream(result)) return readStreamToBytes(result);
  if (result && typeof result === 'object') {
    if (result.bytes instanceof Uint8Array) return result.bytes;
    if (typeof result.image === 'string') return base64ToBytes(result.image);
  }
  throw new Error('Workers AI image model returned an unrecognised payload');
}

async function normalizeBinaryResult(
  result: WorkersAiAudioResponse | Uint8Array | ReadableStream<Uint8Array> | string,
  kind: 'audio',
): Promise<Uint8Array> {
  if (result instanceof Uint8Array) return result;
  if (typeof result === 'string') return base64ToBytes(result);
  if (isReadableStream(result)) return readStreamToBytes(result);
  if (result && typeof result === 'object') {
    if (result.bytes instanceof Uint8Array) return result.bytes;
    if (typeof result.audio === 'string') return base64ToBytes(result.audio);
  }
  throw new Error(`Workers AI ${kind} model returned an unrecognised payload`);
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return !!value && typeof (value as ReadableStream).getReader === 'function';
}

async function readStreamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

interface WorkersAiStreamChunk {
  response?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * @deprecated Use `WorkersAIProvider`. Retained as an alias during v0.3 rollout.
 */
export { WorkersAIProvider as CloudflareAIProvider };
