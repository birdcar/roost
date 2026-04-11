import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/testing')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/testing Guides" subtitle="Task-oriented instructions for HTTP tests, response assertions, fakes, and database isolation.">

      <h2>How to write HTTP tests with TestClient</h2>
      <p>Create a <code>TestClient</code> and call HTTP methods directly. The client handles application bootstrapping automatically.</p>
      <CodeBlock title="tests/api/posts.test.ts">{`import { describe, it, expect } from 'bun:test';
import { TestClient } from '@roost/testing';

describe('POST /api/posts', () => {
  it('creates a post', async () => {
    const client = new TestClient();

    const response = await client
      .post('/api/posts')
      .json({ title: 'Hello', body: 'World' });

    response.assertCreated();
  });

  it('requires authentication', async () => {
    const client = new TestClient();
    const response = await client.get('/dashboard');
    response.assertUnauthorized();
  });

  it('accepts authenticated requests', async () => {
    const client = new TestClient();

    const response = await client
      .actingAs({ id: 'user_123', email: 'alice@example.com' })
      .get('/dashboard');

    response.assertOk();
  });
});`}</CodeBlock>
      <p>Pass custom headers with <code>.withHeader()</code> or form data with <code>.form()</code>. All request builder methods are chainable.</p>

      <h2>How to assert on responses</h2>
      <p>Use the assertion methods on the response object. They throw on failure with descriptive messages.</p>
      <CodeBlock>{`const response = await client.get('/api/users/1');

// Status
response.assertOk();            // 200
response.assertCreated();       // 201
response.assertBadRequest();    // 400
response.assertUnauthorized();  // 401
response.assertForbidden();     // 403
response.assertNotFound();      // 404
response.assertStatus(422);     // Any specific status

// Headers
response.assertHeader('content-type', 'application/json');
response.assertHeaderMissing('x-debug');

// Redirect
response.assertRedirect('/login');
response.assertRedirect((url) => url.includes('/auth'));

// JSON body — partial match or callback
await response.assertJson({ name: 'Alice' });
await response.assertJson((data) => {
  expect(data.id).toBeTruthy();
  expect(data.email).toBe('alice@example.com');
});

// Raw text / json
const text = await response.text();
const data = await response.json<{ users: User[] }>();`}</CodeBlock>

      <h2>How to use fakes for unit testing</h2>
      <p>Use <code>fakeAll()</code> to stub all external services at once, or fake individual services selectively.</p>
      <CodeBlock title="tests/signup.test.ts">{`import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TestClient, fakeAll, restoreAll } from '@roost/testing';
import { SendWelcomeEmail } from '../src/jobs/SendWelcomeEmail';
import { BillingFake } from '@roost/billing';

describe('User signup', () => {
  beforeEach(() => fakeAll());
  afterEach(() => restoreAll());

  it('dispatches welcome email', async () => {
    const client = new TestClient();

    await client.post('/signup').json({
      name: 'Alice',
      email: 'alice@example.com',
    });

    // Jobs are faked — assert dispatch without actual queue call
    SendWelcomeEmail.assertDispatched((job) => {
      return job.payload.email === 'alice@example.com';
    });
  });

  it('creates a billing customer', async () => {
    const client = new TestClient();
    const billing = new BillingFake();

    await client.post('/signup').json({ name: 'Bob', email: 'bob@example.com' });

    const customer = billing.customers.find((c) => c.email === 'bob@example.com');
    expect(customer).toBeDefined();
  });
});`}</CodeBlock>
      <p>To fake only specific services, call their individual fake methods (<code>SendWelcomeEmail.fake()</code>) rather than <code>fakeAll()</code>.</p>

      <h2>How to test with a fresh database</h2>
      <p>Use <code>createTestApp</code> with a fresh in-memory D1 database for each test run to avoid state leaking between tests.</p>
      <CodeBlock>{`import { createTestApp } from '@roost/testing';
import { TestClient } from '@roost/testing';

// Create a fresh app with test configuration
const app = await createTestApp({
  env: {
    WORKOS_API_KEY: 'sk_test_...',
    SESSION_SECRET: 'test-secret',
  },
  config: {
    auth: { redirectUrl: 'http://localhost:8787/auth/callback' },
    database: { default: 'd1' },
  },
});

const client = new TestClient(app);`}</CodeBlock>
      <p>For test isolation, run migrations before each suite and use a teardown to clear tables:</p>
      <CodeBlock>{`import { describe, it, beforeAll, afterEach } from 'bun:test';

describe('User API', () => {
  beforeAll(async () => {
    // Run migrations on the test database
    await runMigrations(testDb);
  });

  afterEach(async () => {
    // Clear tables between tests for isolation
    await testDb.run('DELETE FROM users');
    await testDb.run('DELETE FROM posts');
  });

  it('lists users', async () => {
    await User.create({ name: 'Alice', email: 'alice@example.com' });
    const response = await client.get('/api/users');
    response.assertOk();
    const data = await response.json<{ users: unknown[] }>();
    expect(data.users.length).toBe(1);
  });
});`}</CodeBlock>

    </DocLayout>
  );
}
