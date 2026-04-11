import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/testing')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/testing</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Laravel-grade testing DX on bun:test. HTTP test client, response assertions, unified fakes.</p>

      <h2>HTTP Test Client</h2>
      <pre><code>{`import { TestClient } from '@roost/testing';

const client = new TestClient(app);

const response = await client.get('/api/users');
response.assertOk();

const data = await client
  .actingAs({ id: 'user_123' })
  .post('/api/posts', { title: 'Hello' });
data.assertCreated();`}</code></pre>

      <h2>Response Assertions</h2>
      <pre><code>{`response.assertStatus(200);
response.assertRedirect('/login');
response.assertHeader('content-type', 'application/json');
response.assertForbidden();
response.assertNotFound();
await response.assertJson({ name: 'Alice' });`}</code></pre>

      <h2>Unified Fakes</h2>
      <pre><code>{`import { fakeAll, restoreAll } from '@roost/testing';

fakeAll();    // Agent.fake() + Billing.fake() + Job.fake()
// ... run tests ...
restoreAll(); // clean up all fakes`}</code></pre>
    </div>
  );
}
