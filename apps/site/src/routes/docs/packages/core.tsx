import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/core')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/core</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>The foundation package providing the service container, configuration system, middleware pipeline, and base Application class.</p>

      <h2>Service Container</h2>
      <pre><code>{`import { RoostContainer } from '@roost/core';

const container = new RoostContainer();
container.singleton(Database, (c) => new Database(c.resolve(Config)));
container.bind(Logger, () => new Logger());

const db = container.resolve(Database);
const scoped = container.scoped(); // request-level isolation`}</code></pre>

      <h2>Configuration</h2>
      <pre><code>{`import { ConfigManager } from '@roost/core';

const config = new ConfigManager({
  database: { default: 'd1', d1Binding: 'DB' },
});
config.get('database.default'); // 'd1'
config.get('missing', 'fallback'); // 'fallback'`}</code></pre>

      <h2>Middleware Pipeline</h2>
      <pre><code>{`import { Pipeline } from '@roost/core';

const pipeline = new Pipeline()
  .use(loggerMiddleware)
  .use(authMiddleware, 'admin');

const response = await pipeline.handle(request, handler);`}</code></pre>

      <h2>Application</h2>
      <pre><code>{`const app = Application.create(env, config);
app.register(CloudflareServiceProvider);
app.register(AuthServiceProvider);
await app.boot();
const response = await app.handle(request);`}</code></pre>
    </div>
  );
}
