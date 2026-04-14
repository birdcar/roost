import { describe, test, expect } from 'bun:test';
import { Application } from '../src/application';
import { ServiceProvider } from '../src/provider';
import type { Middleware } from '../src/types';

function makeRequest(path = '/'): Request {
  return new Request(`http://localhost${path}`);
}

class TestProvider extends ServiceProvider {
  static registered = false;
  static booted = false;

  register() {
    TestProvider.registered = true;
    this.app.container.singleton('test-value', () => 'from-provider');
  }

  boot() {
    TestProvider.booted = true;
  }
}

describe('Application', () => {
  test('static create returns an Application instance', () => {
    const app = Application.create({});
    expect(app).toBeInstanceOf(Application);
  });

  test('boot registers and boots providers', async () => {
    TestProvider.registered = false;
    TestProvider.booted = false;

    const app = Application.create({});
    app.register(TestProvider);
    await app.boot();

    expect(TestProvider.registered).toBe(true);
    expect(TestProvider.booted).toBe(true);
  });

  test('boot only runs once', async () => {
    let bootCount = 0;

    class CountingProvider extends ServiceProvider {
      register() { bootCount++; }
    }

    const app = Application.create({});
    app.register(CountingProvider);
    await app.boot();
    await app.boot();

    expect(bootCount).toBe(1);
  });

  test('provider bindings are resolvable after boot', async () => {
    TestProvider.registered = false;

    const app = Application.create({});
    app.register(TestProvider);
    await app.boot();

    expect(app.container.resolve('test-value')).toBe('from-provider');
  });

  test('handle returns 404 by default when no dispatcher is set', async () => {
    const app = Application.create({});
    const response = await app.handle(makeRequest());

    expect(response.status).toBe(404);
  });

  test('handle invokes the dispatcher', async () => {
    const app = Application.create({});
    app.onDispatch(async (req) => new Response(`Hello from ${new URL(req.url).pathname}`));

    const response = await app.handle(makeRequest('/test'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Hello from /test');
  });

  test('handle runs middleware before dispatcher', async () => {
    const order: string[] = [];

    const mw: Middleware = {
      async handle(req, next) {
        order.push('middleware');
        return next(req);
      },
    };

    const app = Application.create({});
    app.useMiddleware(mw);
    app.onDispatch(async () => {
      order.push('dispatch');
      return new Response('ok');
    });

    await app.handle(makeRequest());

    expect(order).toEqual(['middleware', 'dispatch']);
  });

  test('handle auto-boots if not already booted', async () => {
    TestProvider.registered = false;

    const app = Application.create({});
    app.register(TestProvider);
    app.onDispatch(async () => new Response('ok'));

    await app.handle(makeRequest());

    expect(TestProvider.registered).toBe(true);
  });

  test('env is accessible on the application', () => {
    const env = { MY_KV: 'kv-namespace', SECRET: 'abc' };
    const app = Application.create(env);
    expect(app.env).toBe(env);
  });

  test('config is accessible on the application', () => {
    const app = Application.create({}, { app: { name: 'test' } });
    expect(app.config.get('app.name')).toBe('test');
  });

  test('defer calls waitUntil on the ExecutionContext', async () => {
    const waitUntilCalls: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => waitUntilCalls.push(p),
      passThroughOnException: () => {},
    };

    const app = Application.create({});
    app.onDispatch(async () => new Response('ok'));
    await app.handle(makeRequest(), ctx);

    const deferred = Promise.resolve('background work');
    app.defer(deferred);

    expect(waitUntilCalls).toHaveLength(1);
    expect(waitUntilCalls[0]).toBe(deferred);
  });

  test('defer is a no-op when no ExecutionContext is provided', async () => {
    const app = Application.create({});
    app.onDispatch(async () => new Response('ok'));
    await app.handle(makeRequest());

    expect(() => app.defer(Promise.resolve())).not.toThrow();
  });

  test('ctx is resolvable from the scoped container inside middleware', async () => {
    const ctx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    };

    let resolvedCtx: unknown;

    const mw: Middleware = {
      async handle(req, next) {
        resolvedCtx = (req as any).__roostContainer?.resolve('ctx');
        return next(req);
      },
    };

    const app = Application.create({});
    app.useMiddleware(mw);
    app.onDispatch(async () => new Response('ok'));
    await app.handle(makeRequest(), ctx);

    expect(resolvedCtx).toBe(ctx);
  });
});
