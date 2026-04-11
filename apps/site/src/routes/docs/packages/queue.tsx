import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/queue')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/queue</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Laravel Horizon-inspired job processing on Cloudflare Queues. Class-based jobs with typed payloads, dispatch, chain, batch, retry, and dead letter handling.</p>

      <h2>Defining Jobs</h2>
      <pre><code>{`import { Job } from '@roost/queue';

class SendWelcomeEmail extends Job<{ email: string; name: string }> {
  async handle() {
    const { email, name } = this.payload;
    // Send the email
  }
}`}</code></pre>

      <h2>Dispatching</h2>
      <pre><code>{`await SendWelcomeEmail.dispatch({ email: 'alice@test.com', name: 'Alice' });

// Delayed
await SendWelcomeEmail.dispatchAfter(60, { email: '...', name: '...' });

// Chain: run in sequence
await Job.chain([
  { jobClass: ProcessOrder, payload: { orderId: '123' } },
  { jobClass: SendReceipt, payload: { orderId: '123' } },
]);`}</code></pre>

      <h2>Testing</h2>
      <pre><code>{`SendWelcomeEmail.fake();
await SendWelcomeEmail.dispatch({ email: 'test@test.com', name: 'Test' });
SendWelcomeEmail.assertDispatched();
SendWelcomeEmail.restore();`}</code></pre>
    </div>
  );
}
