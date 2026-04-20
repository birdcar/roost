import type { StorableFile } from '../../attachments/storable-file.js';
import type { FileRecord } from '../types.js';
import { Lab } from '../../enums.js';

/** Adapter for a provider's Files API (OpenAI/Anthropic/Gemini) OR the R2-native fallback. */
export interface FilesAdapter {
  readonly provider: string;
  store(file: StorableFile, purpose?: string): Promise<FileRecord>;
  get(id: string): Promise<FileRecord>;
  delete(id: string): Promise<void>;
}

/**
 * R2-native fallback. Bytes are streamed into R2 under a `files/{uuid}` key
 * with name + mimeType captured in R2 object metadata. File IDs are the R2
 * keys themselves — consumers can fetch raw bytes via the R2 binding if
 * needed.
 *
 * This adapter is intentionally minimal (no pagination, no listing) — it's the
 * last-resort path when no provider Files API is wired.
 */
export class R2NativeFilesAdapter implements FilesAdapter {
  readonly provider = 'r2-native';

  constructor(private readonly bucket: R2Bucket) {}

  async store(file: StorableFile): Promise<FileRecord> {
    const id = `files/${crypto.randomUUID()}`;
    const bytes = await file.bytes();
    await this.bucket.put(id, bytes, {
      httpMetadata: { contentType: file.mimeType() },
      customMetadata: { name: file.name() },
    });
    return {
      id,
      name: file.name(),
      mimeType: file.mimeType(),
      size: bytes.byteLength,
      provider: this.provider,
      createdAt: Date.now(),
    };
  }

  async get(id: string): Promise<FileRecord> {
    const obj = await this.bucket.head(id);
    if (!obj) throw new Error(`R2NativeFilesAdapter: file not found: ${id}`);
    return {
      id,
      name: obj.customMetadata?.name ?? id,
      mimeType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      size: obj.size,
      provider: this.provider,
    };
  }

  async delete(id: string): Promise<void> {
    await this.bucket.delete(id);
  }
}

/**
 * OpenAI Files adapter: POST /v1/files multipart, GET/DELETE /v1/files/{id}.
 */
export class OpenAIFilesAdapter implements FilesAdapter {
  readonly provider = Lab.OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://api.openai.com',
    private readonly organization?: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...extra,
    };
    if (this.organization) headers['OpenAI-Organization'] = this.organization;
    return headers;
  }

  async store(file: StorableFile, purpose = 'user_data'): Promise<FileRecord> {
    const bytes = await file.bytes();
    const form = new FormData();
    form.append('purpose', purpose);
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: file.mimeType() }),
      file.name(),
    );
    const res = await fetch(`${this.baseUrl}/v1/files`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
    });
    if (!res.ok) throw new Error(`OpenAI files.store ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; filename: string; bytes: number; created_at: number };
    return {
      id: data.id,
      name: data.filename,
      mimeType: file.mimeType(),
      size: data.bytes ?? bytes.byteLength,
      provider: this.provider,
      createdAt: data.created_at * 1000,
    };
  }

  async get(id: string): Promise<FileRecord> {
    const res = await fetch(`${this.baseUrl}/v1/files/${id}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`OpenAI files.get ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; filename: string; bytes: number; created_at: number };
    return {
      id: data.id,
      name: data.filename,
      mimeType: 'application/octet-stream',
      size: data.bytes,
      provider: this.provider,
      createdAt: data.created_at * 1000,
    };
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/files/${id}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`OpenAI files.delete ${res.status}: ${await res.text()}`);
  }
}

/**
 * Anthropic Files adapter: POST /v1/files multipart, GET/DELETE /v1/files/{id}.
 * Requires the `anthropic-beta: files-api-2025-04-14` header.
 */
export class AnthropicFilesAdapter implements FilesAdapter {
  readonly provider = Lab.Anthropic;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://api.anthropic.com',
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
      ...extra,
    };
  }

  async store(file: StorableFile): Promise<FileRecord> {
    const bytes = await file.bytes();
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: file.mimeType() }),
      file.name(),
    );
    const res = await fetch(`${this.baseUrl}/v1/files`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
    });
    if (!res.ok) throw new Error(`Anthropic files.store ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; filename: string; size_bytes: number; created_at: string };
    return {
      id: data.id,
      name: data.filename,
      mimeType: file.mimeType(),
      size: data.size_bytes,
      provider: this.provider,
      createdAt: Date.parse(data.created_at),
    };
  }

  async get(id: string): Promise<FileRecord> {
    const res = await fetch(`${this.baseUrl}/v1/files/${id}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Anthropic files.get ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; filename: string; size_bytes: number; created_at: string };
    return {
      id: data.id,
      name: data.filename,
      mimeType: 'application/octet-stream',
      size: data.size_bytes,
      provider: this.provider,
      createdAt: Date.parse(data.created_at),
    };
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/files/${id}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Anthropic files.delete ${res.status}: ${await res.text()}`);
  }
}

/**
 * Gemini Files adapter: POST /upload/v1beta/files (multipart), GET/DELETE /v1beta/files/{id}.
 * Uses the "simple upload" path — suitable for < 2GB files.
 */
export class GeminiFilesAdapter implements FilesAdapter {
  readonly provider = Lab.Gemini;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://generativelanguage.googleapis.com',
  ) {}

  async store(file: StorableFile): Promise<FileRecord> {
    const bytes = await file.bytes();
    const res = await fetch(
      `${this.baseUrl}/upload/v1beta/files?key=${this.apiKey}&uploadType=multipart`,
      {
        method: 'POST',
        headers: {
          'Content-Type': file.mimeType(),
          'X-Goog-Upload-File-Name': file.name(),
        },
        body: new Uint8Array(bytes) as unknown as BodyInit,
      },
    );
    if (!res.ok) throw new Error(`Gemini files.store ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { file: { name: string; mimeType: string; sizeBytes: string; createTime: string } };
    return {
      id: data.file.name,
      name: file.name(),
      mimeType: data.file.mimeType,
      size: Number.parseInt(data.file.sizeBytes, 10),
      provider: this.provider,
      createdAt: Date.parse(data.file.createTime),
    };
  }

  async get(id: string): Promise<FileRecord> {
    const res = await fetch(`${this.baseUrl}/v1beta/${id}?key=${this.apiKey}`);
    if (!res.ok) throw new Error(`Gemini files.get ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { name: string; mimeType: string; sizeBytes: string; createTime: string };
    return {
      id: data.name,
      name: data.name,
      mimeType: data.mimeType,
      size: Number.parseInt(data.sizeBytes, 10),
      provider: this.provider,
      createdAt: Date.parse(data.createTime),
    };
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1beta/${id}?key=${this.apiKey}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Gemini files.delete ${res.status}: ${await res.text()}`);
  }
}

let defaultAdapter: FilesAdapter | null = null;
const adapters = new Map<string, FilesAdapter>();

export function registerFilesAdapter(provider: string, adapter: FilesAdapter): void {
  adapters.set(provider, adapter);
  if (!defaultAdapter) defaultAdapter = adapter;
}

export function setDefaultFilesAdapter(adapter: FilesAdapter | null): void {
  defaultAdapter = adapter;
}

export function resolveFilesAdapter(provider?: string): FilesAdapter {
  if (provider) {
    const adapter = adapters.get(provider);
    if (adapter) return adapter;
    throw new Error(`No FilesAdapter registered for provider '${provider}'. Register one via registerFilesAdapter().`);
  }
  if (!defaultAdapter) {
    throw new Error(
      'No default FilesAdapter registered. Register an adapter via registerFilesAdapter() (typically done by AiServiceProvider).',
    );
  }
  return defaultAdapter;
}

export function resetFilesAdapters(): void {
  adapters.clear();
  defaultAdapter = null;
}
