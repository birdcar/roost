# @roostjs/broadcast

Real-time broadcasting via Durable Objects and WebSocket hibernation.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/broadcast
```

## Quick Start

```typescript
// Server: define a broadcastable event
import { Event } from '@roostjs/events';
import { Channel, PrivateChannel } from '@roostjs/broadcast';
import type { BroadcastableEvent } from '@roostjs/broadcast';

class OrderShipped extends Event implements BroadcastableEvent {
  constructor(public orderId: string, public userId: string) { super(); }

  broadcastOn() {
    return [new PrivateChannel(`orders.${this.userId}`)];
  }

  broadcastWith() {
    return { orderId: this.orderId };
  }
}

// Dispatching the event auto-broadcasts when @roostjs/broadcast is registered
await OrderShipped.dispatch(new OrderShipped('ord_1', 'usr_42'));

// Client (browser/edge)
import { createBroadcastClient } from '@roostjs/broadcast/client';

const client = createBroadcastClient('/ws/channel');
const unsub = client.subscribe('orders.usr_42', (event, data) => {
  console.log(event, data);
});
```

## Features

- `Channel`, `PrivateChannel`, `PresenceChannel` — same API as Laravel Broadcasting
- `ChannelDO` Durable Object with WebSocket hibernation — zero cost at idle
- Private and presence channel authorization hooks built in
- Presence member tracking: `presence:join` / `presence:leave` events
- Whisper support for client-to-client ephemeral messages
- `createBroadcastClient` with exponential backoff auto-reconnect
- `BroadcastManager.fake()` / `assertBroadcast()` / `assertBroadcastOn()` for testing

## Setup

Add the Durable Object binding to `wrangler.jsonc` and export `ChannelDO`:

```typescript
// worker.ts
export { ChannelDO } from '@roostjs/broadcast';
```

Register the provider in your app bootstrap:

```typescript
import { BroadcastServiceProvider } from '@roostjs/broadcast';
app.register(BroadcastServiceProvider);
```

The provider expects a Durable Object binding named `BROADCAST_DO` by default.

## API

```typescript
// Channels
class Channel { constructor(name: string) }
class PrivateChannel extends Channel {}
class PresenceChannel extends Channel {}

// Event contract
interface BroadcastableEvent {
  broadcastOn(): Channel[]
  broadcastWith(): Record<string, unknown>
  broadcastAs?(): string
}

// Manager
class BroadcastManager {
  static get(): BroadcastManager
  static fake(): void
  static restore(): void
  static assertBroadcast(eventClass: new (...args) => BroadcastableEvent): void
  static assertBroadcastOn(channel: string): void
  broadcast(event: BroadcastableEvent): Promise<void>
}

// Client (import from @roostjs/broadcast/client)
function createBroadcastClient(
  url: string | (() => string),
  options?: BroadcastClientOptions
): BroadcastClient

interface BroadcastClient {
  subscribe(channel: string, handler: (event: string, data: unknown) => void): () => void
  unsubscribe(channel: string): void
  whisper(channel: string, event: string, data?: unknown): void
  close(): void
}
```

Override `authorize()` on `ChannelDO` to validate private/presence channel access with real JWT or session checks — the default accepts any bearer token.

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/broadcast](https://roost.birdcar.dev/docs/reference/broadcast)

## License

MIT
