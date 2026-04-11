import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/testing')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/testing" subtitle="What the testing package provides, how it connects to Roost's broader testing philosophy, and the specific patterns it enables.">
      <h2>The Testing Package's Scope</h2>
      <p>
        <code>@roost/testing</code> provides the shared testing infrastructure that other packages
        build on. Its two primary exports are <code>TestClient</code> — for making HTTP requests
        against a Roost application without a running server — and the test setup utilities that
        configure the application environment for tests.
      </p>
      <p>
        The package intentionally does not try to be a testing framework. Roost applications use
        Bun's built-in test runner, and <code>@roost/testing</code> extends it rather than
        replacing it. Tests use <code>describe</code>, <code>it</code>, and <code>expect</code>
        from Bun — the testing package adds Roost-specific assertions on top of those primitives.
      </p>

      <h2>TestClient: The Primary Testing Interface</h2>
      <p>
        The <code>TestClient</code> is a request builder that calls <code>app.handle()</code>
        directly. It supports the common HTTP methods, accepts JSON bodies, allows setting
        arbitrary headers, and provides an <code>actingAs(user)</code> method for authenticating
        test requests without needing a real session. The response is a <code>TestResponse</code>
        with fluent assertion methods: <code>assertStatus(200)</code>, <code>assertOk()</code>,
        <code>assertJson({'{'} key: value {'}'}) </code>, <code>assertHeader(name, value)</code>.
      </p>
      <p>
        The TestClient's design reflects the testing philosophy: tests should read like descriptions
        of user behavior, not descriptions of implementation details. <code>await client.post('/orders', payload)</code>
        reads like what the user is doing. The assertions that follow describe what the application
        should have done in response.
      </p>

      <h2>Test Application Setup</h2>
      <p>
        Tests need an application instance to give to the TestClient. The recommended pattern is
        to create a test-specific application factory that registers real service providers but
        replaces infrastructure bindings with fakes — the D1 database is a test D1 (via Wrangler),
        AI providers are faked, billing is faked, queues are faked. This produces an application
        that exercises all the real code paths but does not make external calls or require production
        credentials.
      </p>
      <p>
        The testing package provides <code>setup</code> utilities that assist with this configuration,
        but the application factory is application code — not something the testing package generates
        or owns. This keeps the test setup transparent: a new team member can read the test
        bootstrap file and understand exactly what is being faked and why.
      </p>

      <h2>Connection to the Broader Testing Philosophy</h2>
      <p>
        The testing package is the practical expression of the fake-over-mock and integration-first
        philosophy described in the cross-cutting testing concepts. If you want to understand
        <em>why</em> the package is designed this way — why fakes, why no mock library, why
        integration tests are preferred — the testing philosophy page covers that reasoning.
        This package page focuses on the specific tools the package provides.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/testing-philosophy">Testing Philosophy — the reasoning behind Roost's testing approach</a></li>
        <li><a href="/docs/packages/testing">@roost/testing reference — TestClient, TestResponse, and setup API</a></li>
        <li><a href="https://bun.sh/docs/test/writing" target="_blank" rel="noopener noreferrer">Bun Test Documentation</a></li>
      </ul>
    </DocLayout>
  );
}
