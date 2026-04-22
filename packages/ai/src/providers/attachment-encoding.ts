import type { StorableFileLike } from '../types.js';
import { StorableFile } from '../attachments/storable-file.js';
import type { Lab } from '../enums.js';

type Source = 'bytes' | 'url' | 'id' | 'other';

export interface EncodedAttachment {
  name: string;
  mimeType: string;
  /** Already-extracted bytes when not a URL / file-id reference. */
  base64?: string;
  url?: string;
  providerFileId?: string;
  source: Source;
  isImage: boolean;
  isDocument: boolean;
}

/**
 * Normalize a user-facing `StorableFileLike` into the shape each provider
 * encoder needs. URL-backed attachments keep their URL so providers that
 * accept URLs (Anthropic image `source: {type: 'url'}`, OpenAI image_url)
 * don't need to re-download client-side.
 */
export async function encodeAttachment(attachment: StorableFileLike): Promise<EncodedAttachment> {
  const mimeType = attachment.mimeType();
  const name = attachment.name();
  const isImage = mimeType.startsWith('image/');
  const isDocument = !isImage;

  if (attachment instanceof StorableFile) {
    const providerFileId = attachment.providerFileId();
    if (providerFileId) {
      return { name, mimeType, providerFileId, source: 'id', isImage, isDocument };
    }
  }

  // Peek at the underlying source if available without forcing bytes for URLs.
  const source = readSource(attachment);
  if (source?.kind === 'url') {
    return { name, mimeType, url: source.url, source: 'url', isImage, isDocument };
  }

  const bytes = await attachment.bytes();
  return { name, mimeType, base64: toBase64(bytes), source: 'bytes', isImage, isDocument };
}

function readSource(attachment: StorableFileLike): { kind: string; url?: string } | null {
  const s = (attachment as unknown as { source?: { kind: string; url?: string } }).source;
  if (s && typeof s === 'object' && typeof s.kind === 'string') return s;
  return null;
}

export function toBase64(bytes: Uint8Array): string {
  const maybeBuffer = globalThis as typeof globalThis & {
    Buffer?: { from(input: Uint8Array): { toString(encoding: 'base64'): string } };
  };
  if (maybeBuffer.Buffer) {
    return maybeBuffer.Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export async function encodeAll(
  attachments: readonly StorableFileLike[] | undefined,
): Promise<EncodedAttachment[]> {
  if (!attachments || attachments.length === 0) return [];
  return Promise.all(attachments.map(encodeAttachment));
}

export class AttachmentProviderMismatchError extends Error {
  override readonly name = 'AttachmentProviderMismatchError';
  constructor(attachmentProvider: Lab | string, requestProvider: Lab | string) {
    super(
      `Attachment references provider '${attachmentProvider}' but request is targeting '${requestProvider}'. fromId() attachments are provider-specific.`,
    );
  }
}
