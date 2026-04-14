# Phase 9 Spec: Events + Broadcasting

**Initiative**: CF Platform Completeness
**Phase**: 9
**Status**: Ready to implement
**Blocks**: Nothing
**Blocked by**: Phase 1 (ServiceProvider, Application container), Phase 3 or equivalent (Queue/Job dispatch for queued listeners)

---

## Technical Approach

Two new packages plus CLI generator additions. None of the four components depend on each other during development, but `@roost/broadcast` depends on `@roost/events` at runtime (a `BroadcastableEvent` extends `Event`).

1. **`@roost/events`** — Synchronous event dispatch with optional queued listeners. Modeled on `Job`'s fake/restore/assert pattern. `EventServiceProvider` wires listener registrations into the `Application` container. `ShouldQueue` listeners dispatch a `Job` to a CF Queue instead of running inline.

2. **`@roost/broadcast`** — WebSocket broadcasting over Durable Objects. `ChannelDO` is the DO class that manages connections, presence, and authorization. `BroadcastManager` routes `BroadcastableEvent` dispatches to the right DO stub. `BroadcastServiceProvider` registers the DO namespace binding. Client helper ships as a separate entry point `@roost/broadcast/client`.

3. **Client-side helper** (`@roost/broadcast/client`) — Minimal WebSocket client with auto-reconnect and channel subscription. Zero server-side imports. Bundled as a separate entry point so it can be imported from browser/edge without pulling in DO types.

4. **CLI generators** — `roost make:event`, `roost make:listener`, `roost make:channel` added to `packages/cli`.

---

## Feedback Strategy

Inner loop per component:

- `@roost/events`: `bun test --filter events` after each class added
- `@roost/broadcast` (server): `bun test --filter broadcast` after each class added; DO tests require `workerd` test runner
- Client helper: `bun test --filter broadcast` (client entry point tests run in the same package)
- CLI generators: `bun test --filter cli`

Full gate before any commit: `bun run typecheck` must pass clean.

---

## File Changes

### New Packages

| Package | Location | Purpose |
|---|---|---|
| `@roost/events` | `packages/events/` | Event dispatch, listeners, fakes |
| `@roost/broadcast` | `packages/broadcast/` | DO-backed WebSocket broadcasting |

### New Files — `@roost/events`

| File | Purpose |
|---|---|
| `packages/events/src/event.ts` | `Event` base class with `dispatch()`, `fake()`, `restore()`, `assertDispatched()`, `assertNotDispatched()` |
| `packages/events/src/listener.ts` | `Listener` interface + `ShouldQueue` marker interface |
| `packages/events/src/subscriber.ts` | `Subscriber` abstract class |
| `packages/events/src/dispatcher.ts` | `EventDispatcher` — resolves and calls listeners, handles `ShouldQueue` routing |
| `packages/events/src/provider.ts` | `EventServiceProvider` — registers listener map in container |
| `packages/events/src/fake.ts` | `EventFake` — records dispatches for assertions |
| `packages/events/src/types.ts` | Shared types: `ListenerMap`, `EventClass`, `ListenerClass` |
| `packages/events/src/index.ts` | Package exports |
| `packages/events/package.json` | Package manifest |
| `packages/events/tsconfig.json` | TypeScript config (extends root) |
| `packages/events/__tests__/event.test.ts` | Tests for `Event` dispatch + fakes |
| `packages/events/__tests__/dispatcher.test.ts` | Tests for sync dispatch, `ShouldQueue` routing |
| `packages/events/__tests__/subscriber.test.ts` | Tests for subscriber pattern |
| `packages/events/__tests__/provider.test.ts` | Tests for `EventServiceProvider` boot integration |

### New Files — `@roost/broadcast`

| File | Purpose |
|---|---|
| `packages/broadcast/src/event.ts` | `BroadcastableEvent` interface |
| `packages/broadcast/src/channel.ts` | `Channel`, `PrivateChannel`, `PresenceChannel` classes |
| `packages/broadcast/src/manager.ts` | `BroadcastManager` — routes events to DO stubs |
| `packages/broadcast/src/channel-do.ts` | `ChannelDO` — Durable Object with WebSocket hibernation |
| `packages/broadcast/src/provider.ts` | `BroadcastServiceProvider` |
| `packages/broadcast/src/fake.ts` | `BroadcastFake` with `Broadcast.fake()`, assertions |
| `packages/broadcast/src/client.ts` | `createBroadcastClient` — client-side WebSocket helper |
| `packages/broadcast/src/types.ts` | Shared types: `PresenceMember`, `ConnectionMeta`, `BroadcastMessage` |
| `packages/broadcast/src/index.ts` | Server exports (excludes `client.ts`) |
| `packages/broadcast/src/client-index.ts` | Client entry point (`@roost/broadcast/client`) |
| `packages/broadcast/package.json` | Package manifest with `exports` map for client entry |
| `packages/broadcast/tsconfig.json` | TypeScript config |
| `packages/broadcast/__tests__/channel-do.test.ts` | DO WebSocket tests (workerd runner) |
| `packages/broadcast/__tests__/manager.test.ts` | `BroadcastManager` routing tests |
| `packages/broadcast/__tests__/fake.test.ts` | Fake assertion tests |
| `packages/broadcast/__tests__/client.test.ts` | Client reconnect + subscription tests |

### Modified Files

| File | Package | Change |
|---|---|---|
| `packages/cli/src/commands/make.ts` | `@roost/cli` | Add `event`, `listener`, `channel` subcommands (or create `make.ts` if absent) |
| `packages/cli/__tests__/make.test.ts` | `@roost/cli` | Tests for new generator commands |

---

## Implementation Details

---

### Component 1: `@roost/events`

---

#### `Event` base class

**File**: `packages/events/src/event.ts`

`Event` mirrors the `Job` fake pattern exactly: a module-level `WeakMap<Function, EventFake>` keyed by the event class, so fakes are per-class and garbage-collected when the class is GC'd.

```typescript
// packages/events/src/event.ts

import type { EventClass } from './types.js';
import { EventFake } from './fake.js';
import { EventDispatcher } from './dispatcher.js';

const fakes = new WeakMap<Function, EventFake>();

export abstract class Event {
  static async dispatch<T extends Event>(this: EventClass<T>, event: T): Promise<void> {
    const fake = fakes.get(this);
    if (fake) {
      fake.recordDispatch(event);
      return;
    }
    await EventDispatcher.get().dispatch(event);
  }

  static fake(): void {
    fakes.set(this, new EventFake());
  }

  static restore(): void {
    fakes.delete(this);
  }

  static assertDispatched<T extends Event>(
    this: EventClass<T>,
    callback?: (event: T) => boolean
  ): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);

    if (callback) {
      const found = fake.dispatched.some((e) => e instanceof this && callback(e as T));
      if (!found) {
        throw new Error(
          `Expected ${this.name} to be dispatched matching the given callback, but it was not`
        );
      }
    } else {
      const found = fake.dispatched.some((e) => e instanceof this);
      if (!found) {
        throw new Error(
          `Expected ${this.name} to be dispatched, but it was not. Dispatched: ${JSON.stringify(fake.dispatched.map((e) => e.constructor.name))}`
        );
      }
    }
  }

  static assertNotDispatched<T extends Event>(this: EventClass<T>): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);

    const found = fake.dispatched.some((e) => e instanceof this);
    if (found) {
      throw new Error(`Expected ${this.name} not to be dispatched, but it was`);
    }
  }
}
```

The `assertDispatched` optional callback allows assertions like:
```typescript
OrderCreated.assertDispatched((e) => e.orderId === '123');
```

---

#### `EventFake`

**File**: `packages/events/src/fake.ts`

```typescript
// packages/events/src/fake.ts

import type { Event } from './event.js';

export class EventFake {
  public dispatched: Event[] = [];

  recordDispatch(event: Event): void {
    this.dispatched.push(event);
  }
}
```

The fake stores the entire event instance (not just the class name), which allows the optional `callback` assertion on `assertDispatched` to inspect event properties.

---

#### `Listener` interface and `ShouldQueue`

**File**: `packages/events/src/listener.ts`

```typescript
// packages/events/src/listener.ts

export interface Listener<T = unknown> {
  handle(event: T): void | Promise<void>;
}

// Marker interface: apply to a Listener class to have it dispatched as a Job
// instead of called synchronously.
export interface ShouldQueue {
  readonly shouldQueue: true;
}
```

`ShouldQueue` is a marker: the `EventDispatcher` checks `'shouldQueue' in listener && listener.shouldQueue === true` after constructing the listener instance. This keeps the interface nominal without runtime overhead beyond a property check.

---

#### `Subscriber` abstract class

**File**: `packages/events/src/subscriber.ts`

A `Subscriber` is a single class that handles multiple event types. It implements `subscribe()`, which returns a map from event classes to method names on the subscriber.

```typescript
// packages/events/src/subscriber.ts

import type { EventClass } from './types.js';
import type { Event } from './event.js';

export abstract class Subscriber {
  abstract subscribe(): Map<EventClass<Event>, string>;
}
```

Usage:
```typescript
class OrderSubscriber extends Subscriber {
  subscribe() {
    return new Map([
      [OrderCreated, 'onOrderCreated'],
      [OrderShipped, 'onOrderShipped'],
    ]);
  }

  onOrderCreated(event: OrderCreated) { /* ... */ }
  onOrderShipped(event: OrderShipped) { /* ... */ }
}
```

`EventServiceProvider.subscribe(OrderSubscriber)` calls `subscriber.subscribe()` and registers each mapping as if it were a plain listener.

---

#### `EventDispatcher`

**File**: `packages/events/src/dispatcher.ts`

Singleton (stored in module scope, replaced by `EventServiceProvider` at boot). Follows the `Dispatcher` pattern from `packages/queue/src/dispatcher.ts`.

```typescript
// packages/events/src/dispatcher.ts

import type { ListenerMap, EventClass, ListenerClass } from './types.js';
import type { Event } from './event.js';
import type { Listener } from './listener.js';

let instance: EventDispatcher | null = null;

export class EventDispatcher {
  private listeners: ListenerMap = new Map();

  static get(): EventDispatcher {
    if (!instance) {
      instance = new EventDispatcher();
    }
    return instance;
  }

  static set(dispatcher: EventDispatcher): void {
    instance = dispatcher;
  }

  registerListener(eventClass: EventClass<Event>, listenerClass: ListenerClass): void {
    const existing = this.listeners.get(eventClass) ?? [];
    this.listeners.set(eventClass, [...existing, listenerClass]);
  }

  async dispatch(event: Event): Promise<void> {
    const listenerClasses = this.listeners.get(event.constructor as EventClass<Event>) ?? [];

    await Promise.all(
      listenerClasses.map(async (ListenerClass) => {
        const listener = new ListenerClass() as Listener & { shouldQueue?: true };

        if ('shouldQueue' in listener && listener.shouldQueue === true) {
          // Import lazily to avoid circular dep; @roost/queue must be a peer dep
          const { Job } = await import('@roost/queue');
          // The listener itself IS the job — it must extend Job<T>
          // Dispatch the listener class as a Job with the event as payload
          await (ListenerClass as unknown as typeof Job).dispatch(event);
          return;
        }

        await listener.handle(event);
      })
    );
  }
}
```

**Queued listener contract**: A listener that implements `ShouldQueue` must also extend `Job<T>`. Its `handle()` method on the Job side receives `this.payload` (the event). This is the same pattern Laravel uses: the listener class doubles as the Job class. The `EventDispatcher` calls `ListenerClass.dispatch(event)` treating the listener as a `Job` subclass. `@roost/queue` is declared as a `peerDependency` in `packages/events/package.json` — if not installed, the `ShouldQueue` path throws at runtime with a clear message.

---

#### `EventServiceProvider`

**File**: `packages/events/src/provider.ts`

```typescript
// packages/events/src/provider.ts

import { ServiceProvider } from '@roost/core';
import { EventDispatcher } from './dispatcher.js';
import type { EventClass, ListenerClass, SubscriberClass } from './types.js';
import type { Event } from './event.js';
import { Subscriber } from './subscriber.js';

export abstract class EventServiceProvider extends ServiceProvider {
  // Override in application EventServiceProvider to define listener registrations
  protected listen(): Map<EventClass<Event>, ListenerClass[]> {
    return new Map();
  }

  // Override to register subscribers
  protected subscribers(): SubscriberClass[] {
    return [];
  }

  register(): void {
    const dispatcher = new EventDispatcher();

    for (const [eventClass, listenerClasses] of this.listen()) {
      for (const listenerClass of listenerClasses) {
        dispatcher.registerListener(eventClass, listenerClass);
      }
    }

    for (const SubscriberClass of this.subscribers()) {
      const subscriber = new SubscriberClass();
      for (const [eventClass, methodName] of subscriber.subscribe()) {
        // Wrap method as a listener
        const method = (subscriber as Record<string, unknown>)[methodName];
        if (typeof method !== 'function') {
          throw new Error(
            `Subscriber method "${methodName}" not found on ${SubscriberClass.name}`
          );
        }
        dispatcher.registerListener(eventClass, {
          name: `${SubscriberClass.name}@${methodName}`,
          new: () => ({ handle: (e: Event) => method.call(subscriber, e) }),
        } as unknown as ListenerClass);
      }
    }

    EventDispatcher.set(dispatcher);
    this.app.container.singleton('events.dispatcher', () => dispatcher);
  }
}
```

Application-level usage:
```typescript
class AppEventServiceProvider extends EventServiceProvider {
  protected listen() {
    return new Map([
      [OrderCreated, [SendOrderConfirmation, UpdateInventory]],
    ]);
  }
}
```

---

#### Types

**File**: `packages/events/src/types.ts`

```typescript
// packages/events/src/types.ts

import type { Event } from './event.js';
import type { Subscriber } from './subscriber.js';

export type EventClass<T extends Event = Event> = {
  new (...args: unknown[]): T;
  dispatch(event: T): Promise<void>;
  fake(): void;
  restore(): void;
};

export type ListenerClass = {
  new (): { handle(event: unknown): void | Promise<void> };
  name: string;
};

export type SubscriberClass = {
  new (): Subscriber;
};

export type ListenerMap = Map<EventClass<Event>, ListenerClass[]>;
```

---

### Component 2: `@roost/broadcast`

---

#### Channel types

**File**: `packages/broadcast/src/channel.ts`

```typescript
// packages/broadcast/src/channel.ts

export class Channel {
  constructor(readonly name: string) {}
}

export class PrivateChannel extends Channel {}

export class PresenceChannel extends Channel {}
```

These are value objects — the `BroadcastManager` inspects `instanceof` to determine the DO routing and authorization behavior.

---

#### `BroadcastableEvent` interface

**File**: `packages/broadcast/src/event.ts`

```typescript
// packages/broadcast/src/event.ts

import type { Channel } from './channel.js';

export interface BroadcastableEvent {
  broadcastOn(): Channel[];
  broadcastWith(): Record<string, unknown>;
  // Optional: override to change the event name sent to clients. Defaults to constructor.name.
  broadcastAs?(): string;
}
```

Usage on an event class:
```typescript
class OrderCreated extends Event implements BroadcastableEvent {
  constructor(readonly orderId: string) { super(); }

  broadcastOn() {
    return [new PrivateChannel(`order.${this.orderId}`)];
  }

  broadcastWith() {
    return { orderId: this.orderId };
  }
}
```

The `EventDispatcher` calls `BroadcastManager.get().broadcast(event)` after running sync listeners if the event implements `BroadcastableEvent`. Detection: `'broadcastOn' in event && typeof event.broadcastOn === 'function'`.

---

#### `BroadcastManager`

**File**: `packages/broadcast/src/manager.ts`

```typescript
// packages/broadcast/src/manager.ts

import { DurableObjectClient } from '@roost/cloudflare';
import type { BroadcastableEvent } from './event.js';
import { PrivateChannel, PresenceChannel } from './channel.js';
import type { BroadcastMessage } from './types.js';
import { BroadcastFake } from './fake.js';

const fakes = new WeakMap<typeof BroadcastManager, BroadcastFake>();

export class BroadcastManager {
  private static instance: BroadcastManager | null = null;

  constructor(private doClient: DurableObjectClient) {}

  static get(): BroadcastManager {
    if (!BroadcastManager.instance) {
      throw new Error('BroadcastManager not initialized. Register BroadcastServiceProvider.');
    }
    return BroadcastManager.instance;
  }

  static set(manager: BroadcastManager): void {
    BroadcastManager.instance = manager;
  }

  static fake(): void {
    fakes.set(BroadcastManager, new BroadcastFake());
  }

  static restore(): void {
    fakes.delete(BroadcastManager);
    BroadcastManager.instance = null;
  }

  static assertBroadcast(eventClass: { new (...args: unknown[]): BroadcastableEvent }): void {
    const fake = fakes.get(BroadcastManager);
    if (!fake) throw new Error('BroadcastManager.fake() was not called');
    const found = fake.broadcasts.some((b) => b.event instanceof eventClass);
    if (!found) {
      throw new Error(
        `Expected ${eventClass.name} to be broadcast, but it was not`
      );
    }
  }

  static assertBroadcastOn(channel: string): void {
    const fake = fakes.get(BroadcastManager);
    if (!fake) throw new Error('BroadcastManager.fake() was not called');
    const found = fake.broadcasts.some((b) => b.channel === channel);
    if (!found) {
      throw new Error(`Expected broadcast on channel "${channel}", but none was recorded`);
    }
  }

  async broadcast(event: BroadcastableEvent): Promise<void> {
    const fake = fakes.get(BroadcastManager);

    const channels = event.broadcastOn();
    const payload = event.broadcastWith();
    const eventName = event.broadcastAs?.() ?? (event as unknown as { constructor: { name: string } }).constructor.name;

    const message: BroadcastMessage = {
      event: eventName,
      data: payload,
    };

    await Promise.all(
      channels.map(async (channel) => {
        if (fake) {
          fake.recordBroadcast(event as Parameters<typeof fake.recordBroadcast>[0], channel.name);
          return;
        }

        const stub = this.doClient.get(channel.name);
        await stub.fetch(new Request('https://internal/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...message,
            type: channel instanceof PresenceChannel
              ? 'presence'
              : channel instanceof PrivateChannel
                ? 'private'
                : 'public',
          }),
        }));
      })
    );
  }
}
```

**Internal protocol**: The `BroadcastManager` calls `stub.fetch(POST /broadcast)` with a JSON body. `ChannelDO` handles this internal route by calling `this.env.ctx.getWebSockets()` and broadcasting to all connected clients. This keeps the DO interface clean — one HTTP route for server-to-DO push, one WebSocket upgrade route for client connections.

---

#### `ChannelDO`

**File**: `packages/broadcast/src/channel-do.ts`

The heart of the broadcasting system. Uses WebSocket hibernation throughout — no `handleSession()`, no in-memory connection tracking between hibernation cycles.

```typescript
// packages/broadcast/src/channel-do.ts

import type { ConnectionMeta, PresenceMember, BroadcastMessage } from './types.js';

export class ChannelDO implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Record<string, unknown>
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Client WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleUpgrade(request);
    }

    // Internal server-to-DO broadcast push
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }

    // Presence member list
    if (url.pathname === '/presence' && request.method === 'GET') {
      return this.handlePresenceList();
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleUpgrade(request: Request): Promise<Response> {
    const channelType = new URL(request.url).searchParams.get('type') ?? 'public';

    // Authorization for private/presence channels
    if (channelType === 'private' || channelType === 'presence') {
      const authResult = await this.authorize(request);
      if (!authResult.ok) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];

    const meta: ConnectionMeta = {
      userId: this.extractUserId(request),
      joinedAt: Date.now(),
      channelType,
    };

    this.state.acceptWebSocket(server, [JSON.stringify(meta)]);

    // Send presence join event to all existing connections (presence channels only)
    if (channelType === 'presence' && meta.userId) {
      const member: PresenceMember = {
        id: meta.userId,
        joinedAt: meta.joinedAt,
      };
      this.broadcastToAll(JSON.stringify({
        event: 'presence:join',
        data: { member },
      }), server);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const message = await request.json<BroadcastMessage & { type: string }>();
    const sockets = this.state.getWebSockets();

    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify({ event: message.event, data: message.data }));
      } catch {
        // Socket closed between getWebSockets() and send — ignore
      }
    }

    return new Response(null, { status: 204 });
  }

  private handlePresenceList(): Response {
    const sockets = this.state.getWebSockets();
    const members: PresenceMember[] = sockets
      .map((ws) => {
        const tags = ws.serializeAttachment() as string[] | undefined;
        if (!tags?.[0]) return null;
        try {
          const meta = JSON.parse(tags[0]) as ConnectionMeta;
          if (!meta.userId) return null;
          return { id: meta.userId, joinedAt: meta.joinedAt } satisfies PresenceMember;
        } catch {
          return null;
        }
      })
      .filter((m): m is PresenceMember => m !== null);

    return Response.json({ members });
  }

  // WebSocket hibernation handlers — called by the runtime, not by fetch()
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Relay whisper messages to other connected clients
    let parsed: { event: string; data?: unknown; channel?: string } | null = null;

    try {
      parsed = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (parsed?.event === 'whisper') {
      this.broadcastToAll(JSON.stringify({
        event: 'whisper',
        data: parsed.data,
      }), ws);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const tags = ws.serializeAttachment() as string[] | undefined;
    if (!tags?.[0]) return;

    try {
      const meta = JSON.parse(tags[0]) as ConnectionMeta;
      if (meta.channelType === 'presence' && meta.userId) {
        this.broadcastToAll(JSON.stringify({
          event: 'presence:leave',
          data: { member: { id: meta.userId } },
        }), ws);
      }
    } catch {
      // Corrupt attachment — ignore
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    ws.close(1011, 'Internal error');
  }

  private broadcastToAll(message: string, exclude?: WebSocket): void {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
        // Closed between getWebSockets() and send — ignore
      }
    }
  }

  private async authorize(
    request: Request
  ): Promise<{ ok: boolean }> {
    // Default: check Authorization header for a bearer token.
    // Applications override ChannelDO and implement their own authorize().
    const auth = request.headers.get('Authorization') ?? '';
    return { ok: auth.startsWith('Bearer ') && auth.length > 7 };
  }

  private extractUserId(request: Request): string | undefined {
    // Extract user ID from a signed token in query params or Authorization header.
    // Default implementation reads `?userId=` query param — override in applications.
    return new URL(request.url).searchParams.get('userId') ?? undefined;
  }
}
```

**Key decisions**:

- `this.state.acceptWebSocket(server, [JSON.stringify(meta)])` — the tags array carries the serialized `ConnectionMeta`. Tags survive hibernation and are available on `webSocketMessage`/`webSocketClose` via `ws.serializeAttachment()`.
- `this.state.getWebSockets()` is called fresh in every handler — hibernation means there is no in-memory socket list between requests. This is the correct pattern.
- `broadcastToAll(message, exclude)` skips the sender to avoid echo on whisper events.
- `authorize` and `extractUserId` are overridable extension points. Applications extend `ChannelDO` and override these two methods.
- The `WebSocketPair` constructor returns two sockets. Only `client` is returned to the browser; `server` is accepted by the DO. The runtime ensures the pair is connected.
- Output gating: DO state transitions (socket accept) are automatically output-gated — no explicit `blockConcurrencyWhile` is needed for the accept path.

---

#### `BroadcastFake`

**File**: `packages/broadcast/src/fake.ts`

```typescript
// packages/broadcast/src/fake.ts

import type { BroadcastableEvent } from './event.js';

export class BroadcastFake {
  public broadcasts: Array<{ event: BroadcastableEvent; channel: string }> = [];

  recordBroadcast(event: BroadcastableEvent, channel: string): void {
    this.broadcasts.push({ event, channel });
  }
}
```

---

#### `BroadcastServiceProvider`

**File**: `packages/broadcast/src/provider.ts`

```typescript
// packages/broadcast/src/provider.ts

import { ServiceProvider } from '@roost/core';
import { DurableObjectClient } from '@roost/cloudflare';
import { BroadcastManager } from './manager.js';

export class BroadcastServiceProvider extends ServiceProvider {
  // Override to customize the binding name. Defaults to 'BROADCAST_DO'.
  protected bindingName(): string {
    return 'BROADCAST_DO';
  }

  register(): void {
    const namespace = this.app.env[this.bindingName()] as DurableObjectNamespace;
    if (!namespace) {
      throw new Error(
        `BroadcastServiceProvider: binding "${this.bindingName()}" not found in env. ` +
        `Add a Durable Object binding named "${this.bindingName()}" to wrangler.jsonc.`
      );
    }

    const doClient = new DurableObjectClient(namespace);
    const manager = new BroadcastManager(doClient);
    BroadcastManager.set(manager);

    this.app.container.singleton('broadcast.manager', () => manager);
  }
}
```

**wrangler.jsonc** entries the application must add:
```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "BROADCAST_DO",
        "class_name": "ChannelDO"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["ChannelDO"]
    }
  ]
}
```

`ChannelDO` must be exported from the Worker's entry point:
```typescript
export { ChannelDO } from '@roost/broadcast';
```

---

#### Shared types

**File**: `packages/broadcast/src/types.ts`

```typescript
// packages/broadcast/src/types.ts

export interface ConnectionMeta {
  userId?: string;
  joinedAt: number;
  channelType: 'public' | 'private' | 'presence';
}

export interface PresenceMember {
  id: string;
  joinedAt: number;
}

export interface BroadcastMessage {
  event: string;
  data: Record<string, unknown>;
}
```

---

#### Integrating broadcast dispatch with `EventDispatcher`

The `EventDispatcher` in `@roost/events` should check for `BroadcastableEvent` and delegate to `BroadcastManager` after running sync listeners. This is done by detecting the interface at runtime without a hard import dependency on `@roost/broadcast`:

```typescript
// In EventDispatcher.dispatch(), after running all listeners:
if ('broadcastOn' in event && typeof (event as Record<string, unknown>).broadcastOn === 'function') {
  // Lazy import to avoid hard dep; @roost/broadcast is a peer dep
  try {
    const { BroadcastManager } = await import('@roost/broadcast');
    await BroadcastManager.get().broadcast(
      event as import('@roost/broadcast').BroadcastableEvent
    );
  } catch {
    // @roost/broadcast not installed or not configured — skip silently
  }
}
```

This keeps `@roost/events` usable without installing `@roost/broadcast`. Broadcasting only activates when the package is present and `BroadcastServiceProvider` has been registered.

---

### Component 3: Client-side helper (`@roost/broadcast/client`)

**File**: `packages/broadcast/src/client.ts`

No server-side imports. This file must not import anything from `packages/broadcast/src/channel-do.ts`, `packages/broadcast/src/provider.ts`, or `@roost/cloudflare`. It only imports from `packages/broadcast/src/types.ts` for `BroadcastMessage`.

```typescript
// packages/broadcast/src/client.ts

export interface BroadcastClientOptions {
  // Initial reconnect delay in ms. Default: 1000.
  initialDelay?: number;
  // Max reconnect delay in ms (exponential backoff cap). Default: 30000.
  maxDelay?: number;
  // Called when the connection is established or re-established.
  onConnect?: () => void;
  // Called when the connection is closed unexpectedly.
  onDisconnect?: (code: number, reason: string) => void;
}

export interface BroadcastClient {
  subscribe(channel: string, handler: (event: string, data: unknown) => void): () => void;
  unsubscribe(channel: string): void;
  whisper(channel: string, event: string, data?: unknown): void;
  close(): void;
}

export function createBroadcastClient(
  urlOrFactory: string | (() => string),
  options: BroadcastClientOptions = {}
): BroadcastClient {
  const {
    initialDelay = 1000,
    maxDelay = 30000,
    onConnect,
    onDisconnect,
  } = options;

  type Handler = (event: string, data: unknown) => void;
  const channelHandlers = new Map<string, Handler[]>();
  let ws: WebSocket | null = null;
  let reconnectDelay = initialDelay;
  let closed = false;

  function getUrl(): string {
    return typeof urlOrFactory === 'function' ? urlOrFactory() : urlOrFactory;
  }

  function connect(): void {
    if (closed) return;
    ws = new WebSocket(getUrl());

    ws.addEventListener('open', () => {
      reconnectDelay = initialDelay;
      onConnect?.();
    });

    ws.addEventListener('message', (ev) => {
      let parsed: { event: string; data: unknown } | null = null;
      try {
        parsed = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (!parsed?.event) return;

      const handlers = channelHandlers.get('*') ?? [];
      for (const h of handlers) h(parsed.event, parsed.data);
    });

    ws.addEventListener('close', (ev) => {
      onDisconnect?.(ev.code, ev.reason);
      if (closed) return;
      // Exponential backoff
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
        connect();
      }, reconnectDelay);
    });

    ws.addEventListener('error', () => {
      // 'error' always precedes 'close'; let 'close' handle reconnect
    });
  }

  connect();

  return {
    subscribe(channel, handler) {
      // The current ChannelDO broadcasts to all connections on a given DO.
      // The client-side channel is a logical filter on the '*' handler.
      const wrapper: Handler = (event, data) => {
        // Channel-specific events arrive prefixed as "channel:event" or the raw event
        // (ChannelDO does not prefix — the channel IS the DO, one DO per channel).
        handler(event, data);
      };
      const existing = channelHandlers.get(channel) ?? [];
      channelHandlers.set(channel, [...existing, wrapper]);

      // Return unsubscribe function
      return () => {
        const handlers = channelHandlers.get(channel) ?? [];
        channelHandlers.set(
          channel,
          handlers.filter((h) => h !== wrapper)
        );
      };
    },

    unsubscribe(channel) {
      channelHandlers.delete(channel);
    },

    whisper(channel, event, data) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'whisper', channel, data: { event, data } }));
      }
    },

    close() {
      closed = true;
      ws?.close(1000, 'Client closed');
    },
  };
}
```

**Design notes**:

- `urlOrFactory` accepts a function so callers can inject auth tokens into the WebSocket URL at connect time (including reconnect). Tokens embedded in query params can rotate between reconnects: `createBroadcastClient(() => \`wss://app.example/ws?token=${getToken()}\`)`.
- One `BroadcastClient` instance connects to one channel (one DO). To listen to multiple channels, create multiple clients — one per channel. This matches the one-DO-per-channel architecture.
- `subscribe()` returns an unsubscribe function (the common React pattern) in addition to `unsubscribe(channel)` for imperative cleanup.
- Auto-reconnect: exponential backoff capped at `maxDelay`. `closed` flag prevents reconnection after explicit `close()`.
- Every Worker deployment closes all WebSocket connections — this auto-reconnect ensures clients recover transparently.

**Package exports map** (`packages/broadcast/package.json`):
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./client": {
      "import": "./dist/client-index.js",
      "types": "./dist/client-index.d.ts"
    }
  }
}
```

**Client entry point** (`packages/broadcast/src/client-index.ts`):
```typescript
export { createBroadcastClient } from './client.js';
export type { BroadcastClient, BroadcastClientOptions } from './client.js';
```

---

### Component 4: CLI generators

**Files**: `packages/cli/src/commands/make.ts` (or adds subcommands to existing file)

Follows the pattern of existing `roost make:*` commands. Each generator writes a file to the project's `src/` directory using a template string.

#### `roost make:event <Name>`

Generates `src/events/{name}.ts`:

```typescript
// Template output for: roost make:event OrderCreated
import { Event } from '@roost/events';

export class OrderCreated extends Event {
  constructor(
    // Add event properties here
  ) {
    super();
  }
}
```

If the event should be broadcastable, the `--broadcast` flag generates:

```typescript
import { Event } from '@roost/events';
import { type BroadcastableEvent, PrivateChannel } from '@roost/broadcast';

export class OrderCreated extends Event implements BroadcastableEvent {
  constructor(readonly orderId: string) {
    super();
  }

  broadcastOn() {
    return [new PrivateChannel(`order.${this.orderId}`)];
  }

  broadcastWith() {
    return { orderId: this.orderId };
  }
}
```

#### `roost make:listener <Name> [--event <EventName>]`

Generates `src/listeners/{name}.ts`:

```typescript
// Template output for: roost make:listener SendOrderConfirmation --event OrderCreated
import type { Listener } from '@roost/events';
import type { OrderCreated } from '../events/order-created.js';

export class SendOrderConfirmation implements Listener<OrderCreated> {
  async handle(event: OrderCreated): Promise<void> {
    // Handle the event
  }
}
```

With `--queued` flag, adds `ShouldQueue` and extends `Job`:

```typescript
import { Job } from '@roost/queue';
import type { Listener, ShouldQueue } from '@roost/events';
import type { OrderCreated } from '../events/order-created.js';

export class SendOrderConfirmation extends Job<OrderCreated> implements Listener<OrderCreated>, ShouldQueue {
  readonly shouldQueue = true as const;

  async handle(): Promise<void> {
    const event = this.payload;
    // Handle the event
  }
}
```

#### `roost make:channel <Name>`

Generates `src/channels/{name}.ts` — a channel authorization definition:

```typescript
// Template output for: roost make:channel OrderChannel
export class OrderChannel {
  // Returns true if the given user is authorized to join this channel
  static authorize(userId: string, channelParams: Record<string, string>): boolean {
    // Implement authorization logic
    return false;
  }
}
```

For presence channels, the `--presence` flag adds a `presenceData` method:

```typescript
export class OrderChannel {
  static authorize(userId: string, channelParams: Record<string, string>): boolean {
    return false;
  }

  // Data sent to other presence members when this user joins
  static presenceData(userId: string): Record<string, unknown> {
    return { id: userId };
  }
}
```

---

## Testing Requirements

### `@roost/events` tests

**`packages/events/__tests__/event.test.ts`**

- `Event.dispatch(event)` calls `EventDispatcher.get().dispatch(event)` when no fake is active
- `Event.fake()` intercepts `dispatch` calls without calling the real dispatcher
- `Event.restore()` re-enables real dispatch after faking
- `Event.assertDispatched()` passes when the event was dispatched
- `Event.assertDispatched()` throws when the event was not dispatched
- `Event.assertDispatched(callback)` passes when a dispatched event matches the callback
- `Event.assertDispatched(callback)` throws when no dispatched event matches the callback
- `Event.assertNotDispatched()` passes when the event was not dispatched
- `Event.assertNotDispatched()` throws when the event was dispatched
- Fakes are per-class: faking `OrderCreated` does not affect `OrderShipped`
- `assertDispatched` throws if `fake()` was not called first

**`packages/events/__tests__/dispatcher.test.ts`**

- `EventDispatcher.dispatch(event)` calls all registered listeners synchronously
- `EventDispatcher.dispatch(event)` calls listeners in registration order
- `EventDispatcher.dispatch(event)` awaits async listener `handle()` methods
- Multiple event types registered: dispatch of `OrderCreated` does not call `OrderShipped` listeners
- `ShouldQueue` listener triggers `Job.dispatch(event)` instead of `handle(event)`
- Errors thrown by a listener propagate out of `dispatch()`

**`packages/events/__tests__/subscriber.test.ts`**

- Subscriber methods are called when their mapped events are dispatched
- Multiple events in one subscriber each invoke their respective method
- Missing method name on subscriber throws during `EventServiceProvider.register()`

**`packages/events/__tests__/provider.test.ts`**

- `EventServiceProvider.register()` sets the global `EventDispatcher` instance
- Registered listeners are resolved and called when events are dispatched after boot
- `app.container.make('events.dispatcher')` returns the configured dispatcher

---

### `@roost/broadcast` tests

**`packages/broadcast/__tests__/channel-do.test.ts`** (workerd runner required)

- WebSocket upgrade with `type=public` succeeds without an Authorization header
- WebSocket upgrade with `type=private` without Authorization returns 403
- WebSocket upgrade with `type=private` with a valid bearer token returns 101
- `POST /broadcast` sends the message to all connected WebSocket clients
- `POST /broadcast` with zero connected clients returns 204 without error
- `webSocketMessage` with `event: 'whisper'` relays the message to all clients except the sender
- `webSocketClose` on a presence channel broadcasts `presence:leave` to remaining clients
- `GET /presence` returns the current member list for presence channels
- `GET /presence` excludes connections without a userId in their attachment
- Multiple clients can connect to the same DO and all receive broadcast messages
- Connection metadata survives a hibernation cycle (attachment round-trip)

**`packages/broadcast/__tests__/manager.test.ts`**

- `BroadcastManager.broadcast(event)` fetches `POST /broadcast` on the correct DO stub for each channel
- `BroadcastManager.broadcast(event)` calls `broadcastOn()` and sends to all returned channels
- `BroadcastManager.fake()` records broadcasts without calling DO stubs
- `BroadcastManager.assertBroadcast(OrderCreated)` passes when that event was broadcast
- `BroadcastManager.assertBroadcast(OrderCreated)` throws when that event was not broadcast
- `BroadcastManager.assertBroadcastOn('order.123')` passes when a broadcast targeted that channel
- `BroadcastManager.assertBroadcastOn('order.123')` throws when no broadcast targeted that channel
- `BroadcastManager.get()` throws before `BroadcastServiceProvider` has been registered

**`packages/broadcast/__tests__/fake.test.ts`**

- `BroadcastFake.recordBroadcast` stores event + channel
- `BroadcastManager.restore()` clears the fake and resets the singleton

**`packages/broadcast/__tests__/client.test.ts`**

- `createBroadcastClient` connects to the provided URL
- `subscribe(channel, handler)` returns an unsubscribe function
- Calling the unsubscribe function prevents further handler invocations
- `unsubscribe(channel)` removes all handlers for the channel
- `whisper(channel, event, data)` sends a JSON message with `event: 'whisper'`
- `close()` closes the WebSocket and prevents auto-reconnect
- Auto-reconnect: after the WebSocket closes unexpectedly, a new connection is attempted
- Reconnect delay doubles on each failure (exponential backoff)
- `urlOrFactory` as a function is called fresh on each reconnect attempt
- Handler is called with `(event, data)` when a message arrives with the matching shape

---

### CLI generator tests

**`packages/cli/__tests__/make.test.ts`**

- `roost make:event Foo` writes `src/events/foo.ts` with the correct template
- `roost make:event Foo --broadcast` writes a template implementing `BroadcastableEvent`
- `roost make:listener Bar` writes `src/listeners/bar.ts` with the listener template
- `roost make:listener Bar --event OrderCreated` includes the event type import
- `roost make:listener Bar --queued` writes a `Job`-extending `ShouldQueue` listener
- `roost make:channel OrderChannel` writes `src/channels/order-channel.ts`
- `roost make:channel OrderChannel --presence` includes `presenceData()` method
- File names are kebab-cased from the class name argument
- Existing file: command warns and skips without overwriting (no `--force` flag yet)

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `EventDispatcher.get()` called before any `EventServiceProvider` registered | Returns a bare dispatcher with no listeners registered (silent no-op). Events dispatch successfully; they just have no listeners. This is intentional — early boot dispatch should not throw. |
| `ShouldQueue` listener class does not extend `Job` | `(ListenerClass as typeof Job).dispatch(event)` will throw a TypeError at runtime. Document the contract clearly in the `ShouldQueue` JSDoc: classes implementing `ShouldQueue` must extend `Job<TEvent>`. |
| `@roost/broadcast` not installed but event implements `BroadcastableEvent` | The lazy `import('@roost/broadcast')` fails. The catch block swallows the error silently. Events still dispatch to sync listeners. Add a warning in the catch: `console.warn('[roost/events] @roost/broadcast is not installed or BroadcastManager is not initialized.')`. |
| `BroadcastManager.get()` called before `BroadcastServiceProvider` registered | Throw `Error('BroadcastManager not initialized. Register BroadcastServiceProvider.')` with a clear fix hint. |
| `ChannelDO.handleUpgrade()`: `env.BROADCAST_DO` binding absent | Not applicable — the DO itself is the binding target. If the Worker's binding is misconfigured, the `BroadcastManager` will throw when constructing the stub, not inside the DO. |
| WebSocket `send()` after client disconnects | Wrapped in `try/catch` in both `handleBroadcast` and `broadcastToAll`. The runtime throws on send to a closed socket; the catch prevents a single dead socket from aborting the broadcast to all other clients. |
| `webSocketClose` with malformed `serializeAttachment` data | `JSON.parse` inside a `try/catch`; corrupt attachment is silently ignored. The socket closes normally; no presence event is emitted for the disconnected client. |
| `ChannelDO.authorize()`: default implementation accepts any bearer token | This is intentionally permissive. Applications must override `authorize()` to implement real authorization (e.g., validate a signed JWT). Document the default clearly with a `@warning` JSDoc. |
| Client `subscribe()` called while WebSocket is still connecting | The handler is registered in `channelHandlers` before the connection opens. Messages that arrive after `open` will be dispatched correctly. Messages sent during the connecting phase are not buffered — this is the correct behavior for real-time channels. |

---

## Failure Modes

| Failure | Impact | Mitigation |
|---|---|---|
| Worker deployment closes all WebSocket connections | All connected clients are disconnected | `createBroadcastClient` auto-reconnects with exponential backoff. Clients recover transparently within seconds. |
| DO unavailable (rolling restarts, edge network partition) | WebSocket upgrades fail with 503; `BroadcastManager.broadcast()` returns a failed fetch | `BroadcastManager.broadcast()` does not retry — failed broadcasts are silently dropped at the framework level. Applications requiring guaranteed delivery should use a Queue-based fallback in the event listener in addition to broadcasting. |
| Presence `GET /presence` race: client disconnects mid-request | Member list may include a departing member's attachment | `getWebSockets()` returns live sockets only. If the socket is gone by the time `presence` is fetched, it will not appear. The brief window between disconnect and `webSocketClose` handler running is an inherent DO concurrency property — document as an eventually-consistent read. |
| `serializeAttachment` data exceeds 2 KB | Runtime throws | `ConnectionMeta` is small (userId string + two numbers + one short string). Document the 2 KB limit and advise against adding large metadata to the attachment. |
| Max 32,768 concurrent WebSocket connections per DO | New connections are rejected by the runtime | One DO per channel. For channels expected to have massive audiences (public broadcast), document that DO sharding (multiple DOs per channel with fan-out) is the scaling pattern and is out of scope for this phase. |
| Two Workers in the same account attempt to use different `ChannelDO` classes with the same binding name | DO migration tag conflict | Standard CF DO migration discipline. Document that `ChannelDO` must be exported from the Worker entry point and that the migration tag must be unique. |
| `EventDispatcher` singleton reset between tests | Test isolation broken if `Event.dispatch` is called after `restore()` in a previous test | Tests using `EventServiceProvider` should call `EventDispatcher.set(new EventDispatcher())` in `afterEach` to reset the singleton. Document this in the testing guide for `@roost/events`. |

---

## Validation Commands

```bash
# Per-package inner loop
bun test --filter events
bun test --filter broadcast
bun test --filter cli

# Full gate before any commit
bun run typecheck
bun test --filter events
bun test --filter broadcast
bun test --filter cli
```
