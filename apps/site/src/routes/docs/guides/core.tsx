import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/core')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/core Guides" subtitle="Task-oriented instructions for the container, config, middleware, and service providers.">

      <h2>How to register a service provider</h2>
      <p>Service providers are the correct place to register container bindings and run boot logic.</p>
      <CodeBlock title="src/providers/CacheServiceProvider.ts">{`import { ServiceProvider } from '@roost/core';

export class CacheServiceProvider extends ServiceProvider {
  async register(): Promise<void> {
    this.container.singleton(CacheService, (c) => {
      return new CacheService(c.resolve(ConfigManager));
    });
  }

  async boot(): Promise<void> {
    const cache = this.container.resolve(CacheService);
    await cache.warmUp();
  }
}`}</CodeBlock>
      <CodeBlock title="src/app.ts">{`import { Application } from '@roost/core';
import { CacheServiceProvider } from './providers/CacheServiceProvider';

const app = Application.create(env, config);
app.register(CacheServiceProvider);
await app.boot();`}</CodeBlock>
      <p>The <code>register()</code> method runs before all <code>boot()</code> calls, so you can safely resolve services registered by other providers inside <code>boot()</code>. See <a href="/docs/packages/core">@roost/core reference</a> for full ServiceProvider API.</p>

      <h2>How to configure dependency injection bindings</h2>
      <p>Use <code>singleton</code> for services that should be shared across the request, and <code>bind</code> for services that need a fresh instance each time.</p>
      <CodeBlock>{`import { RoostContainer } from '@roost/core';

const container = new RoostContainer();

// One instance per container lifetime
container.singleton(Database, (c) => {
  return new Database(c.resolve(ConfigManager));
});

// New instance on every resolve
container.bind(RequestLogger, (c) => {
  return new RequestLogger(c.resolve(ConfigManager));
});

// Resolve anywhere
const db = container.resolve(Database);`}</CodeBlock>
      <p>For request-level isolation, create a scoped child container. Scoped containers inherit parent bindings but maintain their own singleton instances.</p>
      <CodeBlock>{`const requestContainer = appContainer.scoped();
// Singletons in requestContainer are scoped to this request`}</CodeBlock>

      <h2>How to create custom middleware</h2>
      <p>Middleware is a function or class that wraps the request/response cycle. Return early to short-circuit.</p>
      <CodeBlock title="src/middleware/RateLimitMiddleware.ts">{`import type { Handler } from '@roost/core';

export async function rateLimitMiddleware(request: Request, next: Handler): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const allowed = await checkRateLimit(ip);

  if (!allowed) {
    return new Response('Too Many Requests', { status: 429 });
  }

  return next(request);
}

// With parameters (curried)
export function rateLimit(max: number) {
  return async function (request: Request, next: Handler): Promise<Response> {
    const allowed = await checkRateLimit(request, max);
    if (!allowed) return new Response('Too Many Requests', { status: 429 });
    return next(request);
  };
}`}</CodeBlock>
      <CodeBlock title="src/app.ts">{`app.useMiddleware(rateLimitMiddleware);
// Or with parameters:
app.useMiddleware(rateLimit(100));`}</CodeBlock>
      <p>For class-based middleware, extend the framework's middleware class and use <code>withContainer</code> to get DI access. See <a href="/docs/packages/core">Pipeline reference</a> for the class middleware interface.</p>

      <h2>How to access configuration values</h2>
      <p>Use <code>ConfigManager</code> with dot-notation keys. Pass a default to avoid throwing on missing keys.</p>
      <CodeBlock>{`import { ConfigManager } from '@roost/core';

const config = new ConfigManager({
  app: { name: 'My App', debug: false },
  database: { default: 'd1' },
});

// Throws ConfigKeyNotFoundError if missing and no default
const name = config.get('app.name');

// Safe: returns 'UTC' if key is absent
const timezone = config.get('app.timezone', 'UTC');

// Set values at runtime
config.set('features.darkMode', true);

// Check existence
if (config.has('stripe.secretKey')) {
  // ...
}`}</CodeBlock>
      <p>In a service provider, resolve <code>ConfigManager</code> from the container rather than constructing it directly — the application registers it automatically.</p>

      <h2>How to build a middleware pipeline</h2>
      <p>Use <code>Pipeline</code> to compose multiple middleware functions in order. Each middleware calls <code>next</code> to pass control forward.</p>
      <CodeBlock>{`import { Pipeline } from '@roost/core';

const pipeline = new Pipeline()
  .use(loggerMiddleware)
  .use(rateLimitMiddleware)
  .use(authMiddleware);

const response = await pipeline.handle(request, async (req) => {
  // Final handler — req has passed all middleware
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
});`}</CodeBlock>
      <p>To inject container dependencies into class-based middleware, chain <code>.withContainer(container)</code> before calling <code>handle</code>.</p>
      <CodeBlock>{`const pipeline = new Pipeline()
  .withContainer(container)
  .use(AuthMiddlewareClass);`}</CodeBlock>

    </DocLayout>
  );
}
