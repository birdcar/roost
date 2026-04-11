import type { WebhookEvent } from '../types.js';

const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

export async function verifyStripeWebhook(
  request: Request,
  secret: string
): Promise<WebhookEvent> {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    throw new WebhookVerificationError('Missing stripe-signature header');
  }

  const body = await request.text();
  const parts = parseSignatureHeader(signature);

  if (!parts.timestamp || !parts.signature) {
    throw new WebhookVerificationError('Invalid stripe-signature format');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parts.timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new WebhookVerificationError('Webhook timestamp outside tolerance window');
  }

  const payload = `${parts.timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expectedSignature = arrayBufferToHex(signatureBytes);

  if (!timingSafeEqual(expectedSignature, parts.signature)) {
    throw new WebhookVerificationError('Webhook signature verification failed');
  }

  const event = JSON.parse(body) as WebhookEvent;
  return event;
}

function parseSignatureHeader(header: string): { timestamp: number; signature: string } {
  const parts: Record<string, string> = {};
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=');
    if (key && value) parts[key] = value;
  }
  return {
    timestamp: parseInt(parts['t'] ?? '0', 10),
    signature: parts['v1'] ?? '',
  };
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

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}
