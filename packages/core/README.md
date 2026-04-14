# @roostjs/core

The foundation of Roost — service container, middleware pipeline, and application lifecycle.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/core
```

## Quick Start

```typescript
import { Application, RequestIdMiddleware } from '@roostjs/core';

const app = Application.create(env);

app.register(MyServiceProvider);
app.useMiddleware(RequestIdMiddleware);
app.onDispatch(async (request) => {
  return new Response('Hello from Roost');
});

export default {
  fetch: (request, env, ctx) => app.handle(request, ctx),
};
```

## Features

- IoC container with singleton/transient lifecycles and scoped child containers per request
- Middleware pipeline that resolves classes from the container or instantiates them directly
- `ServiceProvider` base class with `register` and optional `boot` phases
- `Logger` with structured JSON output tied to request context; `FakeLogger` for tests
- `RequestIdMiddleware` — reads `CF-Ray` or generates a UUID, binds a `Logger` into the scoped container, sets `X-Request-Id` on the response
- Webhook verification supporting HMAC-SHA256, HMAC-SHA512, and Ed25519 with built-in presets for Stripe, GitHub, and Svix

## API

```typescript
// Application
Application.create(env, config?)
app.register(ProviderClass)
app.useMiddleware(middleware, ...args)
app.onDispatch(handler)
app.handle(request, ctx?)
app.container   // Container
app.config      // ConfigManager

// Container
container.singleton(token, factory)
container.bind(token, factory)       // transient
container.resolve(token)
container.scoped()                   // child container

// ServiceProvider
abstract class ServiceProvider {
  abstract register(): void | Promise<void>
  boot?(): void | Promise<void>
}

// Middleware interface
interface Middleware {
  handle(request, next, ...args): Promise<Response>
}

// Webhook verification
verifyWebhook(request, options)      // throws WebhookVerificationError
WebhookPresets.stripe()
WebhookPresets.github()
WebhookPresets.svix()

// Logger
new Logger(context)                  // .info / .warn / .error / .debug
Logger.fake(context?)                // returns FakeLogger
fakeLogger.assertLogged(level, msg)
fakeLogger.assertNotLogged(level)
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/core](https://roost.birdcar.dev/docs/reference/core)

## License

MIT
