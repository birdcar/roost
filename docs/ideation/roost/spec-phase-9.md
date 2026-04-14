# Implementation Spec: Roost Framework - Phase 9

**Contract**: ./contract.md
**PRD**: ./prd-phase-9.md
**Estimated Effort**: M

## Technical Approach

Phase 9 creates @roostjs/testing — the unified testing package that ties together the per-package fakes (from Phases 5-7) and adds HTTP test client, database helpers, and factory integration. It's built on bun:test and designed so that writing a test in Roost feels like writing a test in Laravel.

The key abstraction is the `TestCase` helper that boots a test Application instance, sets up database refresh, and provides request helpers. Individual fakes (Agent.fake, Billing.fake, Job.fake) are already implemented in their respective packages — this phase orchestrates them and adds cross-cutting concerns.

## Feedback Strategy

**Inner-loop command**: `bun test --filter packages/testing`

**Playground**: bun:test suite with tests that test the testing utilities themselves (meta-tests).

**Why this approach**: Testing utilities are library code — tests are the feedback loop.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/testing/package.json` | @roostjs/testing package manifest |
| `packages/testing/tsconfig.json` | TS config |
| `packages/testing/src/index.ts` | Public API exports |
| `packages/testing/src/client.ts` | HTTP test client |
| `packages/testing/src/database.ts` | Database test helpers |
| `packages/testing/src/factories.ts` | Factory integration helpers |
| `packages/testing/src/fakes.ts` | Unified fake orchestration |
| `packages/testing/src/matchers.ts` | Custom bun:test matchers |
| `packages/testing/src/setup.ts` | Test setup/teardown helpers |
| `packages/testing/__tests__/client.test.ts` | HTTP client tests |
| `packages/testing/__tests__/database.test.ts` | Database helper tests |
| `packages/testing/__tests__/matchers.test.ts` | Matcher tests |

## Implementation Details

### 1. HTTP Test Client

**Pattern to follow**: `packages/core/src/application.ts` (Application.handle)

**Overview**: Sends requests through the Application without HTTP. Creates a real Application instance, sends a Request object, and returns a Response wrapper with assertion methods.

```typescript
class TestClient {
  private app: Application;
  private authUser?: User;
  private headers: Record<string, string> = {};

  constructor(app: Application) { this.app = app; }

  actingAs(user: User): this {
    this.authUser = user;
    return this;
  }

  withHeaders(headers: Record<string, string>): this {
    Object.assign(this.headers, headers);
    return this;
  }

  async get(path: string): Promise<TestResponse> {
    return this.request('GET', path);
  }

  async post(path: string, body?: unknown): Promise<TestResponse> {
    return this.request('POST', path, body);
  }

  async put(path: string, body?: unknown): Promise<TestResponse>;
  async patch(path: string, body?: unknown): Promise<TestResponse>;
  async delete(path: string): Promise<TestResponse>;

  private async request(method: string, path: string, body?: unknown): Promise<TestResponse> {
    const url = new URL(path, 'http://localhost');
    const headers = new Headers(this.headers);

    if (this.authUser) {
      // Inject auth session into request context
      headers.set('x-test-user-id', this.authUser.id);
    }

    if (body) {
      headers.set('content-type', 'application/json');
    }

    const request = new Request(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const response = await this.app.handle(request);
    return new TestResponse(response);
  }
}

class TestResponse {
  constructor(private response: Response) {}

  get status(): number { return this.response.status; }

  assertStatus(expected: number): this;
  assertOk(): this; // 200
  assertCreated(): this; // 201
  assertNoContent(): this; // 204
  assertNotFound(): this; // 404
  assertForbidden(): this; // 403
  assertUnauthorized(): this; // 401

  assertJson(expected: Record<string, unknown>): this;
  assertJsonPath(path: string, value: unknown): this;
  assertRedirect(to?: string): this;
  assertHeader(name: string, value?: string): this;

  async json<T = unknown>(): Promise<T>;
  async text(): Promise<string>;
}
```

**Key decisions**:
- `actingAs(user)` injects auth via a test-only header, recognized by auth middleware in test mode. No actual WorkOS session.
- TestResponse assertions are chainable for fluent test writing.
- No real HTTP server — requests go directly through Application.handle().

**Implementation steps**:
1. Implement TestClient with request methods
2. Implement TestResponse with assertion methods
3. Implement actingAs with test-mode auth injection
4. Test: GET returns 200, POST creates resource, actingAs bypasses auth

**Feedback loop**:
- **Playground**: `packages/testing/__tests__/client.test.ts`
- **Experiment**: Create a minimal test Application with one route, use TestClient to hit it
- **Check command**: `bun test --filter client`

---

### 2. Database Helpers

**Pattern to follow**: `packages/orm/src/` (ORM model and migration patterns)

**Overview**: Helpers for managing database state in tests — refresh between tests, assert on database content, seed data.

```typescript
// Setup helper — call in beforeEach
async function refreshDatabase(app: Application): Promise<void> {
  const db = app.container.resolve(Database);
  // Truncate all user tables (not _migrations)
  const tables = await db.listTables();
  for (const table of tables.filter(t => !t.startsWith('_'))) {
    await db.execute(`DELETE FROM ${table}`);
  }
}

// Assertions
async function assertDatabaseHas(
  app: Application, table: string, where: Record<string, unknown>
): Promise<void>;

async function assertDatabaseMissing(
  app: Application, table: string, where: Record<string, unknown>
): Promise<void>;

async function assertDatabaseCount(
  app: Application, table: string, count: number
): Promise<void>;
```

**Key decisions**:
- `refreshDatabase` truncates rather than drops+recreates — faster, keeps schema.
- D1 in local dev (via Miniflare) supports transactions, so we attempt transaction wrapping where possible.
- Assertions query D1 directly — they don't go through the ORM to avoid masking bugs.

---

### 3. Factory Integration

**Overview**: Convenience wrappers around @roostjs/orm factories for test use.

```typescript
function factory<T extends typeof Model>(
  model: T, count?: number
): FactoryBuilder<InstanceType<T>> {
  const f = model.factory();
  return count ? f.count(count) : f;
}

// Usage in tests
const user = await factory(User).create();
const users = await factory(User, 5).create();
const admin = await factory(User).state('admin').create();
const userWithPosts = await factory(User).with('posts', 3).create();
```

---

### 4. Unified Fakes

**Overview**: Single function to fake all external services at once.

```typescript
function fakeAll(): void {
  Agent.fake();
  Billing.fake();
  Job.fake();
}

function restoreAll(): void {
  Agent.restore();
  Billing.restore();
  Job.restore();
}
```

---

### 5. Custom bun:test Matchers

**Overview**: Extends bun:test's expect with Roost-specific matchers.

```typescript
import { expect } from 'bun:test';

// Register custom matchers
expect.extend({
  toHaveStatus(response: TestResponse, expected: number) {
    const pass = response.status === expected;
    return { pass, message: () => `expected status ${expected}, got ${response.status}` };
  },
  // ... more matchers
});

// Usage
expect(response).toHaveStatus(200);
expect(response).toContainJson({ email: 'test@test.com' });
```

---

### 6. Test Setup Helper

**Overview**: A `describe.roost()` wrapper that auto-configures the test environment.

```typescript
function describeRoost(name: string, fn: (ctx: TestContext) => void) {
  describe(name, () => {
    let app: Application;
    let client: TestClient;

    beforeAll(async () => {
      app = await createTestApplication();
      client = new TestClient(app);
      fakeAll();
    });

    beforeEach(async () => {
      await refreshDatabase(app);
    });

    afterAll(() => {
      restoreAll();
    });

    fn({ app, client, factory });
  });
}

// Usage
describeRoost('User API', ({ client, factory }) => {
  test('lists users', async () => {
    await factory(User, 3).create();
    const response = await client.get('/api/users');
    response.assertOk();
    response.assertJsonPath('data.length', 3);
  });
});
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/testing/__tests__/client.test.ts` | Request methods, auth injection, response assertions |
| `packages/testing/__tests__/database.test.ts` | refreshDatabase, assertDatabaseHas/Missing/Count |
| `packages/testing/__tests__/matchers.test.ts` | Custom matcher registration and behavior |

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| TestClient request to non-existent route | TestResponse wraps 404 — test asserts expected status |
| assertDatabaseHas finds no match | Throws with table, conditions, and actual row count |
| Factory for model without factory class | Throw `NoFactoryDefinedError` with model name |
| fakeAll called with package not installed | Skip silently — billing fake is no-op if @roostjs/billing isn't in deps |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| TestClient | Stale app state between tests | Forgot refreshDatabase | Tests pass individually, fail together | describeRoost auto-refreshes |
| Database helpers | D1 schema drift | Migration not run in test env | assertDatabaseHas queries wrong schema | Test bootstrap runs migrations |
| Fakes | Fake not restored | Test crashes before afterAll | Subsequent tests hit real services | Use try/finally in setup, or process-level cleanup |

## Validation Commands

```bash
# Test the testing package
bun test --filter packages/testing

# Type check
bun run --filter @roostjs/testing tsc --noEmit
```
