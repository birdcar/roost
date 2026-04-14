# @roostjs/cloudflare

Typed wrappers for every Cloudflare binding, plus rate limiting and HTML rewriting.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/cloudflare
```

## Quick Start

```typescript
import { Application } from '@roostjs/core';
import { CloudflareServiceProvider, KVRateLimiter } from '@roostjs/cloudflare';

const app = Application.create(env);

// Auto-detects and registers all CF bindings from env
app.register(CloudflareServiceProvider);

app.onDispatch(async (request, container) => {
  const kv = container.resolve('MY_KV');  // resolves as KVStore
  await kv.putJson('key', { hello: 'world' });
  return new Response('ok');
});
```

## Features

- `CloudflareServiceProvider` auto-detects KV, R2, D1, Queues, AI, Vectorize, Durable Objects, Hyperdrive, Service Bindings, and Dispatch Namespaces from the Worker `env` and registers them in the container
- Typed wrappers for all bindings — no casting, no `as any` at call sites
- `KVRateLimiter` — sliding window rate limiting backed by KV, usable as middleware
- `DORateLimiter` — rate limiting via Durable Objects for strong consistency
- `HtmlTransformer` — fluent API over `HTMLRewriter` for script injection, meta tags, element replacement, and A/B testing
- `VersionedKVStore` — content-addressed KV storage with SHA-256 pointers; useful for cache busting without versioned keys scattered across your code

## API

```typescript
// KV
kv.get(key)                        // string | null
kv.get<T>(key, 'json')             // T | null
kv.getWithMetadata(key, type?)
kv.put(key, value, options?)
kv.putJson(key, value, options?)
kv.delete(key)
kv.list(options?)

// VersionedKVStore
store.put(key, value)              // returns SHA-256 hash
store.get<T>(key)                  // T | null
store.getVersion(key)              // hash | null
store.isCurrent(key, hash)

// R2
r2.put(key, value, options?)
r2.get(key)
r2.delete(keys)
r2.list(options?)
r2.head(key)

// D1
db.prepare(query)                  // D1PreparedStatement
db.batch(statements)
db.run(query)
db.withSession(token?)

// Queues
queue.send(message, options?)
queue.sendBatch(messages)

// AI
ai.run<T>(model, inputs, options?) // supports queueRequest for async inference
ai.poll<T>(taskId, fetcher, accountId)

// Vectorize
vs.insert(vectors)
vs.query(vector, options?)
vs.getByIds(ids)
vs.deleteByIds(ids)

// Durable Objects
doClient.get(nameOrId)             // DurableObjectStub
doClient.idFromName(name)
doClient.newUniqueId()

// Rate limiting (middleware)
new KVRateLimiter(kvStore, { limit, window, keyExtractor? })
new DORateLimiter(doClient, { limit, window, keyExtractor? })

// HTML
new HtmlTransformer()
  .injectScript(src, position?)    // 'head' | 'body'
  .setMetaTag(name, content)
  .replaceElement(selector, html)
  .removeElement(selector)
  .abTest(selector, variants, assignmentFn)
  .transform(response, request?)
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/cloudflare](https://roost.birdcar.dev/docs/reference/cloudflare)

## License

MIT
