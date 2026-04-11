import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/edge-computing')({ component: Page });

function Page() {
  return (
    <DocLayout title="Edge Computing" subtitle="What Cloudflare Workers are, why Roost runs on them, and how the edge runtime shapes every design decision in the framework.">
      <h2>What "Edge" Actually Means</h2>
      <p>
        Cloudflare Workers run in over 300 data centers around the world. When a user in Tokyo makes a
        request, it is handled by a Worker in a Tokyo data center — not routed to a server in Virginia.
        This geographic distribution is the core promise of edge computing: latency proportional to
        the physical distance between the user and the code, rather than between the user and wherever
        you happened to rent a server.
      </p>
      <p>
        But the edge is not just about geography. It is about a fundamentally different runtime model.
        Workers run inside V8 isolates — the same JavaScript engine as Chrome — rather than in Node.js
        or a traditional OS process. This has consequences that ripple through everything Roost is designed
        to do.
      </p>

      <h2>The Constraints V8 Isolates Impose</h2>
      <p>
        A V8 isolate is not a server process. There is no filesystem access, no arbitrary socket binding,
        and no guarantee of in-process state persisting between requests. Isolates start fast —
        microseconds, not seconds — and Cloudflare reuses warm isolates for subsequent requests, but you
        cannot rely on module-level state surviving across all requests. This is why Roost's service
        container distinguishes between singleton bindings (safe for the lifetime of a warm isolate)
        and per-request scoped containers (safe only for the duration of one request).
      </p>
      <p>
        The standard Node.js APIs — <code>fs</code>, <code>net</code>, <code>child_process</code>, <code>path</code>
        — do not exist. Workers run the Web Platform APIs: <code>fetch</code>, <code>Request</code>,
        <code>Response</code>, <code>ReadableStream</code>, <code>crypto</code>. This is why Roost's
        <code>Application.handle()</code> takes and returns plain <code>Request</code> and <code>Response</code>
        objects — the same types that exist in every browser and modern JavaScript runtime. Code written
        to this interface is portable and testable without mocking anything.
      </p>

      <h2>The Cloudflare Binding Model</h2>
      <p>
        Traditional applications configure connections by reading environment variables: a database URL,
        an S3 endpoint, an API key. Workers configure infrastructure through <em>bindings</em>. A binding
        is a declared capability — "this Worker has access to a D1 database named MAIN_DB" — that
        Cloudflare injects into the Worker's <code>env</code> object at runtime. The binding resolves
        inside Cloudflare's network, not over the public internet.
      </p>
      <p>
        D1 is Cloudflare's SQLite-compatible database that runs at the edge. KV is a globally replicated
        key-value store, eventually consistent, suitable for sessions and caches. R2 is object storage
        compatible with the S3 API but without egress fees. Queues is a message queue for deferring
        work. Workers AI provides inference on GPU clusters in Cloudflare's network. Each of these
        is a binding — not an HTTP endpoint you call from the outside, but a capability you access
        through the <code>env</code> object.
      </p>
      <p>
        Roost's <code>@roost/cloudflare</code> package wraps these raw binding objects with typed,
        ergonomic clients. The wrapping is thin by design. The goal is to add TypeScript type safety
        and align the API with Roost's patterns — not to abstract away the underlying platform.
      </p>

      <h2>Cold Starts and Why They Are Negligible</h2>
      <p>
        Cold start concerns dominate discussions of serverless functions. Cloudflare Workers have a
        fundamentally different cold start story. Because Workers run in V8 isolates rather than
        Node.js or JVM runtimes, they start in well under a millisecond — often measured in
        microseconds. There is no JIT warmup phase, no large runtime to initialize. For most
        applications, Workers' cold start overhead is imperceptible to users.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/architecture">Application Architecture — how the Worker handles requests</a></li>
        <li><a href="/docs/concepts/cloudflare">@roost/cloudflare concepts — the binding wrapper design</a></li>
        <li><a href="https://developers.cloudflare.com/workers/" target="_blank" rel="noopener noreferrer">Cloudflare Workers Documentation</a></li>
        <li><a href="https://developers.cloudflare.com/d1/" target="_blank" rel="noopener noreferrer">Cloudflare D1 Documentation</a></li>
      </ul>
    </DocLayout>
  );
}
