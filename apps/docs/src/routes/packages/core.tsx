import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/packages/core')({
  component: CoreDocsPage,
});

function CoreDocsPage() {
  return (
    <div>
      <h1>@roost/core</h1>
      <p>The foundation package providing the service container, configuration system, middleware pipeline, and base Application class.</p>

      <h2>Service Container</h2>
      <p>A lightweight IoC container supporting singleton, transient, and request-scoped bindings.</p>
      <pre><code>{`import { RoostContainer } from '@roost/core';

const container = new RoostContainer();

// Singleton — same instance every time
container.singleton(Database, (c) => new Database(c.resolve(Config)));

// Transient — new instance each time
container.bind(RequestLogger, () => new RequestLogger());

// Resolve
const db = container.resolve(Database);

// Scoped container for request isolation
const scoped = container.scoped();
scoped.bind('requestId', () => crypto.randomUUID());`}</code></pre>

      <h2>Configuration</h2>
      <pre><code>{`import { ConfigManager } from '@roost/core';

const config = new ConfigManager({
  database: { default: 'd1', d1Binding: 'DB' },
  app: { name: 'My App' },
});

config.get('database.default');        // 'd1'
config.get('missing', 'fallback');     // 'fallback'
config.has('app.name');                // true`}</code></pre>

      <h2>Middleware Pipeline</h2>
      <pre><code>{`import { Pipeline } from '@roost/core';
import type { Middleware } from '@roost/core';

const logger: Middleware = {
  async handle(request, next) {
    console.log(request.method, request.url);
    const response = await next(request);
    console.log(response.status);
    return response;
  },
};

const pipeline = new Pipeline().use(logger);
const response = await pipeline.handle(request, handler);`}</code></pre>

      <h2>Application</h2>
      <pre><code>{`import { Application } from '@roost/core';
import { CloudflareServiceProvider } from '@roost/cloudflare';

const app = Application.create(env, config);
app.register(CloudflareServiceProvider);
await app.boot();
const response = await app.handle(request);`}</code></pre>
    </div>
  );
}
