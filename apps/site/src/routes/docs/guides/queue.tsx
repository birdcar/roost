import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/queue')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/queue Guides" subtitle="Task-oriented instructions for defining jobs, dispatching, chaining, batching, and testing.">

      <h2>How to define a background job</h2>
      <p>Extend <code>Job&lt;TPayload&gt;</code> with a typed payload interface and implement <code>handle()</code>.</p>
      <CodeBlock title="src/jobs/SendWelcomeEmail.ts">{`import { Job, MaxRetries, Backoff } from '@roost/queue';

interface SendWelcomeEmailPayload {
  userId: string;
  email: string;
  name: string;
}

@MaxRetries(3)
@Backoff('exponential')
export class SendWelcomeEmail extends Job<SendWelcomeEmailPayload> {
  async handle(): Promise<void> {
    const { email, name } = this.payload;

    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: \`Bearer \${env.SENDGRID_KEY}\` },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'welcome@example.com' },
        subject: 'Welcome!',
        content: [{ type: 'text/html', value: \`<p>Hi \${name}, welcome!</p>\` }],
      }),
    });
  }

  async onFailure(error: Error): Promise<void> {
    console.error(\`Failed to send welcome email to \${this.payload.email}:\`, error.message);
  }
}`}</CodeBlock>
      <p>Use <code>this.attempt</code> to access the current retry count inside <code>handle()</code>. Throw any error to trigger the retry flow.</p>

      <h2>How to dispatch jobs</h2>
      <p>Call the static <code>dispatch</code> method. For delayed execution, use <code>dispatchAfter</code> with a delay in seconds.</p>
      <CodeBlock>{`import { SendWelcomeEmail } from '../jobs/SendWelcomeEmail';

// Immediate
await SendWelcomeEmail.dispatch({
  userId: user.attributes.id,
  email: user.attributes.email,
  name: user.attributes.name,
});

// Delayed — dispatch 10 minutes after signup
await SendWelcomeEmail.dispatchAfter(600, {
  userId: user.attributes.id,
  email: user.attributes.email,
  name: user.attributes.name,
});`}</CodeBlock>

      <h2>How to chain and batch jobs</h2>
      <p>Use <code>Job.chain</code> for sequential jobs where each step depends on the previous one, and <code>Job.batch</code> for parallel independent work.</p>
      <CodeBlock>{`import { Job } from '@roost/queue';
import { ProcessOrder } from '../jobs/ProcessOrder';
import { SendReceipt } from '../jobs/SendReceipt';
import { UpdateInventory } from '../jobs/UpdateInventory';

// Chain: runs in order, stops if any job fails
await Job.chain([
  { jobClass: ProcessOrder, payload: { orderId: '123' } },
  { jobClass: SendReceipt, payload: { orderId: '123' } },
  { jobClass: UpdateInventory, payload: { orderId: '123' } },
]);`}</CodeBlock>
      <CodeBlock>{`import { SendWelcomeEmail } from '../jobs/SendWelcomeEmail';

// Batch: runs in parallel, returns a batch ID
const batchId = await Job.batch([
  { jobClass: SendWelcomeEmail, payload: { userId: 'u1', email: 'a@a.com', name: 'Alice' } },
  { jobClass: SendWelcomeEmail, payload: { userId: 'u2', email: 'b@b.com', name: 'Bob' } },
  { jobClass: SendWelcomeEmail, payload: { userId: 'u3', email: 'c@c.com', name: 'Carol' } },
]);`}</CodeBlock>

      <h2>How to handle job failures and retries</h2>
      <p>Configure retry behavior with decorators. Implement <code>onFailure()</code> for cleanup or alerting after all retries are exhausted.</p>
      <CodeBlock>{`import { Job, MaxRetries, Backoff, RetryAfter } from '@roost/queue';

@MaxRetries(5)
@Backoff('exponential')   // Delays: 10s, 20s, 40s, 80s, 160s
@RetryAfter(10)           // Base delay in seconds
export class ProcessPayment extends Job<{ orderId: string; amount: number }> {
  async handle(): Promise<void> {
    if (this.attempt > 1) {
      console.log(\`Retry attempt \${this.attempt} for order \${this.payload.orderId}\`);
    }

    const result = await chargeCard(this.payload.amount);
    if (!result.success) throw new Error(\`Payment declined: \${result.reason}\`);
  }

  async onSuccess(): Promise<void> {
    await Order.where('id', this.payload.orderId)
      .first()
      .then((order) => {
        if (order) {
          order.attributes.status = 'paid';
          return order.save();
        }
      });
  }

  async onFailure(error: Error): Promise<void> {
    // All retries exhausted — notify the team
    await alertSlack(\`Payment failed for order \${this.payload.orderId}: \${error.message}\`);
  }
}`}</CodeBlock>
      <p>Use <code>@Backoff('fixed')</code> with <code>@RetryAfter(30)</code> when retrying after a consistent delay is more appropriate than exponential growth.</p>

      <h2>How to test jobs without dispatching</h2>
      <p>Call <code>Job.fake()</code> to intercept dispatches without sending to the queue. Assert what was dispatched, then restore.</p>
      <CodeBlock title="tests/jobs/SendWelcomeEmail.test.ts">{`import { describe, it, expect } from 'bun:test';
import { SendWelcomeEmail } from '../../src/jobs/SendWelcomeEmail';

describe('SendWelcomeEmail', () => {
  it('is dispatched after signup', async () => {
    SendWelcomeEmail.fake();

    // Trigger the code that dispatches the job
    await signupUser({ email: 'test@example.com', name: 'Test' });

    SendWelcomeEmail.assertDispatched();

    SendWelcomeEmail.restore();
  });

  it('is dispatched with correct payload', async () => {
    SendWelcomeEmail.fake();

    await signupUser({ email: 'alice@example.com', name: 'Alice' });

    SendWelcomeEmail.assertDispatched((job) => {
      return job.payload.email === 'alice@example.com';
    });

    SendWelcomeEmail.restore();
  });

  it('is not dispatched when signup fails', async () => {
    SendWelcomeEmail.fake();

    await signupUser({ email: 'invalid', name: '' }).catch(() => {});

    SendWelcomeEmail.assertNotDispatched();

    SendWelcomeEmail.restore();
  });
});`}</CodeBlock>

    </DocLayout>
  );
}
