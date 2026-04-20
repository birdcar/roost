import { toBase64 } from '../../providers/attachment-encoding.js';

/**
 * Detect the MIME type of raw image bytes by inspecting the first few bytes.
 *
 * Supports PNG, JPEG, GIF, WEBP. Falls back to the supplied default when no
 * signature matches — useful when the provider reports the MIME type out of
 * band but the bytes carry no magic (e.g. raw PCM).
 */
export function detectImageMimeType(bytes: Uint8Array, fallback = 'application/octet-stream'): string {
  if (bytes.byteLength >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.byteLength >= 3 &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.byteLength >= 6 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  if (bytes.byteLength >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return fallback;
}

export function audioMimeType(format: string): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'opus':
      return 'audio/opus';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'wav':
      return 'audio/wav';
    case 'pcm':
      return 'audio/pcm';
    default:
      return 'application/octet-stream';
  }
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${toBase64(bytes)}`;
}

export function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'audio/opus': 'opus',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/wav': 'wav',
    'audio/pcm': 'pcm',
  };
  return map[mime] ?? 'bin';
}
