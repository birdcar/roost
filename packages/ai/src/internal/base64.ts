type BufferCtor = {
  from(data: Uint8Array): { toString(encoding: 'base64'): string };
  from(data: string, encoding: 'base64'): Uint8Array;
};

const BufferGlobal = (globalThis as { Buffer?: BufferCtor }).Buffer;

export function bytesToBase64(bytes: Uint8Array): string {
  if (BufferGlobal) return BufferGlobal.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(input: string): Uint8Array {
  if (BufferGlobal) return new Uint8Array(BufferGlobal.from(input, 'base64'));
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
