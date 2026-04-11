import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/queue')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/queue" subtitle="Background job processing on Cloudflare Queues. Typed job classes with retry configuration, dispatch methods, chaining, batching, and lifecycle hooks.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/queue`}</CodeBlock>

      <h2>Configuration</h2>
      <p>Declare a Cloudflare Queue binding in <code>wrangler.jsonc</code>:</p>
      <CodeBlock title="wrangler.jsonc">{`{
  "queues": {
    "producers": [{ "queue": "my-queue", "binding": "QUEUE" }],
    "consumers": [{ "queue": "my-queue" }]
  }
}`}</CodeBlock>

      <h2>Job API</h2>
      <p>
        <code>Job&lt;TPayload&gt;</code> is an abstract base class. Extend it and implement
        <code>handle()</code>. The generic parameter types the <code>payload</code> property.
      </p>

      <h3>Instance Properties</h3>

      <h4><code>payload: TPayload</code></h4>
      <p>The deserialized job payload. Typed by the generic parameter.</p>

      <h4><code>attempt: number</code></h4>
      <p>The current attempt number. Starts at <code>1</code> and increments on each retry.</p>

      <h3>Instance Methods</h3>

      <h4><code>abstract async handle(): Promise&lt;void&gt;</code></h4>
      <p>The job's main logic. Throwing any error triggers the retry strategy.</p>

      <h4><code>async onSuccess(): Promise&lt;void&gt;</code></h4>
      <p>Optional. Called after a successful <code>handle()</code> invocation.</p>

      <h4><code>async onFailure(error: Error): Promise&lt;void&gt;</code></h4>
      <p>Optional. Called after <code>handle()</code> throws and all retries are exhausted.</p>

      <h3>Static Methods</h3>

      <h4><code>static async dispatch(payload: TPayload): Promise&lt;void&gt;</code></h4>
      <p>Enqueue the job immediately.</p>

      <h4><code>static async dispatchAfter(seconds: number, payload: TPayload): Promise&lt;void&gt;</code></h4>
      <p>Enqueue the job with a delay of <code>seconds</code> before first execution.</p>

      <h4><code>static async chain(jobs: JobDescriptor[]): Promise&lt;void&gt;</code></h4>
      <p>
        Enqueue a sequence of jobs that run one after another. The next job starts only
        after the previous one succeeds.
      </p>

      <h4><code>static async batch(jobs: JobDescriptor[]): Promise&lt;string&gt;</code></h4>
      <p>
        Enqueue multiple independent jobs. Jobs run in parallel (no ordering guarantee).
        Returns the batch ID string.
      </p>

      <h4><code>static fake(): void</code></h4>
      <p>Enable fake mode. All <code>dispatch()</code> calls are recorded but not enqueued.</p>

      <h4><code>static restore(): void</code></h4>
      <p>Disable fake mode.</p>

      <h4><code>static assertDispatched(jobClassOrName?: typeof Job | string): void</code></h4>
      <p>Assert that the job was dispatched (in fake mode). Optionally filter by job class or name.</p>

      <h4><code>static assertNotDispatched(): void</code></h4>
      <p>Assert that the job was not dispatched.</p>

      <h2>JobConsumer API</h2>
      <p>Processes messages from a Cloudflare Queue consumer handler.</p>

      <h4><code>constructor(registry: JobRegistry)</code></h4>
      <p>Construct with a <code>JobRegistry</code> containing all registered job classes.</p>

      <h4><code>async processMessage(message: Message): Promise&lt;void&gt;</code></h4>
      <p>
        Deserialize the message, instantiate the matching job class, and call <code>handle()</code>.
        Calls <code>onSuccess()</code> on success, <code>onFailure()</code> on final failure.
      </p>

      <h2>JobRegistry API</h2>

      <h4><code>register(JobClass: typeof Job): void</code></h4>
      <p>Register a job class so the consumer can deserialize and route messages to it.</p>

      <h2>Decorators</h2>
      <p>Class decorators applied to <code>Job</code> subclasses.</p>

      <h4><code>@MaxRetries(count: number)</code></h4>
      <p>Maximum number of retry attempts before calling <code>onFailure()</code>. Defaults to <code>3</code>.</p>

      <h4><code>@Backoff(strategy: 'exponential' | 'fixed')</code></h4>
      <p>
        Retry backoff strategy. <code>'exponential'</code> doubles the delay on each attempt.
        <code>'fixed'</code> uses the same delay every time. Defaults to <code>'exponential'</code>.
      </p>

      <h4><code>@RetryAfter(seconds: number)</code></h4>
      <p>
        Base delay in seconds before the first retry. For exponential backoff, subsequent
        delays are multiplied by 2 on each attempt.
      </p>

      <h2>Types</h2>
      <CodeBlock>{`interface JobDescriptor {
  jobClass: typeof Job;
  payload: unknown;
}`}</CodeBlock>

    </DocLayout>
  );
}
