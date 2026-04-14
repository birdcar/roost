import { describe, test, expect } from 'bun:test';
import { verifyWebhook, WebhookPresets, WebhookVerificationError } from '../../src/webhooks/verify';

const TEST_SECRET = 'test_secret_key';

async function hmacSign(
  payload: string,
  secret: string,
  hash: 'SHA-256' | 'SHA-512'
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function makeRequest(
  body: string,
  headers: Record<string, string>,
  method = 'POST'
): Request {
  return new Request('https://example.com/webhook', { method, headers, body });
}

describe('verifyWebhook — HMAC-SHA256', () => {
  test('returns body string on valid signature', async () => {
    const body = '{"event":"test"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${body}`;
    const sig = await hmacSign(payload, TEST_SECRET, 'SHA-256');

    const request = makeRequest(body, {
      'x-sig': `t=${timestamp},v1=${sig}`,
    });

    const result = await verifyWebhook(request, {
      secret: TEST_SECRET,
      headerName: 'x-sig',
      algorithm: 'hmac-sha256',
      timestampHeader: 'x-sig',
      parseTimestamp: (h) => {
        const m = h.match(/t=(\d+)/);
        return parseInt(m?.[1] ?? '0', 10);
      },
      parseSignature: (h) => {
        const m = h.match(/v1=([^,]+)/);
        return m?.[1] ?? '';
      },
      tolerance: 300,
    });

    expect(result).toBe(body);
  });

  test('throws WebhookVerificationError when signature header is missing', async () => {
    const request = makeRequest('{}', {});
    await expect(
      verifyWebhook(request, { secret: TEST_SECRET, headerName: 'x-sig', algorithm: 'hmac-sha256' })
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  test('throws WebhookVerificationError when signature does not match', async () => {
    const body = '{"event":"test"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const request = makeRequest(body, { 'x-sig': `t=${timestamp},v1=badhex` });

    await expect(
      verifyWebhook(request, {
        secret: TEST_SECRET,
        headerName: 'x-sig',
        algorithm: 'hmac-sha256',
        timestampHeader: 'x-sig',
        parseTimestamp: (h) => parseInt(h.match(/t=(\d+)/)?.[1] ?? '0', 10),
        parseSignature: (h) => h.match(/v1=([^,]+)/)?.[1] ?? '',
        tolerance: 300,
      })
    ).rejects.toThrow('signature verification failed');
  });

  test('throws WebhookVerificationError when timestamp is outside tolerance', async () => {
    const body = '{"event":"test"}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const payload = `${oldTimestamp}.${body}`;
    const sig = await hmacSign(payload, TEST_SECRET, 'SHA-256');

    const request = makeRequest(body, { 'x-sig': `t=${oldTimestamp},v1=${sig}` });

    await expect(
      verifyWebhook(request, {
        secret: TEST_SECRET,
        headerName: 'x-sig',
        algorithm: 'hmac-sha256',
        timestampHeader: 'x-sig',
        parseTimestamp: (h) => parseInt(h.match(/t=(\d+)/)?.[1] ?? '0', 10),
        parseSignature: (h) => h.match(/v1=([^,]+)/)?.[1] ?? '',
        tolerance: 300,
      })
    ).rejects.toThrow('timestamp outside tolerance');
  });

  test('does not validate timestamp when tolerance is 0', async () => {
    const body = '{"event":"test"}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const payload = `${oldTimestamp}.${body}`;
    const sig = await hmacSign(payload, TEST_SECRET, 'SHA-256');

    const request = makeRequest(body, { 'x-sig': `t=${oldTimestamp},v1=${sig}` });

    const result = await verifyWebhook(request, {
      secret: TEST_SECRET,
      headerName: 'x-sig',
      algorithm: 'hmac-sha256',
      timestampHeader: 'x-sig',
      parseTimestamp: (h) => parseInt(h.match(/t=(\d+)/)?.[1] ?? '0', 10),
      parseSignature: (h) => h.match(/v1=([^,]+)/)?.[1] ?? '',
      tolerance: 0,
    });

    expect(result).toBe(body);
  });

  test('does not validate timestamp when timestampHeader is absent', async () => {
    const body = '{"event":"test"}';
    const sig = await hmacSign(body, TEST_SECRET, 'SHA-256');

    const request = makeRequest(body, { 'x-sig': sig });

    const result = await verifyWebhook(request, {
      secret: TEST_SECRET,
      headerName: 'x-sig',
      algorithm: 'hmac-sha256',
      buildSignedPayload: (_ts, b) => b,
    });

    expect(result).toBe(body);
  });
});

describe('verifyWebhook — HMAC-SHA512', () => {
  test('returns body string on valid signature', async () => {
    const body = '{"event":"test"}';
    const sig = await hmacSign(body, TEST_SECRET, 'SHA-512');

    const request = makeRequest(body, { 'x-sig-512': sig });

    const result = await verifyWebhook(request, {
      secret: TEST_SECRET,
      headerName: 'x-sig-512',
      algorithm: 'hmac-sha512',
      buildSignedPayload: (_ts, b) => b,
    });

    expect(result).toBe(body);
  });

  test('throws on invalid signature', async () => {
    const body = '{"event":"test"}';
    const request = makeRequest(body, { 'x-sig-512': 'invalidsig' });

    await expect(
      verifyWebhook(request, {
        secret: TEST_SECRET,
        headerName: 'x-sig-512',
        algorithm: 'hmac-sha512',
        buildSignedPayload: (_ts, b) => b,
      })
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });
});

describe('verifyWebhook — Ed25519', () => {
  async function generateEd25519Keypair() {
    return crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  }

  async function ed25519Sign(payload: string, privateKey: CryptoKey): Promise<string> {
    const bytes = new TextEncoder().encode(payload);
    const sig = await crypto.subtle.sign('Ed25519', privateKey, bytes);
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  }

  async function exportRawPublicKey(publicKey: CryptoKey): Promise<Uint8Array> {
    const raw = await crypto.subtle.exportKey('raw', publicKey);
    return new Uint8Array(raw);
  }

  test('returns body string on valid signature', async () => {
    const kp = await generateEd25519Keypair();
    const publicKeyBytes = await exportRawPublicKey((kp as CryptoKeyPair).publicKey);
    const body = '{"event":"test"}';
    const sig = await ed25519Sign(body, (kp as CryptoKeyPair).privateKey);

    const request = makeRequest(body, { 'x-ed-sig': sig });

    const result = await verifyWebhook(request, {
      secret: publicKeyBytes,
      headerName: 'x-ed-sig',
      algorithm: 'ed25519',
      buildSignedPayload: (_ts, b) => b,
    });

    expect(result).toBe(body);
  });

  test('throws on invalid signature', async () => {
    const kp = await generateEd25519Keypair();
    const publicKeyBytes = await exportRawPublicKey((kp as CryptoKeyPair).publicKey);
    const body = '{"event":"test"}';

    // valid base64 but wrong signature
    const wrongSig = btoa('a'.repeat(64));
    const request = makeRequest(body, { 'x-ed-sig': wrongSig });

    await expect(
      verifyWebhook(request, {
        secret: publicKeyBytes,
        headerName: 'x-ed-sig',
        algorithm: 'ed25519',
        buildSignedPayload: (_ts, b) => b,
      })
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });
});

describe('WebhookPresets.stripe()', () => {
  const preset = WebhookPresets.stripe();

  test('parseTimestamp extracts t= from stripe-signature header', () => {
    const ts = preset.parseTimestamp!('t=1234567890,v1=abc123');
    expect(ts).toBe(1234567890);
  });

  test('parseSignature extracts v1= from stripe-signature header', () => {
    const sig = preset.parseSignature!('t=1234567890,v1=abc123def456');
    expect(sig).toBe('abc123def456');
  });

  test('end-to-end: verify a payload signed with the Stripe format', async () => {
    const body = '{"id":"evt_123","type":"payment_intent.created"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${body}`;
    const sig = await hmacSign(payload, TEST_SECRET, 'SHA-256');
    const sigHeader = `t=${timestamp},v1=${sig}`;

    const request = makeRequest(body, { 'stripe-signature': sigHeader });

    const result = await verifyWebhook(request, { ...preset, secret: TEST_SECRET });
    expect(result).toBe(body);
  });
});

describe('WebhookPresets.github()', () => {
  const preset = WebhookPresets.github();

  test('parseSignature strips sha256= prefix', () => {
    const sig = preset.parseSignature!('sha256=abc123def456');
    expect(sig).toBe('abc123def456');
  });

  test('buildSignedPayload uses body only (no timestamp prefix)', () => {
    const payload = preset.buildSignedPayload!(null, 'mybody');
    expect(payload).toBe('mybody');
  });

  test('end-to-end: verify a payload signed with the GitHub format', async () => {
    const body = '{"action":"opened"}';
    const sig = await hmacSign(body, TEST_SECRET, 'SHA-256');
    const sigHeader = `sha256=${sig}`;

    const request = makeRequest(body, { 'x-hub-signature-256': sigHeader });

    const result = await verifyWebhook(request, { ...preset, secret: TEST_SECRET });
    expect(result).toBe(body);
  });
});

describe('WebhookPresets.svix()', () => {
  const preset = WebhookPresets.svix();

  test('parseTimestamp parses svix-timestamp header as integer', () => {
    const ts = preset.parseTimestamp!('1234567890');
    expect(ts).toBe(1234567890);
  });

  test('parseSignature extracts the first v1,-prefixed signature', () => {
    const sig = preset.parseSignature!('v1,abc123base64== v1,other456');
    expect(sig).toBe('abc123base64==');
  });

  test('end-to-end: verify a payload signed with the Svix format', async () => {
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
    const sigHeader = `v1,${sigB64}`;

    const request = makeRequest(body, {
      'svix-signature': sigHeader,
      'svix-timestamp': String(timestamp),
    });

    const result = await verifyWebhook(request, { ...preset, secret: publicKeyBytes });
    expect(result).toBe(body);
  });
});
