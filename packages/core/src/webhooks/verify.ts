export type WebhookAlgorithm = 'hmac-sha256' | 'hmac-sha512' | 'ed25519';

export interface WebhookVerifyOptions {
  secret: string | Uint8Array;
  headerName: string;
  algorithm: WebhookAlgorithm;
  timestampHeader?: string;
  parseTimestamp?: (headerValue: string) => number;
  parseSignature?: (headerValue: string) => string;
  buildSignedPayload?: (timestamp: number | null, body: string) => string;
  tolerance?: number;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export async function verifyWebhook(
  request: Request,
  options: WebhookVerifyOptions
): Promise<string> {
  const body = await request.text();

  const sigHeader = request.headers.get(options.headerName);
  if (!sigHeader) {
    throw new WebhookVerificationError(`Missing ${options.headerName} header`);
  }

  const parseSignature = options.parseSignature ?? ((h) => h);
  const receivedSignature = parseSignature(sigHeader);

  let timestamp: number | null = null;
  if (options.timestampHeader) {
    const tsHeader = request.headers.get(options.timestampHeader) ?? sigHeader;
    const parseTimestamp = options.parseTimestamp ?? ((h) => parseInt(h, 10));
    timestamp = parseTimestamp(tsHeader);

    const tolerance = options.tolerance ?? 300;
    if (tolerance > 0) {
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > tolerance) {
        throw new WebhookVerificationError('Webhook timestamp outside tolerance window');
      }
    }
  }

  const buildSignedPayload =
    options.buildSignedPayload ?? ((ts, b) => `${ts}.${b}`);
  const signedPayload = buildSignedPayload(timestamp, body);

  const secretBytes: Uint8Array<ArrayBuffer> =
    typeof options.secret === 'string'
      ? new Uint8Array(new TextEncoder().encode(options.secret).buffer as ArrayBuffer)
      : new Uint8Array(options.secret.buffer as ArrayBuffer, options.secret.byteOffset, options.secret.byteLength);

  const payloadBytes = new Uint8Array(new TextEncoder().encode(signedPayload).buffer as ArrayBuffer);

  if (options.algorithm === 'hmac-sha256' || options.algorithm === 'hmac-sha512') {
    const hashName = options.algorithm === 'hmac-sha256' ? 'SHA-256' : 'SHA-512';
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: hashName },
      false,
      ['sign']
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, payloadBytes);
    const expected = arrayBufferToHex(sigBytes);
    if (!timingSafeEqual(expected, receivedSignature)) {
      throw new WebhookVerificationError('Webhook signature verification failed');
    }
  } else if (options.algorithm === 'ed25519') {
    let signatureBytes: ArrayBuffer;
    try {
      const decoded = atob(receivedSignature);
      if (decoded.length === 0 && receivedSignature.length > 0) {
        throw new WebhookVerificationError('Ed25519 signature must be base64-encoded');
      }
      signatureBytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0)).buffer;
    } catch (e) {
      if (e instanceof WebhookVerificationError) throw e;
      throw new WebhookVerificationError('Ed25519 signature must be base64-encoded');
    }

    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify('Ed25519', key, signatureBytes, payloadBytes);
    if (!valid) {
      throw new WebhookVerificationError('Webhook signature verification failed');
    }
  }

  return body;
}

export const WebhookPresets = {
  stripe(): WebhookVerifyOptions {
    return {
      secret: '',
      headerName: 'stripe-signature',
      algorithm: 'hmac-sha256',
      timestampHeader: 'stripe-signature',
      parseTimestamp: (header) => {
        const parts = parseKVHeader(header);
        return parseInt(parts['t'] ?? '0', 10);
      },
      parseSignature: (header) => {
        const parts = parseKVHeader(header);
        return parts['v1'] ?? '';
      },
      buildSignedPayload: (timestamp, body) => `${timestamp}.${body}`,
      tolerance: 300,
    };
  },

  github(): WebhookVerifyOptions {
    return {
      secret: '',
      headerName: 'x-hub-signature-256',
      algorithm: 'hmac-sha256',
      parseSignature: (header) => header.replace(/^sha256=/, ''),
      buildSignedPayload: (_timestamp, body) => body,
      tolerance: 0,
    };
  },

  svix(): WebhookVerifyOptions {
    return {
      secret: '',
      headerName: 'svix-signature',
      algorithm: 'ed25519',
      timestampHeader: 'svix-timestamp',
      parseTimestamp: (header) => parseInt(header, 10),
      parseSignature: (header) => {
        const sigs = header.split(' ');
        const v1 = sigs.find((s) => s.startsWith('v1,'));
        return v1?.slice(3) ?? '';
      },
      buildSignedPayload: (timestamp, body) => `${timestamp}.${body}`,
      tolerance: 300,
    };
  },
} as const;

function parseKVHeader(header: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) parts[key] = value;
  }
  return parts;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
