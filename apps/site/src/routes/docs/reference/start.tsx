import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/start')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/start" subtitle="Bridges the Roost framework with TanStack Start. Provides the context bridge, middleware factory, and server function wrappers.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/start`}</CodeBlock>

      <h2>Configuration</h2>
      <p>
        No environment variables are required. <code>@roost/start</code> depends on the
        <code>Application</code> instance you construct and pass into its factories.
      </p>

      <h2>createRoostMiddleware API</h2>

      <h4><code>createRoostMiddleware(factory: () =&gt; Application): TanStackMiddleware</code></h4>
      <p>
        Create a TanStack Start middleware that bootstraps a Roost <code>Application</code>
        and attaches it to the server context. The <code>factory</code> function is called
        once per request. Returns a middleware compatible with TanStack Start's
        <code>createMiddleware()</code> system.
      </p>
      <CodeBlock title="src/middleware.ts">{`import { createRoostMiddleware } from '@roost/start';
import { Application } from '@roost/core';
import { CloudflareServiceProvider } from '@roost/cloudflare';

export const roostMiddleware = createRoostMiddleware(() => {
  const app = new Application({});
  app.register(CloudflareServiceProvider);
  return app;
});`}</CodeBlock>

      <h2>roostFn API</h2>

      <h4><code>roostFn(middleware: TanStackMiddleware, handler: (roost: RoostContext) =&gt; Promise&lt;T&gt;): ServerFunction&lt;T&gt;</code></h4>
      <p>
        Wrap a TanStack Start server function with Roost context injection. The handler receives
        a <code>RoostContext</code> object with access to the container and resolved application.
        Use when the server function takes no user input.
      </p>
      <CodeBlock title="src/functions/users.ts">{`import { roostFn } from '@roost/start';
import { roostMiddleware } from '../middleware';

const listUsers = roostFn(roostMiddleware, async (roost) => {
  return roost.container.resolve(UserService).findAll();
});`}</CodeBlock>

      <h2>roostFnWithInput API</h2>

      <h4><code>roostFnWithInput(middleware: TanStackMiddleware, validator: (raw: unknown) =&gt; TInput, handler: (roost: RoostContext, input: TInput) =&gt; Promise&lt;T&gt;): ServerFunction&lt;TInput, T&gt;</code></h4>
      <p>
        Wrap a TanStack Start server function with Roost context injection and typed input.
        The <code>validator</code> function receives the raw deserialized input and returns
        the typed value. Throw from the validator to reject invalid input.
      </p>
      <CodeBlock title="src/functions/users.ts">{`import { roostFnWithInput } from '@roost/start';
import { roostMiddleware } from '../middleware';

const getUser = roostFnWithInput(
  roostMiddleware,
  (d: { id: string }) => d,
  async (roost, input) => {
    return roost.container.resolve(UserService).find(input.id);
  }
);`}</CodeBlock>

      <h2>Types</h2>
      <CodeBlock>{`interface RoostContext {
  container: RoostContainer;
  app: Application;
}`}</CodeBlock>

    </DocLayout>
  );
}
