import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/core')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/core" subtitle="Why Roost has a service container, how the pipeline middleware model works, and what the Application class is actually doing.">
      <h2>Why a Service Container for Workers?</h2>
      <p>
        The obvious question is whether a dependency injection container is overkill for a Cloudflare
        Worker. A Worker is a single file, executes in milliseconds, and has no long-running state.
        Why not just import what you need?
      </p>
      <p>
        The answer is testability and composability. When a route handler imports a database
        connection directly, tests cannot replace that connection with a fake without reaching into
        the module system. When middleware needs to share resolved services with the route handler
        below it, there is no clean mechanism to pass them along. The container solves both: every
        service is resolved from a shared registry, tests can swap any binding before calling
        <code>app.handle()</code>, and the scoped container per request is the standard mechanism
        for sharing request-scoped data through the pipeline.
      </p>
      <p>
        The container is also what makes service providers composable. A third-party package can
        ship a service provider that registers its own bindings without knowing anything about the
        application it will be installed in. The application bootstraps everything by registering
        providers, not by wiring dependencies manually.
      </p>

      <h2>DI Without a Long-Lived Process</h2>
      <p>
        Laravel's container assumes a PHP-FPM process that handles one request and exits, or a
        long-running Octane process. In both cases, singleton lifetimes are clear. Workers are
        more nuanced: an isolate is warm for a period, handling multiple requests, then may be
        discarded. Singleton bindings in Roost live for the lifetime of the warm isolate — across
        potentially thousands of requests. This is almost always the right lifetime for expensive
        resources like D1 database connections, but it means singletons should not hold mutable
        per-request state.
      </p>
      <p>
        Roost's scoped container — a child container created per request — is the answer to
        per-request state. Bindings registered in a scoped container are invisible to other requests.
        The scoped container inherits all singletons from its parent, so it can still resolve the
        database connection or configuration, but it adds its own bindings (authenticated user,
        resolved organization, request-specific context) without touching the shared state.
      </p>

      <h2>Why Pipeline Middleware Instead of Nested Function Calls</h2>
      <p>
        The alternative to a pipeline is a manually nested chain: every middleware wraps the next
        in a closure. This works but is hard to compose at runtime — you cannot add middleware
        conditionally without restructuring the nesting. The pipeline model separates concerns:
        you declare a list of middleware, and the pipeline builds the nested chain for you. Adding,
        removing, or reordering middleware is a one-line change.
      </p>
      <p>
        Roost's <code>Pipeline</code> class also integrates with the container. Middleware classes
        can be passed as constructor functions, and the pipeline resolves them from the scoped
        container. This means middleware can have injected dependencies like any other service —
        the pipeline instantiates them from the container rather than requiring manual construction.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/service-container">Service Container — the DI model in depth</a></li>
        <li><a href="/docs/concepts/architecture">Application Architecture — how core fits into the full request lifecycle</a></li>
        <li><a href="/docs/packages/core">@roost/core reference — Application, Container, Pipeline API</a></li>
      </ul>
    </DocLayout>
  );
}
