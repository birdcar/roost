import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/cloudflare')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/cloudflare</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Typed wrappers for all 8 Cloudflare Worker bindings. Adds type safety, JSON serialization, and a consistent API pattern on top of raw Wrangler types.</p>

      <h2>KV Store</h2>
      <pre><code>{`import { KVStore } from '@roost/cloudflare';

const kv = new KVStore(env.MY_KV);
await kv.putJson('user:1', { name: 'Alice', age: 30 });
const user = await kv.get<{ name: string }>('user:1', 'json');
await kv.delete('user:1');
const keys = await kv.list({ prefix: 'user:' });`}</code></pre>

      <h2>R2 Storage</h2>
      <pre><code>{`import { R2Storage } from '@roost/cloudflare';

const storage = new R2Storage(env.MY_BUCKET);
await storage.put('avatar.png', imageData);
const file = await storage.get('avatar.png');
await storage.delete('avatar.png');`}</code></pre>

      <h2>All Bindings</h2>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>D1Database, KVStore, R2Storage, QueueSender, DurableObjectClient, AIClient, VectorStore, HyperdriveClient — each wraps the raw Wrangler binding with typed methods.</p>
    </div>
  );
}
