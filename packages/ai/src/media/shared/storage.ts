/**
 * Storage resolver for media `.store*()` helpers.
 *
 * Wired by the host application (typically via `AiServiceProvider`) since
 * the media package is runtime-agnostic. Writes bytes to the underlying R2
 * bucket (or a future alternative) and, when available, exposes a public URL.
 */

export interface MediaStorageResolver {
  /** Write bytes under a generated key and return the resolved key or URL. */
  put(key: string, bytes: Uint8Array, opts: MediaPutOptions): Promise<string>;
  /** Return the public URL for a previously-stored key, if the bucket supports public access. */
  publicUrl?(key: string, opts?: { disk?: string }): string | undefined;
}

export interface MediaPutOptions {
  disk?: string;
  mimeType?: string;
  /** Hint that the file should be served publicly — backends decide what that means. */
  public?: boolean;
}

let resolver: MediaStorageResolver | null = null;

export function setMediaStorageResolver(r: MediaStorageResolver | null): void {
  resolver = r;
}

export function getMediaStorageResolver(): MediaStorageResolver | null {
  return resolver;
}

export class MediaStorageUnavailableError extends Error {
  override readonly name = 'MediaStorageUnavailableError';
  constructor(method: string) {
    super(
      `Media storage is not configured — ${method} requires setMediaStorageResolver() or an AiServiceProvider wiring that registers an R2 bucket under 'ai.r2.binding'.`,
    );
  }
}

export function generateStorageKey(prefix: string, extension: string): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}/${id}.${extension}`;
}
