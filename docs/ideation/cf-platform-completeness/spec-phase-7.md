# Phase 7: Service Architecture — Implementation Spec

**Initiative**: CF Platform Completeness
**Phase**: 7 of 8
**Blocks**: Phase 8 (anything dependent on multi-Worker topology)
**Blocked by**: Phases 1–2 (ExecutionContext, observability, Logger)
**Status**: Ready to implement

---

## Technical Approach

Three new binding wrappers plus extensions to `CloudflareServiceProvider`:

1. **`ServiceClient`** — Wraps a `Fetcher` binding for Worker-to-Worker calls. Provides typed HTTP helpers and a `call<T>()` method for DO-style RPC over service bindings.

2. **`DispatchNamespace`** — Wraps the Workers for Platforms dispatch namespace binding. Provides per-tenant script dispatch with outbound interceptor support.

3. **`ContainerClient`** — Wraps the Worker → DO → Container pattern. Manages container lifecycle, warmth, and health checks behind the Durable Object boundary.

4. **Provider auto-detection** — Three new duck-type guards in `CloudflareServiceProvider.registerBinding()` that wrap `Fetcher`, dispatch namespace, and container bindings.

Each component is independently shippable. Implement and commit each one separately. All four can proceed in parallel since they touch different files.

---

## Feedback Strategy

Inner loop: `bun test --filter cloudflare` after each component.

Full gate before any commit: `bun run typecheck` must pass clean. No new `any` escapes beyond CF binding call sites that already exist.

Duck-type guards must not produce false positives. After adding each guard, run the full provider test suite to verify existing bindings are still detected correctly.

---

## File Changes

### New Files

| File | Purpose |
|---|---|
| `packages/cloudflare/src/bindings/service.ts` | `ServiceClient` wrapper |
| `packages/cloudflare/src/bindings/dispatch.ts` | `DispatchNamespace` wrapper |
| `packages/cloudflare/src/bindings/container.ts` | `ContainerClient` wrapper |
| `packages/cloudflare/src/__tests__/service.test.ts` | Tests for `ServiceClient` |
| `packages/cloudflare/src/__tests__/dispatch.test.ts` | Tests for `DispatchNamespace` |
| `packages/cloudflare/src/__tests__/container.test.ts` | Tests for `ContainerClient` |
| `packages/cloudflare/src/__tests__/provider.test.ts` | Tests for all new duck-type guards (extends existing if file already exists) |

### Modified Files

| File | Change |
|---|---|
| `packages/cloudflare/src/provider.ts` | Add `isFetcher()`, `isDispatchNamespace()`, `isContainerBinding()` guards and their branches in `registerBinding()` |
| `packages/cloudflare/src/index.ts` | Export `ServiceClient`, `DispatchNamespace`, `ContainerClient` |

---

## Implementation Details

---

### Component 1: ServiceClient

**Pattern to follow**: `D1Database` in `packages/cloudflare/src/bindings/d1.ts` — thin class wrapper, `raw` getter, typed method delegation.

**Overview**

Service bindings expose a `Fetcher` object with a single method: `fetch(request: Request | string, init?: RequestInit): Promise<Response>`. A `ServiceClient` wraps this into a developer-friendly API:

- `fetch()` — direct pass-through with URL normalization
- `get()`, `post()`, `put()`, `patch()`, `delete()` — HTTP verb helpers that construct a `Request` and call the underlying `Fetcher`
- `call<T>(method, ...args)` — DO-style RPC: `POST /rpc/<method>` with JSON-serialized args, expects a JSON response body of type `T`

**RPC convention**

`call<T>(method, ...args)` posts to `http://service/<method>` with body `JSON.stringify({ args })` and `Content-Type: application/json`. The receiving Worker reads `POST /rpc/<method>` from its router. This is a convention, not a protocol — nothing in the CF runtime enforces it. Both sides must implement the same shape.

Route format: `http://service/rpc/${method}` — the hostname `service` is a placeholder; Cloudflare replaces it with the internal binding resolution. The URL must be a valid `URL` for `new URL()` to parse; `http://service` satisfies this without leaking to the public internet.

**Implementation**

```ts
// packages/cloudflare/src/bindings/service.ts

export type ServiceFetchOptions = Omit<RequestInit, 'method'>;

export class ServiceClient {
  constructor(private fetcher: Fetcher) {}

  get raw(): Fetcher {
    return this.fetcher;
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    return this.fetcher.fetch(url, init);
  }

  async get(path: string, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, { ...options, method: 'GET' });
  }

  async post(path: string, body?: unknown, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify(body),
    });
  }

  async put(path: string, body?: unknown, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, {
      ...options,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify(body),
    });
  }

  async patch(path: string, body?: unknown, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, {
      ...options,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify(body),
    });
  }

  async delete(path: string, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, { ...options, method: 'DELETE' });
  }

  async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const response = await this.fetcher.fetch(`http://service/rpc/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    });
    if (!response.ok) {
      throw new ServiceCallError(method, response.status, await response.text());
    }
    return response.json() as Promise<T>;
  }
}

export class ServiceCallError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`Service RPC "${method}" failed with status ${status}: ${body}`);
    this.name = 'ServiceCallError';
  }
}
```

**wrangler.jsonc binding pattern**

```jsonc
{
  "services": [
    { "binding": "AUTH_SERVICE", "service": "auth-worker" },
    { "binding": "BILLING_SERVICE", "service": "billing-worker" }
  ]
}
```

**Test cases — service.test.ts**

- `fetch() delegates to the underlying Fetcher`
- `get() sends a GET request to the correct URL`
- `post() sends a POST request with JSON body and Content-Type header`
- `put() sends a PUT request with JSON body`
- `patch() sends a PATCH request with JSON body`
- `delete() sends a DELETE request`
- `call() posts to /rpc/<method> with serialized args`
- `call() returns parsed JSON response body`
- `call() throws ServiceCallError when response is not ok`
- `ServiceCallError includes method name, status, and body`
- `raw getter returns the underlying Fetcher`

**Feedback loop**

```bash
bun test --filter cloudflare
bun run typecheck
```

---

### Component 2: DispatchNamespace

**Pattern to follow**: `QueueSender` in `packages/cloudflare/src/bindings/queues.ts` — thin wrapper, typed methods, no extra indirection.

**Overview**

Workers for Platforms exposes a `DispatchNamespace` binding with a `get(scriptName, options?)` method that returns a `Fetcher` for that tenant's uploaded script. The wrapper:

- `dispatch(scriptName)` — returns a raw `Fetcher` for the named tenant script
- `dispatchClient(scriptName)` — returns a `ServiceClient` wrapping the dispatched `Fetcher`, enabling the full HTTP verb and RPC API
- Supports `outboundArgs` passthrough for outbound Worker configuration
- Security is untrusted mode by default (the CF runtime default); trusted mode is opt-in via `DispatchOptions`

**Trust modes**

| Mode | When to use |
|---|---|
| `untrusted` (default) | Multi-tenant SaaS. Tenant code cannot access your Worker's bindings or internal APIs. |
| `trusted` | Internal tooling where you control the uploaded scripts. Tenant code shares your Worker's bindings. |

Never use `trusted` mode for user-uploaded code. The spec enforces `untrusted` as the default and requires explicit opt-in for `trusted`.

**Implementation**

```ts
// packages/cloudflare/src/bindings/dispatch.ts

export type DispatchTrustMode = 'untrusted' | 'trusted';

export interface DispatchOptions {
  trust?: DispatchTrustMode;
  outboundArgs?: unknown[];
}

export class DispatchNamespaceClient {
  constructor(private namespace: DispatchNamespace) {}

  get raw(): DispatchNamespace {
    return this.namespace;
  }

  dispatch(scriptName: string, options?: DispatchOptions): Fetcher {
    return this.namespace.get(scriptName, {
      outbound: options?.outboundArgs ? { args: options.outboundArgs } : undefined,
    });
  }

  dispatchClient(scriptName: string, options?: DispatchOptions): ServiceClient {
    const fetcher = this.dispatch(scriptName, options);
    return new ServiceClient(fetcher);
  }
}
```

**Note on naming**: The CF global type is also called `DispatchNamespace`. The wrapper class is named `DispatchNamespaceClient` to avoid the collision. It is exported from `packages/cloudflare/src/index.ts` under both names for ergonomics:

```ts
export { DispatchNamespaceClient } from './bindings/dispatch.js';
export { DispatchNamespaceClient as DispatchNamespace } from './bindings/dispatch.js';
```

**OutboundWorker pattern**

An outbound Worker intercepts all `fetch()` calls made by tenant scripts. It is declared in `wrangler.jsonc` and is a separate Worker deployment — it cannot be declared in the same file as the dispatch binding. The outbound Worker receives an augmented request with the tenant's script name in `CF-Dispatch-Namespace` and `CF-Worker-Name` headers. Log, rate-limit, or block calls there.

```jsonc
// wrangler.jsonc on the platform Worker
{
  "dispatch_namespaces": [
    {
      "binding": "DISPATCH",
      "namespace": "tenant-scripts",
      "outbound": {
        "service": "outbound-interceptor-worker",
        "parameters": ["customer_id", "api_key"]
      }
    }
  ]
}
```

The `outbound.parameters` array names the values passed via `outboundArgs` at dispatch time:

```ts
// In your platform Worker
const client = dispatch.dispatchClient(tenantScriptName, {
  outboundArgs: [customerId, apiKey],
});
```

**Test cases — dispatch.test.ts**

- `dispatch() calls namespace.get() with the script name`
- `dispatch() passes outbound args when provided`
- `dispatch() omits outbound config when outboundArgs is absent`
- `dispatchClient() returns a ServiceClient wrapping the dispatched Fetcher`
- `trust mode is untrusted by default (no trust option passed through)`
- `raw getter returns the underlying DispatchNamespace`

**Feedback loop**

```bash
bun test --filter cloudflare
bun run typecheck
```

---

### Component 3: ContainerClient

**Pattern to follow**: `DurableObjectClient` in `packages/cloudflare/src/bindings/durable-objects.ts` — manages the DO layer; the binding-facing logic stays in the wrapper.

**Overview**

Containers run as managed processes inside a Durable Object. The architecture is always: Worker → DO → Container. The DO manages the container lifecycle; the Worker talks to the DO via its stub.

`ContainerClient` wraps a `DurableObjectNamespace` that is backed by a Container DO. It provides:

- `get(name)` — returns a `DurableObjectStub` for the named container (the DO manages the container internally)
- `getContainer(name)` — convenience: sends a `GET /` to the container DO and returns the response
- `send(name, path, init?)` — sends an arbitrary request to a named container via its DO
- `warmup(name)` — sends a `GET /health` to trigger a container start and keep it warm

**Lifecycle responsibilities**

The container lifecycle (start, stop, sleep) is managed inside the Durable Object class, not in `ContainerClient`. The DO class that developers write must extend `Container` from `cloudflare:workers` and implement `defaultSleepAfter`. `ContainerClient` only manages which DO instance to target.

**`sleepAfter` guidance**

| Workload | Recommended `sleepAfter` |
|---|---|
| Infrequent, latency-tolerant | `'30s'` or omit (cold start on demand) |
| Moderate traffic | `'30s'` to `'5m'` |
| High-frequency, latency-sensitive | `'10m'` or higher; consider persistent containers |

Cold start time is 3–15s. Set `sleepAfter` based on expected inter-request gap.

**Implementation**

```ts
// packages/cloudflare/src/bindings/container.ts

export interface ContainerSendOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}

export class ContainerClient {
  constructor(private namespace: DurableObjectNamespace) {}

  get raw(): DurableObjectNamespace {
    return this.namespace;
  }

  getStub(name: string): DurableObjectStub {
    const id = this.namespace.idFromName(name);
    return this.namespace.get(id);
  }

  async send(name: string, path: string, options?: ContainerSendOptions): Promise<Response> {
    const stub = this.getStub(name);
    return stub.fetch(`http://container${path}`, {
      method: options?.method ?? 'GET',
      headers: options?.headers,
      body: options?.body,
    });
  }

  async warmup(name: string): Promise<boolean> {
    try {
      const response = await this.send(name, '/health');
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

**DO implementation pattern (documentation, not framework code)**

Developers write their own DO class. The framework provides `ContainerClient` to call it. The DO class looks like:

```ts
import { Container, sleep } from 'cloudflare:workers';

export class MyContainer extends Container {
  defaultSleepAfter = sleep('30s');

  override async fetch(request: Request): Promise<Response> {
    return super.fetch(request);
  }
}
```

```jsonc
// wrangler.jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "MY_CONTAINER", "class_name": "MyContainer" }
    ]
  },
  "containers": [
    {
      "class_name": "MyContainer",
      "image": "./path/to/Dockerfile",
      "max_instances": 10
    }
  ]
}
```

Container sizes available: `lite` (256 MB, 1/16 vCPU), `basic` (512 MB, 1/8 vCPU), `basic-2` (1 GB, 1/4 vCPU), `standard` (2 GB, 1/2 vCPU), `standard-2` (4 GB, 1 vCPU), `standard-4` (12 GB, 4 vCPU). Default is `lite`. Set via `wrangler.jsonc` `containers[].instance_type`.

**Health check pattern**

The container image should expose `GET /health` returning HTTP 200. The DO routes it through. `ContainerClient.warmup()` calls this and returns `true` if the container is ready.

**Test cases — container.test.ts**

- `getStub() returns a DurableObjectStub for the named container`
- `send() sends a request to the container DO with the correct path`
- `send() uses GET method by default`
- `send() passes custom method, headers, and body`
- `warmup() sends GET /health and returns true on 200`
- `warmup() returns false when the health check fails`
- `warmup() returns false when the stub throws (cold start timeout)`
- `raw getter returns the underlying DurableObjectNamespace`

**Feedback loop**

```bash
bun test --filter cloudflare
bun run typecheck
```

---

### Component 4: Provider Auto-Detection

**Pattern to follow**: Existing guards in `packages/cloudflare/src/provider.ts` — `isKVNamespace()`, `isD1Database()`, etc.

**Overview**

Three new duck-type guards. The priority order in `registerBinding()` matters: guards are checked top-to-bottom, so more specific shapes must appear before more general ones.

**Guard logic**

A `Fetcher` has `fetch` but not `prepare`/`batch`/`send` (D1/Queue). A dispatch namespace has `get` but also has `fetch` on its instances (not on the namespace itself — the namespace has `get`, not `fetch`). A container binding is a `DurableObjectNamespace` (has `idFromName`, `idFromString`, `newUniqueId`, `get`) backed by a container; it is indistinguishable from a regular DO namespace via duck-typing alone, so it is not auto-detected separately — `DurableObjectClient` already handles it (added in Phase 2). Container bindings registered as DO bindings are already covered.

This means the three guards needed are:

1. `isFetcher(obj)` — detects service bindings
2. `isDispatchNamespace(obj)` — detects Workers for Platforms dispatch namespace
3. Container bindings: already handled by `isDurableObjectNamespace()` from Phase 2 — no new guard needed

**Guard implementations**

```ts
private isFetcher(obj: object): boolean {
  // Fetcher: has fetch, but NOT prepare/batch (D1) or send/sendBatch (Queue)
  // and NOT get/put/delete/list (KV/R2)
  return (
    'fetch' in obj &&
    !('prepare' in obj) &&
    !('batch' in obj) &&
    !('send' in obj) &&
    !('get' in obj) &&
    !('idFromName' in obj)
  );
}

private isDispatchNamespace(obj: object): boolean {
  // DispatchNamespace: has get() but returns a Fetcher, and has no put/delete/list
  // The distinguishing feature: has 'get' but NOT 'put', NOT 'delete', NOT 'list',
  // NOT 'prepare', NOT 'idFromName'
  // This is narrower than KVNamespace (which has get + put + delete + list)
  // and narrower than R2Bucket (which has head + get + put + delete + list)
  return (
    'get' in obj &&
    !('put' in obj) &&
    !('delete' in obj) &&
    !('list' in obj) &&
    !('prepare' in obj) &&
    !('idFromName' in obj) &&
    !('fetch' in obj)
  );
}
```

**Updated `registerBinding()` structure**

```ts
private registerBinding(key: string, binding: object): void {
  if (this.isKVNamespace(binding)) {
    this.app.container.singleton(key as any, () => new KVStore(binding as KVNamespace));
  } else if (this.isR2Bucket(binding)) {
    this.app.container.singleton(key as any, () => new R2Storage(binding as R2Bucket));
  } else if (this.isD1Database(binding)) {
    this.app.container.singleton(key as any, () => new D1Database(binding as globalThis.D1Database));
  } else if (this.isQueue(binding)) {
    this.app.container.singleton(key as any, () => new QueueSender(binding as Queue));
  } else if (this.isAi(binding)) {
    // Phase 2
    this.app.container.singleton(key as any, () => new AIClient(binding as Ai));
  } else if (this.isVectorize(binding)) {
    // Phase 2
    this.app.container.singleton(key as any, () => new VectorStore(binding as VectorizeIndex));
  } else if (this.isDurableObjectNamespace(binding)) {
    // Phase 2 — also covers container bindings (which are DO namespaces)
    this.app.container.singleton(key as any, () => new DurableObjectClient(binding as DurableObjectNamespace));
  } else if (this.isHyperdrive(binding)) {
    // Phase 2
    this.app.container.singleton(key as any, () => new HyperdriveClient(binding as Hyperdrive));
  } else if (this.isDispatchNamespace(binding)) {
    // Phase 7
    this.app.container.singleton(key as any, () => new DispatchNamespaceClient(binding as DispatchNamespace));
  } else if (this.isFetcher(binding)) {
    // Phase 7 — must come after all guards that include 'fetch'-adjacent methods
    this.app.container.singleton(key as any, () => new ServiceClient(binding as Fetcher));
  }
}
```

**Ordering rationale**

`isFetcher` is the most permissive positive guard (only requires `fetch`). It must be last among all guards, so specific binding types are not misidentified as service bindings. `isDispatchNamespace` is ordered before `isFetcher` because dispatch namespaces do not have `fetch` on the namespace object itself — the exclusion of `fetch` in `isDispatchNamespace` is a safety check, not a differentiator.

**Test cases — provider.test.ts additions**

- `registers ServiceClient for a Fetcher binding (service binding)`
- `does not register ServiceClient for a KV binding (has get)`
- `does not register ServiceClient for a Queue binding (has send)`
- `does not register ServiceClient for a DO namespace (has idFromName)`
- `registers DispatchNamespaceClient for a dispatch namespace binding`
- `does not register DispatchNamespaceClient for a KV binding (has put)`
- `does not register DispatchNamespaceClient for a DO namespace (has idFromName)`
- `existing bindings (KV, R2, D1, Queue, AI, Vectorize, DO, Hyperdrive) are unaffected by Phase 7 guards`

**Feedback loop**

```bash
bun test --filter cloudflare
bun run typecheck
```

---

## Testing Requirements

All tests use `bun test`. Test files live in `packages/cloudflare/src/__tests__/`.

Mock the `Fetcher`, `DispatchNamespace`, and `DurableObjectNamespace` as plain objects with the right shape — no Miniflare or real CF runtime needed for unit tests.

| Test file | Coverage |
|---|---|
| `__tests__/service.test.ts` | All `ServiceClient` methods; `ServiceCallError` shape; RPC path construction |
| `__tests__/dispatch.test.ts` | `DispatchNamespaceClient.dispatch()`; `dispatchClient()`; outbound args passthrough |
| `__tests__/container.test.ts` | `ContainerClient.send()`; `warmup()` happy and failure paths; stub targeting |
| `__tests__/provider.test.ts` | All new guards; negative cases for each existing binding type; ordering correctness |

**Fake binding shapes for tests**

```ts
// Fake Fetcher (service binding)
const fakeFetcher = {
  fetch: vi.fn().mockResolvedValue(new Response('ok')),
};

// Fake DispatchNamespace
const fakeDispatchNamespace = {
  get: vi.fn().mockReturnValue(fakeFetcher),
};

// Fake DurableObjectNamespace (container binding uses same shape as DO)
const fakeDONamespace = {
  idFromName: vi.fn().mockReturnValue('fake-id'),
  idFromString: vi.fn(),
  newUniqueId: vi.fn(),
  get: vi.fn().mockReturnValue({
    fetch: vi.fn().mockResolvedValue(new Response('ok')),
  }),
};
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `ServiceClient.call()` receives non-2xx response | Throws `ServiceCallError` with method, status, and response body text |
| `ServiceClient.call()` network error (Fetcher throws) | Error propagates unwrapped — callers handle it as a connectivity failure |
| `ContainerClient.warmup()` receives non-2xx | Returns `false`. No throw. |
| `ContainerClient.warmup()` stub throws (cold start timeout, DO unavailable) | Caught internally, returns `false`. Caller retries or degrades gracefully. |
| `DispatchNamespaceClient.dispatch()` for an unknown script name | CF runtime throws at `namespace.get()` — propagates unwrapped. The platform Worker should validate script names before dispatching. |
| `isFetcher` guard matches an unexpected binding type | Worst case: that binding is wrapped in `ServiceClient` and the first call fails. The exclusion checks (no `get`, no `send`, no `idFromName`) make false positives unlikely but not impossible with future CF binding additions. |

---

## Failure Modes

| Failure | Impact | Detection |
|---|---|---|
| Service binding latency exceeds expectation | 0.1–0.5ms co-located; 50–200ms when not co-located. No framework action — Smart Placement (Phase 1) handles co-location. | CF dashboard metrics; tail logs |
| Splitting Workers prematurely | Operational complexity without latency benefit. | Architecture review; only split on deployment frequency divergence, resource conflicts, team boundaries, or security isolation |
| Container cold start (3–15s) on first request | User-visible latency spike. | `ContainerClient.warmup()` called during app boot or via a scheduled cron job to keep containers pre-warmed |
| Tenant script in `untrusted` mode attempts to access platform bindings | CF runtime blocks access. Expected and correct. | No action needed |
| Tenant script in `trusted` mode unexpectedly accesses sensitive bindings | Security breach risk. | Audit all uses of `DispatchOptions.trust = 'trusted'`; never use with user-uploaded code |
| Container exceeds `instance_type` memory limit | CF terminates the container process. | Monitor via CF dashboard; increase `instance_type` in `wrangler.jsonc` |
| `isDurableObjectNamespace` guard (Phase 2) matches container binding | Container binding is wrapped as `DurableObjectClient` instead of `ContainerClient`. This is intentional — container bindings ARE DO namespaces. Callers use `ContainerClient` explicitly when they know the DO is backed by a container. | No issue; `DurableObjectClient.get()` returns a stub that routes to the container DO correctly |

---

## Validation Commands

```bash
# Run cloudflare package tests
bun test --filter cloudflare

# Type check all packages
bun run typecheck
```

---

## Rollout Considerations

**Backward compatibility**

- All three wrappers are new classes. No existing code is modified except `provider.ts` and `index.ts`.
- New guards in `registerBinding()` are additive and ordered after all Phase 2 guards. Existing detection is unaffected.
- `DispatchNamespaceClient` is exported as both `DispatchNamespaceClient` and `DispatchNamespace` to avoid confusion with the CF global type while still providing a clean name for users.

**When to use each component**

| Component | Use when |
|---|---|
| `ServiceClient` | Calling another Worker you own; zero-network-overhead internal APIs; auth service, billing service, email service as separate Workers |
| `DispatchNamespaceClient` | Running tenant-uploaded code; platform-as-a-service where customers deploy their own logic |
| `ContainerClient` | Workloads exceeding Worker limits: >128 MB memory, >5 min CPU, non-JS runtimes (Python, Go, Rust), legacy processes |

**Splitting guidance**

Do not split Workers preemptively. Split only when one of these conditions is true:
- Deployment frequency diverges (one part deploys hourly, another monthly)
- Resource requirements conflict (one handler needs 512 MB memory, others need 16 MB)
- Team ownership boundaries require separate deploy pipelines
- Security isolation is required (PCI-scope code must not share a runtime with marketing pages)

Shared state between Workers requires Durable Objects or D1 — there is no shared memory across Worker instances.
