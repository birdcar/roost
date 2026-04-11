import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/cloudflare')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/cloudflare Guides" subtitle="Task-oriented instructions for Cloudflare bindings: D1, R2, KV, Queues, Workers AI, and Vectorize.">

      <h2>How to configure Cloudflare bindings in wrangler.jsonc</h2>
      <p>Declare all bindings in <code>wrangler.jsonc</code> so they appear in your Worker's <code>env</code> object at runtime.</p>
      <CodeBlock title="wrangler.jsonc">{`{
  "name": "my-app",
  "compatibility_date": "2024-01-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "my-app-db", "database_id": "..." }
  ],
  "kv_namespaces": [
    { "binding": "CACHE", "id": "..." }
  ],
  "r2_buckets": [
    { "binding": "FILES", "bucket_name": "my-app-files" }
  ],
  "queues": {
    "producers": [{ "binding": "MY_QUEUE", "queue": "my-app-queue" }],
    "consumers": [{ "queue": "my-app-queue", "max_batch_size": 10 }]
  },
  "ai": {
    "binding": "AI"
  },
  "vectorize": [
    { "binding": "VECTORIZE", "index_name": "my-embeddings" }
  ]
}`}</CodeBlock>
      <p>Create D1 databases and KV namespaces via the Cloudflare dashboard or <code>wrangler</code> CLI before referencing their IDs here.</p>

      <h2>How to use D1 for database queries</h2>
      <p>Wrap the raw D1 binding with <code>D1Database</code> for typed prepared statements and batch operations.</p>
      <CodeBlock>{`import { D1Database } from '@roost/cloudflare';

const db = new D1Database(env.DB);

// Parameterized query
const stmt = db.prepare('SELECT * FROM users WHERE id = ?1');
const row = await stmt.bind(1).first();

// Fetch multiple rows
const rows = await db.prepare('SELECT * FROM users WHERE active = ?1')
  .bind(true)
  .all();

// Batch multiple statements atomically
const results = await db.batch([
  db.prepare('INSERT INTO users (name, email) VALUES (?1, ?2)').bind('Alice', 'alice@example.com'),
  db.prepare('INSERT INTO audit_log (event) VALUES (?1)').bind('user.created'),
]);`}</CodeBlock>
      <p>For application-level querying, prefer <a href="/docs/packages/orm">@roost/orm</a> models over raw D1. Use raw D1 for migrations or complex SQL not covered by the query builder.</p>

      <h2>How to store and retrieve files with R2</h2>
      <p>Use <code>R2Storage</code> to upload and download objects. Pass a <code>contentType</code> in <code>httpMetadata</code> so browsers render files correctly.</p>
      <CodeBlock>{`import { R2Storage } from '@roost/cloudflare';

const storage = new R2Storage(env.FILES);

// Upload from a form file input
const formData = await request.formData();
const file = formData.get('avatar') as File;
const buffer = await file.arrayBuffer();

await storage.put(\`avatars/\${userId}.png\`, buffer, {
  httpMetadata: { contentType: file.type },
});

// Download and stream to client
const object = await storage.get(\`avatars/\${userId}.png\`);
if (!object) return new Response('Not Found', { status: 404 });

return new Response(object.body, {
  headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
});

// Delete
await storage.delete(\`avatars/\${userId}.png\`);

// Check existence without downloading
const meta = await storage.head(\`avatars/\${userId}.png\`);
const exists = meta !== null;`}</CodeBlock>

      <h2>How to use KV for caching</h2>
      <p>Use <code>KVStore</code> for short-lived cache entries. Always set <code>expirationTtl</code> to avoid stale data accumulating.</p>
      <CodeBlock>{`import { KVStore } from '@roost/cloudflare';

const kv = new KVStore(env.CACHE);

// Cache-aside pattern
async function getUser(id: string) {
  const cached = await kv.get<User>(\`user:\${id}\`, 'json');
  if (cached) return cached;

  const user = await User.findOrFail(id);
  await kv.putJson(\`user:\${id}\`, user, { expirationTtl: 3600 }); // 1 hour
  return user;
}

// Invalidate on update
async function updateUser(id: string, data: Partial<User>) {
  await user.save();
  await kv.delete(\`user:\${id}\`);
}

// List keys with a prefix
const result = await kv.list({ prefix: 'user:', limit: 100 });
for (const key of result.keys) {
  await kv.delete(key.name);
}`}</CodeBlock>

      <h2>How to send messages to a Queue</h2>
      <p>Use <code>QueueSender</code> for direct queue access, or use <a href="/docs/packages/queue">@roost/queue</a> jobs for structured background processing.</p>
      <CodeBlock>{`import { QueueSender } from '@roost/cloudflare';

const queue = new QueueSender(env.MY_QUEUE);

// Single message
await queue.send({ userId: 'user_123', action: 'send-welcome-email' });

// Batch messages (more efficient for bulk operations)
await queue.sendBatch([
  { body: { userId: 'user_1' }, contentType: 'application/json' },
  { body: { userId: 'user_2' }, contentType: 'application/json' },
  { body: { userId: 'user_3' }, contentType: 'application/json' },
]);`}</CodeBlock>

      <h2>How to use Workers AI</h2>
      <p>Use <code>AIClient</code> to run inference on Cloudflare's hosted models. No API keys required — the <code>AI</code> binding in <code>wrangler.jsonc</code> is all you need.</p>
      <CodeBlock>{`import { AIClient } from '@roost/cloudflare';

const ai = new AIClient(env.AI);

// Text generation
const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Summarize this text: ...' },
  ],
});

// Embeddings (for semantic search / Vectorize)
const embeddings = await ai.run('@cf/baai/bge-base-en-v1.5', {
  text: ['Hello world', 'How are you?'],
});`}</CodeBlock>
      <p>For full agent capabilities with tools and conversation memory, use <a href="/docs/packages/ai">@roost/ai</a>. <code>AIClient</code> is the low-level binding wrapper.</p>

      <h2>How to configure Vectorize for embeddings</h2>
      <p>Create a Vectorize index in the Cloudflare dashboard matching the dimensionality of your embedding model, then use <code>VectorStore</code> to insert and query.</p>
      <CodeBlock>{`import { VectorStore, AIClient } from '@roost/cloudflare';

const vectorize = new VectorStore(env.VECTORIZE);
const ai = new AIClient(env.AI);

// Generate embeddings and insert
async function indexDocument(id: string, text: string) {
  const result = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [text] });
  const vector = result.data[0];

  await vectorize.insert([{
    id,
    values: vector,
    metadata: { text, createdAt: new Date().toISOString() },
  }]);
}

// Query for similar documents
async function semanticSearch(query: string, topK = 5) {
  const result = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [query] });
  const queryVector = result.data[0];

  const matches = await vectorize.query(queryVector, { topK, returnMetadata: true });
  return matches.matches;
}

// Delete by IDs
await vectorize.deleteByIds(['doc_1', 'doc_2']);`}</CodeBlock>
      <p>The Vectorize index dimension must match your embedding model's output size. <code>bge-base-en-v1.5</code> outputs 768 dimensions.</p>

    </DocLayout>
  );
}
