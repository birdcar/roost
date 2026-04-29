# @roostjs/start

TanStack Start integration — wires the Roost application lifecycle into server functions and middleware.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/start
```

Requires `@tanstack/react-start >= 1.120.0` and `@tanstack/react-router >= 1.120.0` as peer dependencies.

## Quick Start

```typescript
// app/roost.ts
import { createRoostStart } from '@roostjs/start';
import { Application } from '@roostjs/core';

export const {
  middleware: roostMiddleware,
  fn: roostFn,
  loader: roostLoader,
  beforeLoad: roostBeforeLoad,
} = createRoostStart({
  app: () => {
    return Application.create(process.env);
  },
});

// app/routes/api/users.ts
import { UserService } from '../../services/user-service';

export const listUsers = roostFn(async ({ resolve }) => {
  const users = resolve(UserService);
  return users.findAll();
});

export const getUser = roostFn(
  { input: (d: { userId: string }) => d },
  async ({ resolve, input }) => {
    const users = resolve(UserService);
    return users.findById(input.userId);
  }
);

// app/routes/users.tsx
export const Route = createFileRoute('/users')({
  loader: roostLoader(async ({ resolve }) => {
    return resolve(UserService).findAll();
  }),
});
```

## Features

- `createRoostStart` binds a Roost app factory once and returns configured Start helpers
- `createRoostMiddleware` boots the Roost `Application` once on cold start and injects a request-scoped container into every server function that uses it
- `roostFn` wraps a GET server function with Roost context pre-injected — no manual container wiring
- `roostFnWithInput` wraps a POST server function with both Roost context and typed, validated input
- `createRoostLoader` and `createRoostBeforeLoad` wrap TanStack route hooks while keeping Roost logic server-side
- `bootApp` / `getApp` for direct application lifecycle access outside middleware
- `StartServiceProvider` as a stable registration point for future service providers

## API

```typescript
// Configured helpers
createRoostStart({ app: () => Application }): {
  middleware,
  fn,
  loader,
  beforeLoad,
}

// Middleware
createRoostMiddleware(createApp: () => Application): TanStack middleware

// Server function helpers
roostFn(middleware, fn: (roost: RoostServerContext) => Promise<TOutput>)
roostFnWithInput(middleware, validator, fn: (roost, input) => Promise<TOutput>)
createRoostServerFn(middleware): fn

// Route helpers
createRoostLoader(middleware): roostLoader
createRoostBeforeLoad(middleware): roostBeforeLoad

// Application lifecycle
bootApp(createApp: () => Application): Application  // boots once, caches singleton
getApp(): Application                               // throws if not yet booted
resetAppCache(): void                               // resets singleton (useful in tests)

// Context shape
interface RoostServerContext {
  container: Container;
  app: Application;
}
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/start](https://roost.birdcar.dev/docs/reference/start)

## License

MIT
