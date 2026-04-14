# @roostjs/feature-flags

Laravel Pennant-style feature flags backed by WorkOS with KV edge caching.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/feature-flags
```

## Quick Start

```typescript
import { Feature } from '@roostjs/feature-flags';

// Global flag check
if (await Feature.active('new-checkout')) {
  return newCheckout(request);
}

// Scoped to a user or organization
const flags = Feature.for({ userId: 'usr_42', organizationId: 'org_7' });
if (await flags.active('beta-dashboard')) {
  return betaDashboard();
}

// Typed values
const limit = await Feature.value<number>('rate-limit', 100);
```

## Features

- `Feature.active(flag)` and `Feature.value(flag, default)` with optional request-scoped caching
- `Feature.for(context)` for user/org-scoped evaluation
- WorkOS as the primary provider via `@workos-inc/node`
- KV edge cache layer (`KVCacheFlagProvider`) wraps WorkOS to avoid per-request API calls (default TTL: 60s)
- KV-only provider (`KVFlagProvider`) for simpler setups without WorkOS
- `FeatureFlagMiddleware` to batch-load flags at the start of a request
- `Feature.fake(flags)` / `assertChecked(flag)` for tests — no live provider needed

## Setup

Register the service provider in your app bootstrap:

```typescript
import { FeatureFlagServiceProvider } from '@roostjs/feature-flags';
app.register(FeatureFlagServiceProvider);
```

The provider auto-configures based on available environment bindings:
- `WORKOS_API_KEY` + `FLAGS_KV` binding → WorkOS provider with KV cache
- `WORKOS_API_KEY` only → WorkOS provider (no cache)
- `FLAGS_KV` only → KV-only provider

Batch-load flags at the route level to avoid redundant evaluations:

```typescript
import { FeatureFlagMiddleware } from '@roostjs/feature-flags';

router.use(new FeatureFlagMiddleware(['new-checkout', 'beta-dashboard']));
```

## API

```typescript
// Primary interface (also exported as FeatureFlag)
class Feature {
  static active(flag: string, request?: Request): Promise<boolean>
  static value<T>(flag: string, defaultValue?: T): Promise<T | null>
  static for(context: FlagContext): ScopedFeatureFlag
  static set<T>(flag: string, value: T): Promise<void>

  // Testing
  static fake(flags: Record<string, FlagValue>): void
  static restore(): void
  static assertChecked(flag: string): void

  // Manual configuration
  static configure(store: FlagStore): void
  static configureProvider(provider: FlagProvider): void
  static configureProviderWithStore(provider: FlagProvider, store: FlagStore): void
}

interface FlagContext {
  userId?: string;
  organizationId?: string;
  [key: string]: unknown;
}

type FlagValue = boolean | number | string | Record<string, unknown>
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/feature-flags](https://roost.birdcar.dev/docs/reference/feature-flags)

## License

MIT
