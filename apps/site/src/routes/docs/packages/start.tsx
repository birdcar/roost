import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/start')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/start</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Bridges the Roost framework with TanStack Start. Provides the context bridge, middleware integration, and server function wrappers.</p>

      <h2>Roost Middleware</h2>
      <pre><code>{`import { createRoostMiddleware } from '@roost/start';

export const roostMiddleware = createRoostMiddleware(() => {
  const app = new Application({});
  app.register(CloudflareServiceProvider);
  app.register(AuthServiceProvider);
  return app;
});`}</code></pre>

      <h2>Server Functions</h2>
      <pre><code>{`import { roostFn, roostFnWithInput } from '@roost/start';

// No input
const listUsers = roostFn(roostMiddleware, async (roost) => {
  return roost.container.resolve(UserService).findAll();
});

// With typed input
const getUser = roostFnWithInput(
  roostMiddleware,
  (d: { id: string }) => d,
  async (roost, input) => {
    return roost.container.resolve(UserService).find(input.id);
  }
);`}</code></pre>
    </div>
  );
}
