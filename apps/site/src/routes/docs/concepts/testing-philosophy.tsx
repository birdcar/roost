import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/testing-philosophy')({ component: Page });

function Page() {
  return (
    <DocLayout title="Testing Philosophy" subtitle="Why Roost uses fakes over mocks, how TestClient eliminates server setup, and what testing on Workers requires differently.">
      <h2>Fakes Over Mocks</h2>
      <p>
        The standard advice in JavaScript testing is to mock dependencies with libraries like
        Jest's <code>jest.fn()</code> or Vitest's <code>vi.spyOn()</code>. Mocks intercept calls
        at the module level, replace method implementations, and let tests assert on how many
        times a function was called. This works, but it introduces a hidden coupling: the test
        knows the implementation details of the code under test — which methods it calls, in
        what order, with what arguments. When the implementation changes without changing the
        observable behavior, the test breaks.
      </p>
      <p>
        Roost instead ships <em>fakes</em> — purpose-built alternative implementations of the
        real classes. <code>Agent.fake(responses)</code> replaces the AI provider with an
        in-memory version that returns pre-configured strings. <code>Job.fake()</code> captures
        dispatched jobs without touching any queue infrastructure. <code>FakeBillingProvider</code>
        records billing operations without calling Stripe. These fakes implement the same
        interface as the real things, which means tests exercise the same code paths — the
        only thing that changes is whether real infrastructure is involved.
      </p>
      <p>
        The practical difference: a mock-based test that checks whether <code>provider.chat()</code>
        was called with specific arguments will fail if you refactor <code>agent.prompt()</code>
        to batch requests. A fake-based test that checks whether the agent returned the correct
        response will not — it only cares about the outcome.
      </p>

      <h2>TestClient: Testing HTTP Without a Server</h2>
      <p>
        The <code>TestClient</code> from <code>@roost/testing</code> takes a Roost
        <code>Application</code> instance and calls <code>app.handle(request)</code> directly.
        No port binding, no network, no spawned process. The test constructs a real
        <code>Request</code> object, passes it to the application, and receives a real
        <code>Response</code> object. The entire middleware pipeline runs; authentication,
        validation, and route handlers all execute normally.
      </p>
      <p>
        This approach makes integration tests faster and more reliable than spinning up a test
        server, and it keeps the test environment consistent with production. Because Roost
        applications take a <code>Request</code> and return a <code>Response</code> as their
        public interface, the TestClient requires zero special-casing in application code. The
        application has no idea it is being tested.
      </p>

      <h2>Integration Over Unit for Framework Code</h2>
      <p>
        Unit tests isolate a single function or class with all dependencies mocked. For
        pure utility functions, this is appropriate. For framework code — middleware, route
        handlers, service providers — the interaction between components is often where bugs
        live. A route handler that works in isolation might fail because a middleware did not
        set the expected header, or because the service provider registered the wrong binding.
      </p>
      <p>
        Roost's testing story pushes toward integration tests that boot a real application
        (with fake infrastructure bindings) and make HTTP requests through it. The goal is
        tests that would catch the bugs that actually happen in production, not tests that
        achieve high line coverage by replacing every interesting dependency with a spy.
      </p>

      <h2>Testing on Workers: What Is Different</h2>
      <p>
        The Cloudflare Workers runtime differs from Node.js. D1, KV, and Queues bindings are
        Cloudflare-specific objects that do not exist in a standard bun or Node.js test runner.
        For unit and integration tests that do not touch the real infrastructure, Roost's fakes
        sidestep this entirely — the fake agent never calls <code>env.AI</code>, the fake job
        never calls <code>env.QUEUE</code>. For tests that need real D1 or KV, Wrangler's
        <code>--test</code> mode provides a local emulation layer. Roost does not try to abstract
        over Wrangler; it accepts that some tests need Wrangler to run and documents this clearly
        rather than hiding it behind another fake.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/testing">@roost/testing concepts — the package-specific testing model</a></li>
        <li><a href="/docs/packages/testing">@roost/testing reference — TestClient, fakes, and setup</a></li>
        <li><a href="/docs/packages/ai">@roost/ai reference — Agent.fake() and assertion methods</a></li>
        <li><a href="/docs/packages/queue">@roost/queue reference — Job.fake() and assertion methods</a></li>
      </ul>
    </DocLayout>
  );
}
