# Phase 8 Spec: Edge Utilities + Hardening

**Initiative**: CF Platform Completeness
**Phase**: 8 of 8
**Blocks**: Nothing (final phase)
**Blocked by**: Phase 1 (Production Foundations — core patterns, Middleware interface)
**Status**: Ready to implement

---

## Technical Approach

Three independent components, none blocking the others. Implement and commit each separately.

1. **`HtmlTransformer`** — A chainable wrapper around the `HTMLRewriter` API that encodes common patterns (script injection, meta tags, element replacement/removal, A/B testing) as named methods. Lives in `packages/cloudflare/src/html/`. The underlying `HTMLRewriter` is constant-memory and streaming; `HtmlTransformer` preserves those properties by not buffering — it registers handlers and calls `.transform(response)` at the end of the chain.

2. **Generic webhook verification (`verifyWebhook`)** — Extracts and generalizes the crypto primitives from `packages/billing/src/stripe/webhook.ts` into a new module at `packages/core/src/webhooks/`. Supports HMAC-SHA256, HMAC-SHA512, and Ed25519 with a preset system for common providers. The Stripe implementation in `packages/billing` should be refactored to delegate to the generic verifier rather than maintaining its own crypto. `WebhookMiddleware` verifies the signature before calling the next handler, short-circuiting with a 401 on failure.

3. **`VersionedKVStore`** — Wraps `KVStore` with a content-addressable key scheme. `put(key, value)` stores content at `content:{sha256hex}` and writes a pointer at `ptr:{key}`. `get(key)` follows the pointer. Identical content naturally deduplicates. Content keys carry a TTL so orphaned entries (pointer updated, old content no longer pointed to) expire without explicit deletion.

---

## Feedback Strategy

Inner loop per component:

- `HtmlTransformer`: `bun test --filter cloudflare` after each method added
- Webhook verification: `bun test --filter core` and `bun test --filter billing` after implementing; billing tests must continue to pass with the refactored `verifyStripeWebhook`
- `VersionedKVStore`: `bun test --filter cloudflare`

Full gate before any commit: `bun run typecheck` must pass clean.

---

## File Changes

### New Files

| File | Package | Purpose |
|---|---|---|
| `packages/cloudflare/src/html/transformer.ts` | `@roostjs/cloudflare` | `HtmlTransformer` class |
| `packages/cloudflare/__tests__/html-transformer.test.ts` | `@roostjs/cloudflare` | Tests for `HtmlTransformer` |
| `packages/core/src/webhooks/verify.ts` | `@roostjs/core` | `verifyWebhook`, `WebhookPresets`, `WebhookVerificationError` |
| `packages/core/src/webhooks/middleware.ts` | `@roostjs/core` | `WebhookMiddleware` |
| `packages/core/__tests__/webhooks/verify.test.ts` | `@roostjs/core` | Tests for `verifyWebhook` and presets |
| `packages/core/__tests__/webhooks/middleware.test.ts` | `@roostjs/core` | Tests for `WebhookMiddleware` |
| `packages/cloudflare/src/bindings/versioned-kv.ts` | `@roostjs/cloudflare` | `VersionedKVStore` class |
| `packages/cloudflare/__tests__/versioned-kv.test.ts` | `@roostjs/cloudflare` | Tests for `VersionedKVStore` |

### Modified Files

| File | Package | Change |
|---|---|---|
| `packages/cloudflare/src/index.ts` | `@roostjs/cloudflare` | Export `HtmlTransformer` and `VersionedKVStore` |
| `packages/core/src/index.ts` | `@roostjs/core` | Export `verifyWebhook`, `WebhookPresets`, `WebhookMiddleware`, `WebhookVerificationError` from webhooks module |
| `packages/billing/src/stripe/webhook.ts` | `@roostjs/billing` | Refactor `verifyStripeWebhook` to delegate to `verifyWebhook` with `WebhookPresets.stripe()` |

---

## Implementation Details

---

### Component 1: HtmlTransformer

**File**: `packages/cloudflare/src/html/transformer.ts`

**Overview**

`HtmlTransformer` wraps `HTMLRewriter` to eliminate the boilerplate of constructing element handlers and registering them. Each method adds a handler registration and returns `this` for chaining. `.transform(response)` calls `rewriter.transform(response)` and returns the resulting `Response`. The response body remains a stream — no buffering occurs.

**API surface**

```typescript
export type ScriptPosition = 'head' | 'body';

export interface AbVariant {
  content: string;
  weight: number;
}

export class HtmlTransformer {
  constructor()

  // Injects <script src="..."> at end of <head> or end of <body>
  injectScript(src: string, position?: ScriptPosition): this

  // Sets or replaces <meta name="..."> content in <head>
  setMetaTag(name: string, content: string): this

  // Replaces inner HTML of all elements matching selector
  replaceElement(selector: string, html: string): this

  // Removes all elements matching selector from the document
  removeElement(selector: string): this

  // Replaces inner HTML of selector based on variant assignment
  // assignmentFn receives the request and returns a variant key
  abTest(
    selector: string,
    variants: Record<string, string>,
    assignmentFn: (request: Request) => string
  ): this

  // Applies all registered transforms to the response
  transform(response: Response, request?: Request): Response
}
```

**Key implementation decisions**

- `HTMLRewriter` is constructed once in the constructor and mutated by each method call. This is the correct usage pattern — `HTMLRewriter` is a builder.
- `injectScript`: Use `.on('head', handler)` for `'head'` position and `.on('body', handler)` for `'body'` position. The `onEndTag` callback appends `<script src="..."></script>` before the closing tag so the script appears at the bottom of `<head>` (or `<body>`), which is the conventional injection point. Use `element.append('<script src="..."></script>', { html: true })` on the `end` tag handler — note that `HTMLRewriter` element handlers receive `element` on `element()` and the end tag is handled via `end()`.
- `setMetaTag`: Select `meta[name="${name}"]`. If found, call `element.setAttribute('content', content)`. Also register an `onDocument` handler that appends the `<meta>` tag to `<head>` if the element was never matched (i.e., the tag does not already exist). Track via a closed-over boolean flag.
- `replaceElement`: Use `.on(selector, { element(el) { el.setInnerContent(html, { html: true }); } })`.
- `removeElement`: Use `.on(selector, { element(el) { el.remove(); } })`.
- `abTest`: The `assignmentFn` is called lazily inside the element handler — the handler receives `element` and must call `request` which was closed over. `request` must be passed to `transform(response, request)` when `abTest` is used; if it is absent and `abTest` was registered, throw `Error('request is required when using abTest')`. Inside the handler: `const variantKey = assignmentFn(request); const html = variants[variantKey]; if (html) el.setInnerContent(html, { html: true });`.
- `transform(response, request?)`: Returns `this.rewriter.transform(response)`. The return type is `Response` (a streaming response). Callers `await` the body on their own schedule.
- The `request` parameter on `transform` is optional but required when `abTest` has been registered. A runtime guard checks this at the point `transform` is called.

**Chainable example**

```typescript
const transformed = new HtmlTransformer()
  .injectScript('/analytics.js', 'head')
  .setMetaTag('description', 'Hello from the edge')
  .abTest('#hero', { control: '<h1>Default</h1>', variant: '<h1>New</h1>' }, (req) => {
    return req.headers.get('cf-ipcountry') === 'US' ? 'variant' : 'control';
  })
  .transform(response, request);
```

**Exports**

Add to `packages/cloudflare/src/index.ts`:
```typescript
export { HtmlTransformer } from './html/transformer.js';
export type { ScriptPosition, AbVariant } from './html/transformer.js';
```

---

### Component 2: Generic Webhook Verification

**Files**: `packages/core/src/webhooks/verify.ts`, `packages/core/src/webhooks/middleware.ts`

**Overview**

The Stripe implementation in `packages/billing/src/stripe/webhook.ts` has correct crypto (HMAC-SHA256, timing-safe comparison, timestamp tolerance) but is entirely Stripe-specific in its header parsing. The generic implementation lifts the crypto primitives out and parameterizes the header names, payload construction, algorithm, and timestamp validation.

**`verifyWebhook` options interface**

```typescript
export type WebhookAlgorithm = 'hmac-sha256' | 'hmac-sha512' | 'ed25519';

export interface WebhookVerifyOptions {
  // The shared secret or public key (string → encoded to UTF-8, Uint8Array → used directly)
  secret: string | Uint8Array;

  // Header name containing the signature (e.g. 'stripe-signature', 'x-hub-signature-256')
  headerName: string;

  // Cryptographic algorithm to use
  algorithm: WebhookAlgorithm;

  // Optional: name of the header containing the timestamp (e.g. 'stripe-signature' parses t= inline)
  // If absent, no timestamp validation is performed
  timestampHeader?: string;

  // How to extract the timestamp from the header value. Defaults to parsing the raw value as an integer.
  parseTimestamp?: (headerValue: string) => number;

  // How to extract the signature from the header value. Defaults to treating the entire value as the sig.
  parseSignature?: (headerValue: string) => string;

  // How to construct the signed payload from timestamp + body.
  // Defaults to `${timestamp}.${body}` (Stripe convention).
  // Provide this when the provider uses a different format (e.g. GitHub uses only the body).
  buildSignedPayload?: (timestamp: number | null, body: string) => string;

  // Tolerance window in seconds. Defaults to 300. Pass 0 to disable.
  tolerance?: number;
}
```

**`verifyWebhook` signature**

```typescript
export async function verifyWebhook(
  request: Request,
  options: WebhookVerifyOptions
): Promise<string>
// Returns the raw request body on success (already read — callers parse it themselves)
// Throws WebhookVerificationError on failure
```

The function:
1. Reads `request.text()` to get the body.
2. Extracts the signature header using `options.headerName`.
3. Extracts timestamp (if `options.timestampHeader` is set) and signature from the header using `parseTimestamp` / `parseSignature` (or defaults).
4. Validates timestamp within tolerance if a timestamp was extracted.
5. Builds the signed payload using `buildSignedPayload` (or default `${timestamp}.${body}`).
6. Computes and compares the expected signature using the specified algorithm.
7. Returns the raw body string on success.

**Algorithm implementations**

HMAC-SHA256 and HMAC-SHA512:
```typescript
const hashName = algorithm === 'hmac-sha256' ? 'SHA-256' : 'SHA-512';
const key = await crypto.subtle.importKey(
  'raw',
  secretBytes,
  { name: 'HMAC', hash: hashName },
  false,
  ['sign']
);
const sigBytes = await crypto.subtle.sign('HMAC', key, payloadBytes);
const expected = arrayBufferToHex(sigBytes);
// timingSafeEqual(expected, receivedSignature)
```

Ed25519 (Svix/modern webhooks):
```typescript
const key = await crypto.subtle.importKey(
  'raw',
  secretBytes,
  { name: 'Ed25519' },
  false,
  ['verify']
);
const signatureBytes = hexToArrayBuffer(receivedSignature); // or base64decode for Ed25519
const valid = await crypto.subtle.verify('Ed25519', key, signatureBytes, payloadBytes);
if (!valid) throw new WebhookVerificationError('...');
```

Ed25519 signatures are typically base64-encoded, not hex. `parseSignature` in the Svix preset handles this by base64-decoding the value. The `timingSafeEqual` function used for HMAC is not needed for Ed25519 — `crypto.subtle.verify` is already constant-time.

**`timingSafeEqual` and `arrayBufferToHex`**

Copy the implementations from `packages/billing/src/stripe/webhook.ts`. These are two pure utility functions — no dependency on Stripe-specific types. They become private helpers in `verify.ts`.

**`WebhookPresets`**

```typescript
export const WebhookPresets = {
  stripe(): WebhookVerifyOptions {
    return {
      secret: '', // caller must override
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
      buildSignedPayload: (_timestamp, body) => body, // GitHub does not use timestamp
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
        // svix-signature: v1,<base64sig> (may have multiple, space-separated)
        const sigs = header.split(' ');
        const v1 = sigs.find((s) => s.startsWith('v1,'));
        return v1?.slice(3) ?? '';
      },
      buildSignedPayload: (timestamp, body) => `${timestamp}.${body}`,
      tolerance: 300,
    };
  },
} as const;
```

`parseKVHeader` is a private helper (already exists as `parseSignatureHeader` in the Stripe impl — inline copy and rename):
```typescript
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
```

Note: the original uses `part.trim().split('=')` which breaks for base64 values containing `=`. Use `indexOf` instead.

**Preset usage pattern**

Callers spread the preset and override `secret`:
```typescript
await verifyWebhook(request, { ...WebhookPresets.stripe(), secret: env.STRIPE_WEBHOOK_SECRET });
```

**`WebhookMiddleware`**

```typescript
// packages/core/src/webhooks/middleware.ts

import type { Middleware } from '../types.js';
import { verifyWebhook, WebhookVerificationError } from './verify.js';
import type { WebhookVerifyOptions } from './verify.js';

export class WebhookMiddleware implements Middleware {
  constructor(private options: WebhookVerifyOptions) {}

  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    try {
      const body = await verifyWebhook(request, this.options);
      // Attach the pre-read body so the downstream handler doesn't need to re-read
      const enriched = new Request(request, { body });
      return next(enriched);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }
  }
}
```

The middleware calls `verifyWebhook`, which reads the body. To avoid the "body already consumed" problem, it constructs a new `Request` with `body` (the pre-read string) and passes that to `next`. Downstream handlers that call `request.text()` will receive the body correctly.

**Refactoring `verifyStripeWebhook`**

After implementing the generic verifier, update `packages/billing/src/stripe/webhook.ts` to delegate:

```typescript
import { verifyWebhook, WebhookPresets, WebhookVerificationError } from '@roostjs/core';
import type { WebhookEvent } from '../types.js';

export { WebhookVerificationError };

export async function verifyStripeWebhook(
  request: Request,
  secret: string
): Promise<WebhookEvent> {
  const body = await verifyWebhook(request, { ...WebhookPresets.stripe(), secret });
  return JSON.parse(body) as WebhookEvent;
}
```

The public API of `verifyStripeWebhook` is unchanged — same signature, same error type — so existing callers in `@roostjs/billing` are unaffected. The existing `webhook.test.ts` tests continue to pass without modification.

**Exports from `@roostjs/core`**

Add to `packages/core/src/index.ts`:
```typescript
export { verifyWebhook, WebhookPresets, WebhookVerificationError } from './webhooks/verify.js';
export { WebhookMiddleware } from './webhooks/middleware.js';
export type { WebhookVerifyOptions, WebhookAlgorithm } from './webhooks/verify.js';
```

---

### Component 3: VersionedKVStore

**File**: `packages/cloudflare/src/bindings/versioned-kv.ts`

**Overview**

`VersionedKVStore` wraps `KVStore` with content-addressable storage. Every call to `put(key, value)` hashes the serialized value with SHA-256, stores the content at `content:{hash}`, and writes `hash` as the value of the pointer key `ptr:{key}`. `get(key)` reads `ptr:{key}` to get the current hash, then reads `content:{hash}`.

Identical content writes deduplicate automatically: if two different logical keys hold the same value, they share a single `content:{hash}` entry. Updating a key to the same value is a no-op at the storage level (the pointer already points at the correct hash; the content key already exists).

Old content keys expire naturally via TTL — no explicit deletion is needed. This is the correct invalidation strategy for KV given its eventual consistency model.

**Key scheme**

```
ptr:{key}          → stores the current content hash (string)
content:{hash}     → stores the serialized value, with TTL
```

Example: `put('config', { theme: 'dark' })` writes:
- `content:a3f2...` → `'{"theme":"dark"}'` with TTL
- `ptr:config` → `'a3f2...'`

**API surface**

```typescript
export interface VersionedKVOptions {
  // TTL in seconds for content keys. Defaults to 86400 (24h).
  // Content keys that are no longer pointed to expire after this duration.
  contentTtl?: number;
}

export class VersionedKVStore {
  constructor(kv: KVStore | KVNamespace, options?: VersionedKVOptions)

  // Hashes value, stores at content:{hash}, updates ptr:{key}
  async put<T>(key: string, value: T): Promise<string>
  // Returns the hash (version) of the stored content

  // Reads ptr:{key} → content:{hash} → deserializes
  async get<T>(key: string): Promise<T | null>

  // Returns the current hash for the key, or null if key does not exist
  async getVersion(key: string): Promise<string | null>

  // Returns true if the current stored hash matches the provided hash
  async isCurrent(key: string, hash: string): Promise<boolean>

  // Removes the pointer key. Content key expires via TTL.
  async delete(key: string): Promise<void>
}
```

**Implementation**

Constructor: accepts either a `KVStore` instance or a raw `KVNamespace` (wraps the raw namespace in `new KVStore(kv)` if detected via duck-typing: `'get' in kv && 'put' in kv && !('putJson' in kv)`).

`put<T>(key, value)`:
1. Serialize: `const serialized = JSON.stringify(value)`.
2. Hash: `const hash = await sha256hex(serialized)`.
3. Store content: `await this.kv.put('content:' + hash, serialized, { expirationTtl: this.contentTtl })`.
4. Update pointer: `await this.kv.put('ptr:' + key, hash)` — no TTL on pointers; they are permanent until `delete` is called.
5. Return `hash`.

`get<T>(key)`:
1. `const hash = await this.kv.get('ptr:' + key)`.
2. If null, return null.
3. `const content = await this.kv.get('content:' + hash)`.
4. If null (content expired before pointer was updated — edge case on very short TTLs), return null.
5. Return `JSON.parse(content) as T`.

`getVersion(key)`:
1. Return `await this.kv.get('ptr:' + key)`.

`isCurrent(key, hash)`:
1. `const current = await this.getVersion(key)`.
2. Return `current === hash`.

`delete(key)`:
1. `await this.kv.delete('ptr:' + key)`.
2. Content key expires naturally. No explicit content delete.

`sha256hex` helper (private, async):
```typescript
async function sha256hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

**Default TTL rationale**

The default `contentTtl` of 86400 seconds (24 hours) means orphaned content entries (pointer updated to a new hash, old content key still exists) survive for at most 24 hours. This is acceptable for application config, feature flag payloads, and similar use cases. For high-frequency writes (thousands of unique values per day), increase the TTL awareness or use `VersionedKVStore` with a smaller key space. Document this trade-off in a comment on the class.

**`put` re-write behavior**

If the pointer already points at the same hash (same content), `put` still overwrites the content key (resetting its TTL to `contentTtl`). This is intentional: it keeps frequently-read content from expiring. The cost is one extra KV write per `put` call even when content has not changed, which is acceptable given KV's write pricing.

**Exports**

Add to `packages/cloudflare/src/index.ts`:
```typescript
export { VersionedKVStore } from './bindings/versioned-kv.js';
export type { VersionedKVOptions } from './bindings/versioned-kv.js';
```

---

## Testing Requirements

### HtmlTransformer tests (`packages/cloudflare/__tests__/html-transformer.test.ts`)

The `HTMLRewriter` API is available in the Workers runtime and in Miniflare/the Cloudflare test environment. Tests construct a `Response` with an HTML string body, apply transforms, and read the result via `response.text()`.

- `injectScript('head')` appends `<script>` tag before `</head>`
- `injectScript('body')` appends `<script>` tag before `</body>`
- `injectScript` defaults to `'head'` when position is omitted
- `setMetaTag` updates `content` on an existing `<meta name="...">` element
- `setMetaTag` injects a new `<meta>` tag when the element does not exist in the document
- `replaceElement` replaces inner HTML of matching elements
- `replaceElement` replaces multiple matching elements when selector matches more than one
- `removeElement` removes matching elements from the document
- `removeElement` is a no-op when selector matches nothing
- `abTest` applies the correct variant's content based on the assignment function's return value
- `abTest` throws when `transform` is called without a `request` argument
- `transform` returns a streaming `Response` (not buffered)
- Chaining multiple methods applies all transforms

### Webhook verification tests (`packages/core/__tests__/webhooks/verify.test.ts`)

Test the generic verifier and each preset independently. Use `crypto.subtle` directly in test setup to generate valid signatures (same pattern as `packages/billing/__tests__/webhook.test.ts`).

**`verifyWebhook` with HMAC-SHA256**:
- Returns body string on valid signature
- Throws `WebhookVerificationError` when signature header is missing
- Throws `WebhookVerificationError` when signature does not match
- Throws `WebhookVerificationError` when timestamp is outside tolerance
- Does not validate timestamp when `tolerance` is 0
- Does not validate timestamp when `timestampHeader` is absent

**`verifyWebhook` with HMAC-SHA512**:
- Returns body string on valid signature
- Throws on invalid signature (same shape as SHA256 tests)

**`verifyWebhook` with Ed25519**:
- Returns body string on valid signature
- Throws on invalid signature

**`WebhookPresets.stripe()`**:
- `parseTimestamp` extracts `t=` from `stripe-signature` header
- `parseSignature` extracts `v1=` from `stripe-signature` header
- End-to-end: verify a payload signed with the Stripe format

**`WebhookPresets.github()`**:
- `parseSignature` strips `sha256=` prefix
- `buildSignedPayload` uses body only (no timestamp prefix)
- End-to-end: verify a payload signed with the GitHub format

**`WebhookPresets.svix()`**:
- `parseTimestamp` parses `svix-timestamp` header as integer
- `parseSignature` extracts the first `v1,`-prefixed signature
- End-to-end: verify a payload signed with the Svix format

### WebhookMiddleware tests (`packages/core/__tests__/webhooks/middleware.test.ts`)

- Returns 401 with JSON error body when signature is invalid
- Calls `next` with a request that has the body pre-read when signature is valid
- Downstream handler can call `request.text()` and receive the original body
- Re-throws non-`WebhookVerificationError` exceptions (does not swallow unexpected errors)
- Works with each preset (at least one end-to-end test per preset)

### Billing refactor regression (`packages/billing/__tests__/webhook.test.ts`)

No changes to this test file — all existing tests must pass after the refactor. This is the regression gate for Component 2.

### VersionedKVStore tests (`packages/cloudflare/__tests__/versioned-kv.test.ts`)

Use the `createMockKV()` helper pattern from `packages/cloudflare/__tests__/kv.test.ts` — construct a `KVStore` wrapping a mock `KVNamespace`.

- `put` writes a content key with prefix `content:` and a pointer key with prefix `ptr:`
- `put` returns the SHA-256 hex hash of the serialized value
- `get` returns the original value
- `get` returns null for a key that was never written
- `get` returns null when the pointer exists but the content key has expired (simulate by deleting the content key from the mock after `put`)
- `put` with the same value writes the same hash (deduplication)
- Two different keys with identical values share the same `content:` key
- `getVersion` returns the current hash
- `getVersion` returns null for an unknown key
- `isCurrent` returns true when the hash matches the current version
- `isCurrent` returns false when the hash does not match
- `delete` removes the pointer key; subsequent `get` returns null
- Content key TTL: verify the content key is written with `expirationTtl` set to the configured value
- Accepts a raw `KVNamespace` in addition to a `KVStore` instance

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `HtmlTransformer.transform()` called without `request` when `abTest` registered | Throw `Error('request is required when using abTest — pass the request to transform(response, request)')` |
| `abTest` assignment function returns a key not present in `variants` | No-op: element content is unchanged. Log nothing — the caller controls the function. |
| `verifyWebhook` called with partial preset (secret not overridden, remains empty string) | HMAC computed with empty key — will not match any real signature. The verification fails with `WebhookVerificationError`. No special handling needed; the caller's mistake produces an authentication failure, which is the safe outcome. |
| `verifyWebhook` given an Ed25519 secret in hex (not base64) | `parseSignature` in the Svix preset expects base64; a hex-encoded signature will fail to decode and produce an invalid `Uint8Array`. Throw a descriptive `WebhookVerificationError('Ed25519 signature must be base64-encoded')` inside the decode step. |
| `VersionedKVStore.get()` when content key is missing (expired before pointer updated) | Return null. Do not delete the stale pointer — the next `put` will overwrite it. Log nothing; this is a normal TTL expiry scenario. |
| `VersionedKVStore.put()` when `JSON.stringify(value)` throws (circular reference) | The error propagates uncaught. `VersionedKVStore` does not swallow serialization errors — the caller is responsible for passing serializable values. |
| `WebhookMiddleware` receives a non-`WebhookVerificationError` thrown by `verifyWebhook` | Re-throw. The middleware only intercepts `WebhookVerificationError`; unexpected errors (network, runtime) are not swallowed. |

---

## Failure Modes

| Failure | Impact | Mitigation |
|---|---|---|
| `HTMLRewriter` not available in test environment | All `HtmlTransformer` tests fail | Use `workerd` test runner or Miniflare, which provides `HTMLRewriter`. If unavailable, tests will skip/fail clearly rather than silently. |
| `HTMLRewriter` selector does not match | Transform is silently skipped | Expected behavior — document in JSDoc. No silent data corruption; untransformed content is returned. |
| Webhook secret rotated while requests in-flight | Requests signed with old secret fail verification | Not a framework concern — standard webhook secret rotation requires a brief dual-verify window, which callers must implement at the application layer. |
| Ed25519 key format mismatch (raw vs SPKI) | `crypto.subtle.importKey` throws | Svix uses raw 32-byte keys, which is what the preset uses. If a provider uses SPKI format, the caller must provide a custom `verify` function (not currently supported — document as a known limitation). |
| `VersionedKVStore` content TTL too short for write frequency | Reads miss content keys that have expired | Default 24h TTL is generous. Applications writing more than once per day per key should use standard `KVStore` instead. Document the trade-off. |
| Two concurrent `put` calls for the same key with different values | The pointer ends up pointing to whichever write completes last — standard last-writer-wins KV behavior | No mitigation. KV does not support atomic compare-and-swap. Document that `VersionedKVStore` is not suitable for concurrent-write scenarios without external coordination. |
| `parseKVHeader` in webhook presets splits on first `=` but value contains `=` | Incorrect parse, signature mismatch | Fixed by using `indexOf('=')` instead of `split('=')` — explicitly called out in the implementation above. The original Stripe implementation has this latent bug; fix it in the generic implementation. |

---

## Validation Commands

```bash
# Per-component inner loop
bun test --filter cloudflare    # HtmlTransformer + VersionedKVStore
bun test --filter core          # verifyWebhook + WebhookMiddleware
bun test --filter billing       # regression gate for refactored verifyStripeWebhook

# Full gate before any commit
bun run typecheck
bun test --filter cloudflare
bun test --filter core
bun test --filter billing
```
