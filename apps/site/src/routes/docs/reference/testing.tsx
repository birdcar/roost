import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/testing')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/testing" subtitle="HTTP test client, response assertions, unified fakes, and test setup utilities for Roost applications on bun:test.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add -D @roost/testing`}</CodeBlock>

      <h2>TestClient API</h2>
      <p>
        Makes HTTP requests against a Roost application and returns a <code>TestResponse</code>
        with assertion methods.
      </p>

      <h4><code>constructor(app?: Application)</code></h4>
      <p>
        Construct with an optional application instance. If omitted, uses the default test
        application created by <code>createTestApp()</code>.
      </p>

      <h4><code>get(path: string): TestRequestBuilder</code></h4>
      <h4><code>post(path: string): TestRequestBuilder</code></h4>
      <h4><code>put(path: string): TestRequestBuilder</code></h4>
      <h4><code>patch(path: string): TestRequestBuilder</code></h4>
      <h4><code>delete(path: string): TestRequestBuilder</code></h4>
      <p>Start building a request for the given HTTP method and path. Returns a <code>TestRequestBuilder</code>.</p>

      <h4><code>actingAs(user: Partial&lt;RoostUser&gt;): TestClient</code></h4>
      <p>Set a fake authenticated user for all subsequent requests on this client instance.</p>

      <h2>TestRequestBuilder API</h2>
      <p>Fluent builder returned by the HTTP method calls on <code>TestClient</code>. All methods return <code>this</code> for chaining. Awaiting the builder executes the request.</p>

      <h4><code>json(body: Record&lt;string, unknown&gt;): Promise&lt;TestResponse&gt;</code></h4>
      <p>Set the request body as JSON and execute the request.</p>

      <h4><code>form(body: Record&lt;string, string&gt;): Promise&lt;TestResponse&gt;</code></h4>
      <p>Set the request body as form-encoded data and execute the request.</p>

      <h4><code>send(): Promise&lt;TestResponse&gt;</code></h4>
      <p>Execute the request with no body.</p>

      <h4><code>withHeader(name: string, value: string): this</code></h4>
      <p>Add a request header.</p>

      <h2>TestResponse API</h2>

      <h4><code>assertStatus(code: number): void</code></h4>
      <p>Assert the HTTP status code equals <code>code</code>.</p>

      <h4><code>assertOk(): void</code></h4>
      <p>Assert status is <code>200</code>.</p>

      <h4><code>assertCreated(): void</code></h4>
      <p>Assert status is <code>201</code>.</p>

      <h4><code>assertBadRequest(): void</code></h4>
      <p>Assert status is <code>400</code>.</p>

      <h4><code>assertUnauthorized(): void</code></h4>
      <p>Assert status is <code>401</code>.</p>

      <h4><code>assertForbidden(): void</code></h4>
      <p>Assert status is <code>403</code>.</p>

      <h4><code>assertNotFound(): void</code></h4>
      <p>Assert status is <code>404</code>.</p>

      <h4><code>assertHeader(name: string, value: string): void</code></h4>
      <p>Assert the response header <code>name</code> equals <code>value</code>.</p>

      <h4><code>assertHeaderMissing(name: string): void</code></h4>
      <p>Assert the response header <code>name</code> is not present.</p>

      <h4><code>assertRedirect(urlOrFn: string | ((url: string) =&gt; boolean)): void</code></h4>
      <p>Assert the response is a redirect. Accepts an exact URL string or a predicate.</p>

      <h4><code>async assertJson(expected: Record&lt;string, unknown&gt; | ((data: unknown) =&gt; void)): Promise&lt;void&gt;</code></h4>
      <p>
        Parse the response body as JSON and assert it. Accepts either an object to
        deep-equal match, or a callback that receives the parsed data for custom assertions.
      </p>

      <h4><code>async text(): Promise&lt;string&gt;</code></h4>
      <p>Return the response body as a string.</p>

      <h4><code>async json&lt;T = unknown&gt;(): Promise&lt;T&gt;</code></h4>
      <p>Parse and return the response body as JSON.</p>

      <h2>Unified Fakes</h2>

      <h4><code>fakeAll(): void</code></h4>
      <p>
        Enable fake mode on all supported packages simultaneously: agents, jobs, and billing
        provider. Equivalent to calling <code>.fake()</code> on each individually.
      </p>

      <h4><code>restoreAll(): void</code></h4>
      <p>Disable fake mode on all packages. Call in <code>afterEach</code>.</p>

      <h2>Test Setup</h2>

      <h4><code>createTestApp(options?: TestAppOptions): Promise&lt;Application&gt;</code></h4>
      <p>
        Create and boot a Roost application configured for testing. Accepts <code>env</code>
        and <code>config</code> overrides.
      </p>
      <CodeBlock>{`const app = await createTestApp({
  env: { WORKOS_API_KEY: 'sk_test_...' },
  config: { auth: { redirectUrl: 'http://localhost:8787' } },
});`}</CodeBlock>

      <h4><code>setupTestSuite(): TestSuiteHelpers</code></h4>
      <p>
        Returns configured <code>describe</code>, <code>it</code>, <code>beforeEach</code>,
        and <code>afterEach</code> wrappers with shared test client setup.
      </p>

      <h2>Types</h2>
      <CodeBlock>{`interface TestAppOptions {
  env?: Record<string, string>;
  config?: Record<string, unknown>;
}

interface TestSuiteHelpers {
  describe: typeof import('bun:test').describe;
  it: typeof import('bun:test').it;
  beforeEach: typeof import('bun:test').beforeEach;
  afterEach: typeof import('bun:test').afterEach;
}`}</CodeBlock>

    </DocLayout>
  );
}
