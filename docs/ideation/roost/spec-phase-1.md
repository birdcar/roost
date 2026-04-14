# Implementation Spec: Roost Framework - Phase 1

**Contract**: ./contract.md
**PRD**: ./prd-phase-1.md
**Estimated Effort**: XL

## Technical Approach

Phase 1 creates the monorepo, core framework, and Cloudflare binding abstractions. The monorepo uses bun workspaces. All packages target the Cloudflare Workers runtime — no Node.js APIs, no polyfills.

The core framework follows a class+functional hybrid: the service container, Application, and service providers are classes (stateful, DI-friendly). Config loading, middleware definitions, and binding factories are functional (stateless, composable). This matches the contract's "class-based like Laravel but AI-readable" goal.

Decorators use TC39 Stage 3 decorators (TypeScript 5.x experimentalDecorators off, native decorators on) to stay future-proof. Where decorators are too heavy, static class properties serve as configuration metadata.

## Feedback Strategy

**Inner-loop command**: `bun test --filter packages/`

**Playground**: bun:test suite — each package has a `__tests__/` directory. Tests run in < 5 seconds.

**Why this approach**: Phase 1 is pure library code with no UI. Tests are the tightest feedback loop.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `package.json` | Root workspace config |
| `bunfig.toml` | Bun workspace config |
| `tsconfig.base.json` | Shared TypeScript strict config |
| `packages/core/package.json` | @roostjs/core package manifest |
| `packages/core/tsconfig.json` | Extends base TS config |
| `packages/core/src/index.ts` | Public API barrel export |
| `packages/core/src/container.ts` | Service container |
| `packages/core/src/provider.ts` | ServiceProvider base class |
| `packages/core/src/config.ts` | Configuration manager |
| `packages/core/src/middleware.ts` | Middleware pipeline |
| `packages/core/src/application.ts` | Base Application class |
| `packages/core/src/types.ts` | Shared type definitions |
| `packages/core/src/decorators.ts` | Shared decorators (@Injectable, etc.) |
| `packages/core/__tests__/container.test.ts` | Container tests |
| `packages/core/__tests__/config.test.ts` | Config tests |
| `packages/core/__tests__/middleware.test.ts` | Middleware tests |
| `packages/core/__tests__/application.test.ts` | Application tests |
| `packages/cloudflare/package.json` | @roostjs/cloudflare package manifest |
| `packages/cloudflare/tsconfig.json` | Extends base TS config |
| `packages/cloudflare/src/index.ts` | Public API barrel export |
| `packages/cloudflare/src/types.ts` | Wrangler Env type augmentation |
| `packages/cloudflare/src/bindings/d1.ts` | D1 binding wrapper |
| `packages/cloudflare/src/bindings/kv.ts` | KV binding wrapper |
| `packages/cloudflare/src/bindings/r2.ts` | R2 binding wrapper |
| `packages/cloudflare/src/bindings/queues.ts` | Queues binding wrapper |
| `packages/cloudflare/src/bindings/durable-objects.ts` | DO binding wrapper |
| `packages/cloudflare/src/bindings/ai.ts` | AI binding wrapper |
| `packages/cloudflare/src/bindings/vectorize.ts` | Vectorize binding wrapper |
| `packages/cloudflare/src/bindings/hyperdrive.ts` | Hyperdrive binding wrapper |
| `packages/cloudflare/src/provider.ts` | CloudflareServiceProvider |
| `packages/cloudflare/__tests__/kv.test.ts` | KV binding tests |
| `packages/cloudflare/__tests__/r2.test.ts` | R2 binding tests |
| `packages/cloudflare/__tests__/queues.test.ts` | Queues binding tests |

### Modified Files

None — this is Phase 1, all files are new.

## Implementation Details

### 1. Monorepo Structure

**Overview**: Bun workspace with two initial packages. All packages share a strict TypeScript base config.

```
roost/
├── package.json              # workspace root
├── bunfig.toml               # bun workspace config
├── tsconfig.base.json        # shared strict TS config
├── packages/
│   ├── core/                 # @roostjs/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   └── __tests__/
│   └── cloudflare/           # @roostjs/cloudflare
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       └── __tests__/
```

```json
// package.json (root)
{
  "name": "roost",
  "private": true,
  "workspaces": ["packages/*"]
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"]
  }
}
```

**Key decisions**:
- `verbatimModuleSyntax: true` — forces explicit `import type` for type-only imports. Prevents bundler confusion and makes imports AI-readable.
- `moduleResolution: "bundler"` — matches how Workers/Vite resolve modules.
- No `experimentalDecorators` — use TC39 Stage 3 decorators where needed, or static properties as metadata.

**Implementation steps**:
1. Create root package.json, bunfig.toml, tsconfig.base.json
2. Create packages/core and packages/cloudflare directory structures
3. Configure each package's package.json with correct `exports`, `types`, and `files` fields
4. Verify `bun install` resolves workspace dependencies
5. Verify `bun test` discovers tests in all packages

**Feedback loop**:
- **Playground**: `bun test` at root
- **Experiment**: Add a trivial test in each package, run `bun test`, confirm discovery
- **Check command**: `bun test`

---

### 2. Service Container (@roostjs/core)

**Overview**: A lightweight IoC container supporting singleton and transient bindings, constructor injection, and request-scoped containers. Designed to feel like Laravel's container but without the PHP magic — everything is typed.

```typescript
// Key interfaces
interface Container {
  bind<T>(token: Token<T>, factory: Factory<T>): void;
  singleton<T>(token: Token<T>, factory: Factory<T>): void;
  resolve<T>(token: Token<T>): T;
  scoped(): Container; // creates a child container for request scope
  has(token: Token<unknown>): boolean;
}

type Token<T> = abstract new (...args: any[]) => T | string | symbol;
type Factory<T> = (container: Container) => T;

// Usage
container.singleton(Database, (c) => new Database(c.resolve(D1Binding)));
container.bind(UserService, (c) => new UserService(c.resolve(Database)));

const userService = container.resolve(UserService);
```

**Key decisions**:
- Token-based resolution (class constructors, strings, or symbols) — no decorator magic required for basic DI. Classes as tokens is the most common case and is fully type-safe.
- `scoped()` creates a child container that inherits parent singletons but isolates request-level bindings. Essential for Workers where each request needs its own container scope.
- No auto-wiring via reflection — explicit registration only. This is more AI-friendly (no hidden magic) and works without `emitDecoratorMetadata`.

**Implementation steps**:
1. Define `Container` interface and `Token`/`Factory` types in `types.ts`
2. Implement `RoostContainer` class with `Map<Token, { factory, instance?, lifecycle }>` storage
3. Implement `scoped()` with prototype chain to parent container
4. Write tests: singleton vs transient, scoped isolation, missing binding error, circular detection
5. Export from `index.ts`

**Feedback loop**:
- **Playground**: `packages/core/__tests__/container.test.ts`
- **Experiment**: Register singleton, resolve twice → same instance. Register transient, resolve twice → different instances. Scope → child overrides don't leak to parent.
- **Check command**: `bun test --filter container`

---

### 3. Service Provider Pattern (@roostjs/core)

**Overview**: Service providers are the bridge between packages and the container. Each Roost package ships a provider that registers its services. The Application boots all providers on startup.

```typescript
abstract class ServiceProvider {
  constructor(protected app: Application) {}

  // Register bindings into the container
  abstract register(): void | Promise<void>;

  // Called after ALL providers have registered (for cross-provider setup)
  boot?(): void | Promise<void>;
}

// Example: CloudflareServiceProvider
class CloudflareServiceProvider extends ServiceProvider {
  register() {
    this.app.container.singleton(KVStore, (c) =>
      new KVStore(this.app.env.MY_KV)
    );
    this.app.container.singleton(R2Bucket, (c) =>
      new R2Bucket(this.app.env.MY_R2)
    );
  }
}
```

**Key decisions**:
- Two-phase boot: `register()` then `boot()`. Register phase only binds services. Boot phase can resolve services (all bindings are available). This prevents ordering issues.
- Providers receive the Application instance, not just the container — they may need env vars, config, etc.

**Implementation steps**:
1. Define `ServiceProvider` abstract class
2. Add `providers` array to Application
3. Implement `registerProviders()` and `bootProviders()` lifecycle methods
4. Test: providers register in order, boot sees all bindings, async providers work

---

### 4. Configuration System (@roostjs/core)

**Overview**: Typed config access with convention-based loading. Config files live in `config/` and export objects. The config manager merges defaults with environment overrides.

```typescript
interface ConfigManager {
  get<T>(key: string, defaultValue?: T): T;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
}

// config/database.ts (user-defined)
export default {
  default: 'd1',
  connections: {
    d1: {
      binding: 'DB',
    },
  },
};

// Usage in framework code
const binding = config.get<string>('database.connections.d1.binding');
```

**Key decisions**:
- Dot-notation access with full type inference where possible. Generic `get<T>` for explicit typing.
- Config is loaded once at boot, not per-request. Config values are immutable after boot.
- Environment variables override config values via convention: `config.database.default` can be overridden by `DATABASE_DEFAULT` env var.

**Implementation steps**:
1. Implement `ConfigManager` class with dot-notation path resolver
2. Implement config loader that reads from a config map (framework passes config at boot)
3. Implement env override resolution
4. Test: dot-notation access, nested access, default values, env overrides, missing keys

**Feedback loop**:
- **Playground**: `packages/core/__tests__/config.test.ts`
- **Experiment**: Set config `{ database: { default: 'd1' } }`, get `'database.default'` → `'d1'`. Override with env var → new value.
- **Check command**: `bun test --filter config`

---

### 5. Middleware Pipeline (@roostjs/core)

**Overview**: A composable pipeline where middleware classes process requests in order, with before/after hooks. Modeled after Laravel's middleware but typed for Workers' `Request`/`Response`.

```typescript
interface Middleware {
  handle(
    request: Request,
    next: (request: Request) => Promise<Response>,
    ...args: string[] // middleware parameters, e.g., 'role:admin' passes 'admin'
  ): Promise<Response>;
}

class Pipeline {
  private middleware: MiddlewareEntry[] = [];

  use(middleware: Middleware | MiddlewareClass, ...args: string[]): this;
  handle(request: Request, destination: Handler): Promise<Response>;
}

// Example middleware
class LogMiddleware implements Middleware {
  async handle(request: Request, next: (req: Request) => Promise<Response>) {
    console.log(`${request.method} ${request.url}`);
    const response = await next(request);
    console.log(`→ ${response.status}`);
    return response;
  }
}
```

**Key decisions**:
- `next()` pattern (not `before/after` hooks) — simpler, same power. Middleware wraps the rest of the pipeline.
- Middleware parameters via `...args` — when a route uses `'role:admin'`, the `'admin'` string is passed to `handle()`.
- Pipeline is immutable per-build — create a new Pipeline for each route group.

**Implementation steps**:
1. Define `Middleware` interface
2. Implement `Pipeline` class with ordered execution
3. Implement middleware resolution from container (class-based middleware)
4. Implement parameter passing
5. Test: order of execution, short-circuiting (return without calling next), parameter passing, async middleware

**Feedback loop**:
- **Playground**: `packages/core/__tests__/middleware.test.ts`
- **Experiment**: Chain 3 middleware, verify execution order. Short-circuit in middle, verify downstream doesn't run.
- **Check command**: `bun test --filter middleware`

---

### 6. Base Application Class (@roostjs/core)

**Overview**: The Application class is the entry point. It boots the container, loads config, registers providers, and handles incoming Worker `fetch` requests through the middleware pipeline.

```typescript
class Application {
  readonly container: Container;
  readonly config: ConfigManager;
  readonly env: Env;

  private providers: ServiceProvider[] = [];
  private pipeline: Pipeline;
  private booted = false;

  constructor(env: Env, config?: Record<string, unknown>) {
    this.env = env;
    this.container = new RoostContainer();
    this.config = new ConfigManager(config);
    this.pipeline = new Pipeline();

    // Self-bind
    this.container.singleton(Application, () => this);
  }

  register(provider: ServiceProviderClass): this;
  async boot(): Promise<void>;

  // The Worker fetch handler
  async handle(request: Request): Promise<Response> {
    const scoped = this.container.scoped();
    // ... bind request-scoped services ...
    return this.pipeline.handle(request, this.dispatch.bind(this));
  }

  protected dispatch(request: Request): Promise<Response>;
}

// Worker entry point (user's worker.ts)
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const app = Application.create(env);
    return app.handle(request);
  },
};
```

**Key decisions**:
- Application is created per-request on Workers (no persistent state between requests). This is the Workers model — each `fetch` is isolated.
- However, singleton services in the container CAN persist if the Application is cached at module scope (Workers module lifecycle). The Application supports both patterns.
- `handle()` creates a scoped container per request, runs middleware, then dispatches to the router (Phase 2 wires this up).

**Implementation steps**:
1. Implement Application class with constructor, register, boot lifecycle
2. Implement `handle()` with scoped container creation and middleware execution
3. Implement lifecycle hooks (booting, booted, terminating)
4. Test: boot lifecycle, provider registration order, request handling, scoped container isolation

**Feedback loop**:
- **Playground**: `packages/core/__tests__/application.test.ts`
- **Experiment**: Create Application with mock env, register a provider, boot, handle a Request → get a Response. Verify provider's bindings are available.
- **Check command**: `bun test --filter application`

---

### 7. Cloudflare Bindings (@roostjs/cloudflare)

**Overview**: Typed wrappers around each Cloudflare Worker binding. Each wrapper adds: type safety, JSON serialization, error normalization, and a consistent API pattern. The wrappers are thin — they don't add significant logic, just ergonomics.

#### KV Binding

```typescript
class KVStore<TMetadata = unknown> {
  constructor(private kv: KVNamespace) {}

  async get<T = string>(key: string): Promise<T | null>;
  async getWithMetadata<T = string>(key: string): Promise<{ value: T | null; metadata: TMetadata | null }>;
  async put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVPutOptions): Promise<void>;
  async putJson<T>(key: string, value: T, options?: KVPutOptions): Promise<void>;
  async delete(key: string): Promise<void>;
  async list(options?: KVListOptions): Promise<KVListResult<TMetadata>>;
}
```

#### R2 Binding

```typescript
class R2Storage {
  constructor(private bucket: R2Bucket) {}

  async put(key: string, value: ReadableStream | ArrayBuffer | string, options?: R2PutOptions): Promise<R2Object>;
  async get(key: string): Promise<R2ObjectBody | null>;
  async delete(key: string | string[]): Promise<void>;
  async list(options?: R2ListOptions): Promise<R2Objects>;
  async head(key: string): Promise<R2Object | null>;
  async createPresignedUrl(key: string, expiresIn: number): Promise<string>;
}
```

#### Queues Binding

```typescript
class QueueSender<T = unknown> {
  constructor(private queue: Queue<T>) {}

  async send(message: T, options?: QueueSendOptions): Promise<void>;
  async sendBatch(messages: Iterable<MessageSendRequest<T>>): Promise<void>;
}
```

#### AI Binding

```typescript
class AIClient {
  constructor(private ai: Ai) {}

  async run<T = string>(model: string, inputs: AiInputs, options?: AiOptions): Promise<T>;
  async runStream(model: string, inputs: AiInputs, options?: AiOptions): AsyncIterable<string>;
}
```

#### Vectorize Binding

```typescript
class VectorStore {
  constructor(private index: VectorizeIndex) {}

  async insert(vectors: VectorizeVector[]): Promise<VectorizeAsyncMutation>;
  async query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches>;
  async getByIds(ids: string[]): Promise<VectorizeVector[]>;
  async deleteByIds(ids: string[]): Promise<VectorizeAsyncMutation>;
}
```

#### Durable Objects Binding

```typescript
class DurableObjectClient<T extends DurableObject> {
  constructor(private namespace: DurableObjectNamespace<T>) {}

  get(id: DurableObjectId): DurableObjectStub<T>;
  get(name: string): DurableObjectStub<T>;
  idFromName(name: string): DurableObjectId;
  idFromString(hex: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
}
```

#### Hyperdrive Binding

```typescript
class HyperdriveClient {
  constructor(private hyperdrive: Hyperdrive) {}

  get connectionString(): string;
  get host(): string;
  get port(): number;
  get user(): string;
  get password(): string;
  get database(): string;
}
```

**Key decisions**:
- Wrappers are thin. They don't hide the underlying Cloudflare APIs — they add type safety and convenience methods (like `putJson` for KV).
- Each wrapper takes the raw Wrangler binding in its constructor. The CloudflareServiceProvider resolves them from `env`.
- R2 `createPresignedUrl` is a convenience that may require Workers-specific signing logic.
- The AI binding is intentionally minimal here — @roostjs/ai (Phase 5) builds the agent abstraction on top.

**Implementation steps**:
1. Define Wrangler Env type augmentation in `types.ts`
2. Implement each binding wrapper class
3. Implement `CloudflareServiceProvider` that registers all bindings from env
4. Test each wrapper with mocked Wrangler types (bun:test can mock the binding interfaces)

**Feedback loop**:
- **Playground**: `packages/cloudflare/__tests__/`
- **Experiment**: Create KVStore with mock KVNamespace, putJson + get round-trip. Create R2Storage with mock, put + get. Queue sender with mock, send + verify message shape.
- **Check command**: `bun test --filter packages/cloudflare`

## Data Model

No database schema in Phase 1. D1 is wrapped as a binding but ORM is Phase 4.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/core/__tests__/container.test.ts` | Singleton, transient, scoped, missing binding, circular detection |
| `packages/core/__tests__/config.test.ts` | Dot-notation, defaults, env overrides, nested access |
| `packages/core/__tests__/middleware.test.ts` | Ordering, short-circuit, params, async |
| `packages/core/__tests__/application.test.ts` | Boot lifecycle, provider registration, request handling |
| `packages/cloudflare/__tests__/kv.test.ts` | get, put, putJson, delete, list |
| `packages/cloudflare/__tests__/r2.test.ts` | put, get, delete, list, head |
| `packages/cloudflare/__tests__/queues.test.ts` | send, sendBatch |

**Key test cases**:
- Container: singleton returns same instance, transient returns new instance, scoped child doesn't leak to parent
- Config: `get('a.b.c')` resolves nested path, missing key returns default, env override takes precedence
- Middleware: 3-middleware chain executes in order, middleware can short-circuit, response transforms on the way back
- Application: boot registers all providers, handle creates scoped container, provider boot sees all bindings
- KV: putJson serializes, get deserializes, null for missing key
- R2: put returns R2Object, get returns body, null for missing key

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| Container: resolve unregistered token | Throw `BindingNotFoundError` with token name |
| Container: circular dependency detected | Throw `CircularDependencyError` with dependency chain |
| Config: access missing key with no default | Throw `ConfigKeyNotFoundError` with full path |
| Middleware: unhandled exception in middleware | Let it propagate — Application's handle() catches at top level, returns 500 |
| CF Binding: binding not in env | Throw `MissingBindingError` with binding name and wrangler.toml hint |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Container | Stale singleton in module cache | Workers reuse module instances | Singleton leaks state between requests | Document: use scoped() for request-level state |
| Config | Env var type mismatch | Env var is string, config expects number | Runtime type error | Config getter parses env vars to expected type |
| KV | Eventual consistency | KV read-after-write in different region | Stale data returned | Document: KV is eventually consistent. Use D1 for strong consistency |
| R2 | Upload size limit | Object exceeds Workers memory limit | OOM crash | Document R2 limits, recommend streaming for large files |
| Queues | Message too large | Payload exceeds 128KB limit | Queue.send() throws | Validate payload size before send, throw descriptive error |

## Validation Commands

```bash
# Type checking
bun run --filter '@roostjs/*' tsc --noEmit

# Unit tests
bun test

# Build all packages
bun run --filter '@roostjs/*' build

# Verify workspace integrity
bun install --dry-run
```

## Rollout Considerations

- **Feature flag**: None — this is the foundation, always on
- **Monitoring**: N/A for library code
- **Rollback plan**: N/A — monorepo, just revert commits
