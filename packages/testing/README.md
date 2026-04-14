# @roostjs/testing

Test utilities for Roost applications — HTTP client, suite setup, and fake helpers for external services.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add -d @roostjs/testing
```

## Quick Start

```typescript
import { describe, test, beforeAll, afterAll } from 'bun:test';
import { setupTestSuite } from '@roostjs/testing';
import { Application } from '@roostjs/core';

const suite = setupTestSuite(() => Application.create({}));

beforeAll(suite.beforeAll);
afterAll(suite.afterAll);

describe('users API', () => {
  test('GET /users returns 200', async () => {
    const { client } = suite.getContext();

    await client.get('/users').then((r) => r.assertOk());
  });

  test('authenticated request', async () => {
    const { client } = suite.getContext();

    const response = await client
      .actingAs({ id: 'user_123' })
      .get('/me');

    await response.assertJson({ id: 'user_123' });
  });
});
```

## Features

- `TestClient` — fluent HTTP client that drives `app.handle()` directly, no network required
- Chainable response assertions: `assertOk()`, `assertCreated()`, `assertNotFound()`, `assertForbidden()`, `assertRedirect(to?)`, `assertHeader(name, value?)`, `assertJson(expected)`
- `actingAs({ id })` injects `x-test-user-id` header; `withHeaders({})` for arbitrary headers
- `setupTestSuite` wires `beforeAll` / `afterAll` hooks, boots the app, and calls `fakeAll()` / `restoreAll()` automatically
- `fakeAll` / `restoreAll` stub out AI agents, billing, and queue jobs if those packages are present — safe to call when they're not

## API

```typescript
// Suite setup
setupTestSuite(createApp?: () => Application): {
  getContext: () => { app: Application; client: TestClient };
  beforeAll: () => Promise<void>;
  beforeEach: () => void;
  afterAll: () => void;
}

// HTTP client
class TestClient {
  actingAs(user: { id: string }): this
  withHeaders(headers: Record<string, string>): this
  get(path: string): Promise<TestResponse>
  post(path: string, body?: unknown): Promise<TestResponse>
  put(path: string, body?: unknown): Promise<TestResponse>
  patch(path: string, body?: unknown): Promise<TestResponse>
  delete(path: string): Promise<TestResponse>
}

// Response assertions (all chainable)
class TestResponse {
  assertStatus(n: number): this
  assertOk(): this       assertCreated(): this    assertNoContent(): this
  assertNotFound(): this assertForbidden(): this  assertUnauthorized(): this
  assertRedirect(to?: string): this
  assertHeader(name: string, value?: string): this
  assertJson(expected: Record<string, unknown>): Promise<this>
  json<T>(): Promise<T>
  text(): Promise<string>
}

// Fake helpers
fakeAll(): void     // stubs @roostjs/ai, @roostjs/billing, @roostjs/queue
restoreAll(): void  // restores all stubs
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/testing](https://roost.birdcar.dev/docs/reference/testing)

## License

MIT
