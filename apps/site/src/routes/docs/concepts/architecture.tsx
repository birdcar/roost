import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/architecture')({ component: Page });

function Page() {
  return (
    <DocLayout title="Application Architecture" subtitle="How a Roost application is structured, what happens at boot time, and how a request travels from the Cloudflare edge to a response.">
      <h2>A Single Entry Point at the Edge</h2>
      <p>
        Every Roost application is a Cloudflare Worker — a V8 isolate that receives HTTP requests and returns
        HTTP responses. There is no load balancer to configure, no Nginx to tune, and no server process to
        keep alive. The Worker is both the web server and the application framework running inside it.
      </p>
      <p>
        The <code>Application</code> class from <code>@roost/core</code> is the heart of this setup. It holds
        the service container, owns the list of registered service providers, and exposes a single
        <code>handle(request)</code> method that the Worker's <code>fetch</code> handler calls for every
        incoming request. All of Roost's bootstrap logic flows through this one object.
      </p>

      <h2>Boot Sequence</h2>
      <p>
        Roost boots lazily. When the first request arrives, <code>Application.handle()</code> notices the
        application has not yet booted and calls <code>Application.boot()</code> automatically. Boot runs in
        two strict phases. First, every registered service provider's <code>register()</code> method is called
        in order — this is where bindings are added to the container. Then, every provider's optional
        <code>boot()</code> method is called. The separation matters: a provider's <code>boot()</code> can
        safely resolve things registered by a different provider, because all registrations are finished
        before any booting begins.
      </p>
      <p>
        Once booted, the application stays booted for the lifetime of the V8 isolate. On Cloudflare Workers,
        isolates are reused across many requests, so the boot cost is paid once and amortized. Subsequent
        requests skip straight to the middleware pipeline.
      </p>

      <h2>The Middleware Pipeline</h2>
      <p>
        After boot, each request enters the middleware pipeline. Roost builds a new scoped container for every
        request — a child container that inherits all singletons from the application container but can
        register its own request-scoped bindings without polluting the shared state. The pipeline hands this
        scoped container to each middleware in sequence.
      </p>
      <p>
        Middleware is a chain of responsibility: each piece calls <code>next(request)</code> to pass control
        to the next middleware in the chain, or returns a <code>Response</code> early to short-circuit. This
        lets authentication middleware reject requests before they reach route handlers, and response
        middleware modify the response on the way back out. The final handler in the chain — called the
        "destination" — is where routing logic lives.
      </p>

      <h2>TanStack Start and the Context Bridge</h2>
      <p>
        When Roost is used with <code>@roost/start</code>, TanStack Start handles routing and SSR. The
        Roost application runs as middleware inside TanStack Start's request pipeline, not as a standalone
        server. This means TanStack Start's file-based router resolves the route, but Roost's middleware
        pipeline runs first — authenticating the request, resolving the organization, and making services
        available via the scoped container.
      </p>
      <p>
        Server functions (via <code>roostFn</code>) capture the request-scoped container and make it
        available to TanStack Start's data-loading layer. This bridges the server-side Roost context
        into the React component tree without passing dependencies through props or relying on module-level
        globals.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/service-container">Service Container — DI, providers, and the boot sequence in depth</a></li>
        <li><a href="/docs/concepts/edge-computing">Edge Computing — why Workers, and how the runtime shapes the architecture</a></li>
        <li><a href="/docs/concepts/core">@roost/core concepts — the design decisions behind the container and pipeline</a></li>
        <li><a href="/docs/reference">Reference — Application, Pipeline, and ServiceProvider API</a></li>
      </ul>
    </DocLayout>
  );
}
