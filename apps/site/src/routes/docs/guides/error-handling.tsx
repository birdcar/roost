import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/error-handling')({ component: Page });

function Page() {
  return (
    <DocLayout title="Error Handling" subtitle="Task-oriented instructions for handling errors in routes, jobs, and across the stack.">

      <h2>How to handle errors in routes</h2>
      <p>Wrap route handlers in a try/catch and return a structured error response. For consistent error shapes, use a shared error formatter.</p>
      <CodeBlock title="src/lib/errors.ts">{`export function errorResponse(message: string, status: number, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}`}</CodeBlock>
      <CodeBlock title="src/routes/api/users/$id.ts">{`import { ModelNotFoundError } from '@roost/orm';
import { errorResponse } from '../../lib/errors';

export async function GET(request: Request, { params }) {
  try {
    const user = await User.findOrFail(params.id);
    return Response.json(user.attributes);
  } catch (error) {
    if (error instanceof ModelNotFoundError) {
      return errorResponse('User not found', 404);
    }
    console.error('GET /api/users/:id failed', error);
    return errorResponse('Internal server error', 500);
  }
}`}</CodeBlock>
      <p>In TanStack Start route loaders, throw a <code>redirect()</code> or use the error boundary pattern. Thrown non-redirect errors propagate to the nearest <code>errorComponent</code>.</p>
      <CodeBlock title="src/routes/dashboard.tsx">{`import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard')({
  loader: async ({ context }) => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: '/auth/login' });
    return { user };
  },
  errorComponent: ({ error }) => (
    <div>Something went wrong: {error.message}</div>
  ),
  component: DashboardPage,
});`}</CodeBlock>

      <h2>How to handle errors in background jobs</h2>
      <p>Throw from <code>handle()</code> to trigger the retry flow. Implement <code>onFailure()</code> for cleanup after all retries are exhausted.</p>
      <CodeBlock title="src/jobs/ProcessPayment.ts">{`import { Job, MaxRetries, Backoff } from '@roost/queue';

@MaxRetries(3)
@Backoff('exponential')
export class ProcessPayment extends Job<{ orderId: string }> {
  async handle(): Promise<void> {
    const result = await paymentProvider.charge(this.payload.orderId);

    if (result.status === 'declined') {
      // Throw to trigger retry
      throw new Error(\`Payment declined: \${result.reason}\`);
    }

    if (result.status === 'error') {
      // Non-retriable error — still throw but you can inspect this.attempt
      throw new Error(\`Payment provider error: \${result.code}\`);
    }
  }

  async onFailure(error: Error): Promise<void> {
    // Called only after all retries are exhausted
    await Order.where('id', this.payload.orderId).first().then((order) => {
      if (order) {
        order.attributes.status = 'payment_failed';
        return order.save();
      }
    });

    console.error(\`Order \${this.payload.orderId} payment permanently failed:\`, error.message);
  }
}`}</CodeBlock>

      <h2>How to log errors</h2>
      <p>Use <code>console.error</code> in Cloudflare Workers — logs appear in the Workers dashboard and in <code>wrangler tail</code> output. For structured logging, add context as additional arguments.</p>
      <CodeBlock>{`// Basic error log
console.error('Database query failed', error);

// Structured log with context
console.error('Payment failed', {
  orderId: payload.orderId,
  attempt: this.attempt,
  error: error.message,
  stack: error.stack,
});

// In middleware — capture request context
async function errorHandlerMiddleware(request: Request, next: Handler): Promise<Response> {
  try {
    return await next(request);
  } catch (error) {
    console.error('Unhandled request error', {
      method: request.method,
      url: request.url,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}`}</CodeBlock>
      <p>Stream real-time logs during development with:</p>
      <CodeBlock title="terminal">{`wrangler tail`}</CodeBlock>

      <h2>How to create custom error responses</h2>
      <p>Define a set of typed error classes that map to HTTP status codes, then handle them in a top-level error middleware.</p>
      <CodeBlock title="src/lib/errors.ts">{`export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string) {
    super(404, \`\${resource} not found\`, 'NOT_FOUND');
  }
}

export class ValidationError extends HttpError {
  constructor(public readonly fields: Record<string, string>) {
    super(422, 'Validation failed', 'VALIDATION_ERROR');
  }
}

export class ForbiddenError extends HttpError {
  constructor(action?: string) {
    super(403, action ? \`Forbidden: \${action}\` : 'Forbidden', 'FORBIDDEN');
  }
}`}</CodeBlock>
      <CodeBlock title="src/middleware/error-handler.ts">{`import { HttpError, ValidationError } from '../lib/errors';
import type { Handler } from '@roost/core';

export async function errorHandlerMiddleware(
  request: Request,
  next: Handler,
): Promise<Response> {
  try {
    return await next(request);
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { error: error.message, code: error.code, fields: error.fields },
        { status: error.status },
      );
    }

    if (error instanceof HttpError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    console.error('Unhandled error', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}`}</CodeBlock>
      <CodeBlock title="src/app.ts">{`import { errorHandlerMiddleware } from './middleware/error-handler';

app.useMiddleware(errorHandlerMiddleware); // Register first — runs outermost`}</CodeBlock>
      <p>Related: <a href="/docs/packages/core">@roost/core reference</a> for middleware pipeline details, <a href="/docs/packages/queue">@roost/queue reference</a> for job retry configuration.</p>

    </DocLayout>
  );
}
