import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/service-container')({ component: Page });

function Page() {
  return (
    <DocLayout title="Service Container" subtitle="How Roost manages dependencies, why dependency injection matters at the edge, and how service providers wire everything together.">
      <h2>The Problem That Dependency Injection Solves</h2>
      <p>
        In a traditional application, code that needs a database connection creates one: <code>new Database(config)</code>.
        This is convenient until you need to test that code without a real database, swap the database
        implementation, or share a single connection across dozens of services. Dependency injection
        inverts this: instead of code creating its own dependencies, something else creates them and
        passes them in. The container is that "something else."
      </p>
      <p>
        In Roost's case, the <code>RoostContainer</code> is a registry of factories. When you call
        <code>container.singleton(DatabaseService, (c) =&gt; new DatabaseService(c.resolve(Config)))</code>,
        you are registering a recipe, not creating an instance. The container only calls that factory when
        something actually resolves <code>DatabaseService</code>. This lazy construction means unused
        services are never created.
      </p>

      <h2>Singletons, Transients, and Scoped Containers</h2>
      <p>
        The container supports two lifecycles. A <strong>singleton</strong> binding creates one instance
        the first time it is resolved and returns that same instance on every subsequent resolution for the
        lifetime of the container. Use singletons for expensive-to-create objects that are safe to share
        across requests: database connections, HTTP clients, configuration objects.
      </p>
      <p>
        A <strong>transient</strong> (plain <code>bind</code>) binding creates a new instance every time
        it is resolved. Use transients for objects that hold per-call state or that are cheap to create.
      </p>
      <p>
        For each incoming request, Roost creates a <strong>scoped container</strong> — a child container
        that inherits all bindings from the application container but can register additional per-request
        bindings. Singletons in the parent are still shared; bindings added to the child are isolated to
        that request. When the request finishes, the scoped container and all its transient instances are
        discarded. This is how per-request state like the authenticated user flows through the system
        without being visible to concurrent requests.
      </p>

      <h2>Service Providers: The Boot Protocol</h2>
      <p>
        Raw container registration is powerful but fragile — if code registers bindings in random order,
        a factory might try to resolve something that has not been registered yet. Service providers solve
        this with a two-phase protocol. Every provider implements <code>register()</code>, which only adds
        bindings to the container. Then, after all providers have registered, the application calls each
        provider's optional <code>boot()</code> method, where side effects and cross-provider setup can
        happen safely.
      </p>
      <p>
        This pattern is lifted directly from Laravel's service provider model. The difference is that on
        Cloudflare Workers, there is no long-lived server process — the application boots once per isolate
        warm-up. The same two-phase contract still holds, and the same testability benefits apply: because
        every service comes from the container, tests can swap any binding for a fake without touching
        production code.
      </p>

      <h2>Comparing to Laravel's IoC Container</h2>
      <p>
        Laravel's container supports automatic resolution via PHP reflection — if a class has
        constructor parameters with type hints, the container infers the dependencies and resolves them
        automatically. Roost's container does not have this because TypeScript erases most type information
        at runtime. Every binding in Roost is explicit: you write the factory function yourself. This is
        slightly more verbose but produces no hidden "magic" — every dependency chain is traceable in source
        code without runtime reflection.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/architecture">Application Architecture — how the container fits into the boot sequence</a></li>
        <li><a href="/docs/concepts/laravel-patterns">Laravel Patterns — what was adopted, what was changed, and why</a></li>
        <li><a href="/docs/concepts/core">@roost/core concepts — the container and pipeline design in detail</a></li>
        <li><a href="/docs/reference">Reference — Container, ServiceProvider, and Application API</a></li>
      </ul>
    </DocLayout>
  );
}
