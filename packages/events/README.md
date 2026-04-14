# @roostjs/events

Laravel-style event system for Cloudflare Workers.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/events
```

## Quick Start

```typescript
import { Event, EventServiceProvider } from '@roostjs/events';

// Define an event
class UserRegistered extends Event {
  constructor(public userId: string) { super(); }
}

// Define a listener
class SendWelcomeEmail {
  async handle(event: UserRegistered) {
    await mailer.send(event.userId, 'Welcome!');
  }
}

// Register via provider
class AppEventServiceProvider extends EventServiceProvider {
  protected listen() {
    return new Map([[UserRegistered, [SendWelcomeEmail]]]);
  }
}

// Dispatch
await UserRegistered.dispatch(new UserRegistered('user_123'));
```

## Features

- `Event` base class with static `dispatch()` — no manual DI wiring
- Synchronous listeners via `Listener` interface
- Queued listeners via `ShouldQueue` marker (requires `@roostjs/queue`)
- Event subscribers for grouping related listeners
- Automatic broadcast integration when `@roostjs/broadcast` is installed
- `Event.fake()` / `assertDispatched()` / `assertNotDispatched()` for testing

## API

```typescript
// Event
abstract class Event {
  static dispatch<T>(event: T): Promise<void>
  static fake(): void
  static restore(): void
  static assertDispatched(callback?: (event: T) => boolean): void
  static assertNotDispatched(): void
}

// Listener
interface Listener<T> {
  handle(event: T): void | Promise<void>
}

// Queued listener — also extend Job<T> from @roostjs/queue
interface ShouldQueue {
  readonly shouldQueue: true
}

// Subscriber
abstract class Subscriber {
  abstract subscribe(): Map<EventClass<Event>, string>
}

// Provider
abstract class EventServiceProvider extends ServiceProvider {
  protected listen(): Map<EventClass<Event>, ListenerClass[]>
  protected subscribers(): SubscriberClass[]
}
```

Subscribers let you co-locate related event handlers on a single class by mapping event classes to method names.

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/events](https://roost.birdcar.dev/docs/reference/events)

## License

MIT
