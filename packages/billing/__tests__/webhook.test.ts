import { describe, test, expect } from 'bun:test';
import { verifyStripeWebhook, WebhookVerificationError } from '../src/stripe/webhook';

const TEST_SECRET = 'whsec_test_secret_key_for_testing';

async function signPayload(payload: string, timestamp: number, secret: string): Promise<string> {
  const message = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${hex}`;
}

function createWebhookRequest(body: object, signatureHeader: string): Request {
  return new Request('https://app.com/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signatureHeader },
    body: JSON.stringify(body),
  });
}

describe('verifyStripeWebhook', () => {
  test('verifies valid webhook signature', async () => {
    const body = { id: 'evt_123', type: 'customer.subscription.created', data: {} };
    const payload = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signPayload(payload, timestamp, TEST_SECRET);

    const request = createWebhookRequest(body, signature);
    const event = await verifyStripeWebhook(request, TEST_SECRET);

    expect(event.id).toBe('evt_123');
    expect(event.type).toBe('customer.subscription.created');
  });

  test('rejects missing signature header', async () => {
    const request = new Request('https://app.com/billing/webhook', {
      method: 'POST',
      body: '{}',
    });

    expect(verifyStripeWebhook(request, TEST_SECRET)).rejects.toThrow(WebhookVerificationError);
  });

  test('rejects invalid signature', async () => {
    const body = { id: 'evt_123', type: 'test', data: {} };
    const timestamp = Math.floor(Date.now() / 1000);
    const request = createWebhookRequest(body, `t=${timestamp},v1=invalidsignature`);

    expect(verifyStripeWebhook(request, TEST_SECRET)).rejects.toThrow('signature verification failed');
  });

  test('rejects expired timestamp', async () => {
    const body = { id: 'evt_123', type: 'test', data: {} };
    const payload = JSON.stringify(body);
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const signature = await signPayload(payload, oldTimestamp, TEST_SECRET);

    const request = createWebhookRequest(body, signature);

    expect(verifyStripeWebhook(request, TEST_SECRET)).rejects.toThrow('timestamp outside tolerance');
  });
});
