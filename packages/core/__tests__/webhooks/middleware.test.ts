import { describe, test, expect } from 'bun:test';
import { WebhookMiddleware } from '../../src/webhooks/middleware';
import { WebhookPresets, WebhookVerificationError } from '../../src/webhooks/verify';

const TEST_SECRET = 'test_secret_key';

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function makeStripeRequest(body: string, sigHeader: string): Request {
  return new Request('https://example.com/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': sigHeader },
    body,
  });
}

describe('WebhookMiddleware', () => {
  test('returns 401 with JSON error body when signature is invalid', async () => {
    const mw = new WebhookMiddleware({ ...WebhookPresets.stripe(), secret: TEST_SECRET });
    const timestamp = Math.floor(Date.now() / 1000);
    const request = makeStripeRequest('{}', `t=${timestamp},v1=invalidsig`);

    const response = await mw.handle(request, async () => new Response('ok'));

    expect(response.status).toBe(401);
    const json = await response.json() as { error: string };
    expect(typeof json.error).toBe('string');
  });

  test('calls next with a request that has the body pre-read when signature is valid', async () => {
    const body = '{"event":"test"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${body}`;
    const sig = await hmacSign(payload, TEST_SECRET);
    const sigHeader = `t=${timestamp},v1=${sig}`;

    const mw = new WebhookMiddleware({ ...WebhookPresets.stripe(), secret: TEST_SECRET });
    const request = makeStripeRequest(body, sigHeader);

    let receivedRequest: Request | null = null;
    await mw.handle(request, async (req) => {
      receivedRequest = req;
      return new Response('ok');
    });

    expect(receivedRequest).not.toBeNull();
  });

  test('downstream handler can call request.text() and receive the original body', async () => {
    const body = '{"event":"test"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${body}`;
    const sig = await hmacSign(payload, TEST_SECRET);
    const sigHeader = `t=${timestamp},v1=${sig}`;

    const mw = new WebhookMiddleware({ ...WebhookPresets.stripe(), secret: TEST_SECRET });
    const request = makeStripeRequest(body, sigHeader);

    let downstreamBody = '';
    await mw.handle(request, async (req) => {
      downstreamBody = await req.text();
      return new Response('ok');
    });

    expect(downstreamBody).toBe(body);
  });

  test('re-throws non-WebhookVerificationError exceptions', async () => {
    const mw = new WebhookMiddleware({
      secret: TEST_SECRET,
      headerName: 'x-sig',
      algorithm: 'hmac-sha256',
      buildSignedPayload: () => { throw new Error('unexpected runtime error'); },
    });

    const request = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: { 'x-sig': 'somesig' },
      body: '{}',
    });

    await expect(mw.handle(request, async () => new Response('ok'))).rejects.toThrow(
      'unexpected runtime error'
    );
  });

  test('end-to-end with GitHub preset', async () => {
    const body = '{"action":"opened"}';
    const sig = await hmacSign(body, TEST_SECRET);
    const sigHeader = `sha256=${sig}`;

    const mw = new WebhookMiddleware({ ...WebhookPresets.github(), secret: TEST_SECRET });
    const request = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': sigHeader },
      body,
    });

    let downstreamBody = '';
    const response = await mw.handle(request, async (req) => {
      downstreamBody = await req.text();
      return new Response('ok');
    });

    expect(response.status).toBe(200);
    expect(downstreamBody).toBe(body);
  });

  test('end-to-end with Svix preset', async () => {
    const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const pair = kp as CryptoKeyPair;
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const body = '{"type":"message.created"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${body}`;
    const sigBytes = await crypto.subtle.sign(
      'Ed25519',
      pair.privateKey,
      new TextEncoder().encode(signedPayload)
    );
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

    const mw = new WebhookMiddleware({ ...WebhookPresets.svix(), secret: publicKeyBytes });
    const request = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: {
        'svix-signature': `v1,${sigB64}`,
        'svix-timestamp': String(timestamp),
      },
      body,
    });

    let downstreamBody = '';
    const response = await mw.handle(request, async (req) => {
      downstreamBody = await req.text();
      return new Response('ok');
    });

    expect(response.status).toBe(200);
    expect(downstreamBody).toBe(body);
  });

  test('end-to-end with Stripe preset', async () => {
    const body = '{"id":"evt_123","type":"payment_intent.created"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${body}`;
    const sig = await hmacSign(payload, TEST_SECRET);
    const sigHeader = `t=${timestamp},v1=${sig}`;

    const mw = new WebhookMiddleware({ ...WebhookPresets.stripe(), secret: TEST_SECRET });
    const request = makeStripeRequest(body, sigHeader);

    let downstreamBody = '';
    const response = await mw.handle(request, async (req) => {
      downstreamBody = await req.text();
      return new Response('ok');
    });

    expect(response.status).toBe(200);
    expect(downstreamBody).toBe(body);
  });
});
