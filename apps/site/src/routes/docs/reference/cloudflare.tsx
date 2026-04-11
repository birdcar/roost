import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/cloudflare')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/cloudflare" subtitle="Typed wrappers around all Cloudflare Worker bindings: D1, KV, R2, Queues, AI, Vectorize, Durable Objects, and Hyperdrive.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/cloudflare`}</CodeBlock>

      <h2>Configuration</h2>
      <p>
        Register <code>CloudflareServiceProvider</code> to make all binding wrappers available
        via the container. Bindings are resolved from the Worker <code>env</code> object by name.
      </p>
      <CodeBlock title="src/app.ts">{`import { Application } from '@roost/core';
import { CloudflareServiceProvider } from '@roost/cloudflare';

const app = Application.create(env);
app.register(CloudflareServiceProvider);`}</CodeBlock>

      <h2>D1Database API</h2>
      <p>Typed wrapper around a Cloudflare D1 (SQLite) binding.</p>

      <h4><code>constructor(db: D1Database)</code></h4>
      <p>Construct with a raw D1 binding from the Worker environment.</p>

      <h4><code>run(query: string): Promise&lt;D1ExecResult&gt;</code></h4>
      <p>Execute raw SQL. Returns execution metadata. Use for DDL statements.</p>

      <h4><code>prepare(query: string): D1PreparedStatement</code></h4>
      <p>
        Create a prepared statement. Call <code>.bind(...values)</code> on the result to
        supply positional parameters, then <code>.all()</code>, <code>.first()</code>, or
        <code>.run()</code> to execute.
      </p>

      <h4><code>batch(statements: D1PreparedStatement[]): Promise&lt;D1Result[]&gt;</code></h4>
      <p>Execute multiple prepared statements in a single round-trip.</p>

      <h4><code>dump(): Promise&lt;ArrayBuffer&gt;</code></h4>
      <p>Export the entire database as a binary SQLite file.</p>

      <h2>KVStore API</h2>
      <p>Typed wrapper around a Cloudflare KV namespace binding.</p>

      <h4><code>constructor(kv: KVNamespace)</code></h4>
      <p>Construct with a raw KV namespace binding.</p>

      <h4><code>get&lt;T&gt;(key: string, type?: 'text' | 'json'): Promise&lt;T | null&gt;</code></h4>
      <p>Retrieve a value. Returns <code>null</code> if the key does not exist.</p>

      <h4><code>getWithMetadata&lt;T, M&gt;(key: string, type?: 'text' | 'json'): Promise&lt;&#123; value: T | null; metadata: M | null &#125;&gt;</code></h4>
      <p>Retrieve a value along with its metadata object.</p>

      <h4><code>put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVPutOptions): Promise&lt;void&gt;</code></h4>
      <p>
        Store a value. <code>KVPutOptions</code> accepts <code>expiration</code> (Unix timestamp),
        <code>expirationTtl</code> (seconds from now), and <code>metadata</code> (arbitrary object).
      </p>

      <h4><code>putJson&lt;T&gt;(key: string, value: T, options?: KVPutOptions): Promise&lt;void&gt;</code></h4>
      <p>Store a value serialized as JSON.</p>

      <h4><code>delete(key: string): Promise&lt;void&gt;</code></h4>
      <p>Delete a key. No-op if the key does not exist.</p>

      <h4><code>list(options?: KVListOptions): Promise&lt;KVNamespaceListResult&gt;</code></h4>
      <p>
        List keys. <code>KVListOptions</code> accepts <code>prefix</code>, <code>limit</code>,
        and <code>cursor</code> for pagination.
      </p>

      <h2>R2Storage API</h2>
      <p>Typed wrapper around a Cloudflare R2 bucket binding.</p>

      <h4><code>constructor(bucket: R2Bucket)</code></h4>
      <p>Construct with a raw R2 bucket binding.</p>

      <h4><code>put(key: string, value: ReadableStream | ArrayBuffer | string, options?: R2PutOptions): Promise&lt;R2Object | null&gt;</code></h4>
      <p>Upload an object. Returns the stored <code>R2Object</code> metadata, or <code>null</code> on failure.</p>

      <h4><code>get(key: string): Promise&lt;R2ObjectBody | null&gt;</code></h4>
      <p>Download an object. Returns <code>null</code> if the key does not exist.</p>

      <h4><code>delete(keys: string | string[]): Promise&lt;void&gt;</code></h4>
      <p>Delete one or more objects.</p>

      <h4><code>list(options?: R2ListOptions): Promise&lt;R2Objects&gt;</code></h4>
      <p>List objects. Supports <code>prefix</code>, <code>limit</code>, and <code>cursor</code>.</p>

      <h4><code>head(key: string): Promise&lt;R2Object | null&gt;</code></h4>
      <p>Retrieve object metadata without downloading the body. Returns <code>null</code> if the key does not exist.</p>

      <h2>QueueSender API</h2>
      <p>Typed wrapper around a Cloudflare Queue producer binding.</p>

      <h4><code>constructor(queue: Queue)</code></h4>
      <p>Construct with a raw Queue binding.</p>

      <h4><code>send&lt;T&gt;(message: T, options?: QueueSendOptions): Promise&lt;void&gt;</code></h4>
      <p>Send a single message to the queue.</p>

      <h4><code>sendBatch&lt;T&gt;(messages: Iterable&lt;MessageSendRequest&lt;T&gt;&gt;): Promise&lt;void&gt;</code></h4>
      <p>Send multiple messages in a single operation.</p>

      <h2>AIClient API</h2>
      <p>
        Typed wrapper around the Cloudflare Workers <code>Ai</code> binding. This is the
        low-level client used internally by <code>@roost/ai</code>.
      </p>

      <h4><code>constructor(ai: Ai)</code></h4>
      <p>Construct with a raw <code>Ai</code> binding from the Worker environment.</p>

      <h4><code>run&lt;T = string&gt;(model: string, inputs: Record&lt;string, unknown&gt;, options?: AiOptions): Promise&lt;T&gt;</code></h4>
      <p>
        Execute inference on the specified model. The <code>inputs</code> shape is model-specific.
        The generic <code>T</code> parameter types the return value.
      </p>
      <CodeBlock>{`const ai = new AIClient(env.AI);

// Text generation
const text = await ai.run<string>('@cf/meta/llama-3.1-8b-instruct', {
  messages: [{ role: 'user', content: 'Hello' }],
});

// Image generation
const image = await ai.run<ArrayBuffer>('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
  prompt: 'A sunset over mountains',
});`}</CodeBlock>

      <h2>VectorStore API</h2>
      <p>Typed wrapper around a Cloudflare Vectorize binding.</p>

      <h4><code>constructor(index: VectorizeIndex)</code></h4>
      <p>Construct with a raw Vectorize index binding.</p>

      <h4><code>insert(vectors: VectorizeVector[]): Promise&lt;VectorizeAsyncMutation&gt;</code></h4>
      <p>Insert new vectors. Each vector requires an <code>id</code> (string) and <code>values</code> (number[]).</p>

      <h4><code>upsert(vectors: VectorizeVector[]): Promise&lt;VectorizeAsyncMutation&gt;</code></h4>
      <p>Insert or update vectors by ID.</p>

      <h4><code>query(vector: number[], options?: VectorizeQueryOptions): Promise&lt;VectorizeMatches&gt;</code></h4>
      <p>
        Find the closest vectors to the query vector. Options include <code>topK</code>
        (number of results) and <code>returnMetadata</code>.
      </p>

      <h4><code>deleteByIds(ids: string[]): Promise&lt;VectorizeAsyncMutation&gt;</code></h4>
      <p>Delete vectors by their IDs.</p>

      <h2>DurableObjectClient API</h2>
      <p>Typed wrapper around a Durable Object namespace binding.</p>

      <h4><code>constructor(namespace: DurableObjectNamespace)</code></h4>
      <p>Construct with a raw Durable Object namespace binding.</p>

      <h4><code>get(id: DurableObjectId): DurableObjectStub</code></h4>
      <p>Get a stub for a specific Durable Object instance by ID.</p>

      <h2>HyperdriveClient API</h2>
      <p>Typed wrapper around a Cloudflare Hyperdrive binding for external database connections.</p>

      <h4><code>constructor(hyperdrive: Hyperdrive)</code></h4>
      <p>Construct with a raw Hyperdrive binding.</p>

      <h4><code>query(sql: string, params?: unknown[]): Promise&lt;&#123; results: unknown[] &#125;&gt;</code></h4>
      <p>Execute a parameterized SQL query against the external database.</p>

      <h2>CloudflareServiceProvider</h2>
      <p>
        Service provider that registers all binding wrappers in the container. Binding names
        are read from the Worker <code>env</code> passed to <code>Application.create()</code>.
        The following bindings are registered by convention: <code>DB</code> → <code>D1Database</code>,
        <code>KV</code> → <code>KVStore</code>, <code>FILES</code> → <code>R2Storage</code>,
        <code>AI</code> → <code>AIClient</code>.
      </p>

    </DocLayout>
  );
}
