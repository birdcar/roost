# Laravel Primitive Mapping for Roost CF Platform Completeness

This document maps each CF platform feature to its Laravel equivalent, ensuring Roost wrappers follow Laravel's API style and naming conventions.

## Direct Laravel Equivalents

| CF Feature | Laravel Primitive | Roost Should Follow |
|---|---|---|
| `waitUntil()` | `dispatch()->afterResponse()` | `app.defer(promise)` — mirrors Laravel's "after response" pattern |
| Structured Logger | `Log` facade / Monolog | `Log.info()`, `Log.error()` — facade-style, channels concept |
| Feature Flags | `Feature` (Pennant) | `Feature.active('flag')`, `Feature.value('flag')` — exact Pennant API |
| Rate Limiting | `RateLimiter` facade | `RateLimiter.for('api', ...)` — named limiters, `throttle` middleware |
| Workflows | `Pipeline` + `Bus` chains | `Workflow` base class, but CF Workflows are closer to Laravel's job chains/batches |
| Queued Jobs | `Job` + `dispatch()` | Already done — `Job.dispatch()` |
| Webhooks | `WebhookClient` (Spatie) | `Webhook.verify(request, config)` |
| Multi-tenant scoping | `Global Scopes` | `Model.addGlobalScope('tenant', ...)` — auto-filtering via global scopes |
| Broadcasting/Events | `Event` + `Broadcast` | **New insight** — see below |
| Service bindings | `Http` facade for internal services | `Service.call('auth', '/verify')` — HTTP client facade style |

## Laravel Broadcasting -> CF Durable Objects + WebSockets

Laravel's broadcasting system (`Event` + `Broadcast` + channels) maps very well to Durable Objects with WebSocket hibernation:

| Laravel Concept | CF/Roost Equivalent |
|---|---|
| `ShouldBroadcast` interface | Event class that triggers DO WebSocket push |
| `broadcastOn()` / Channels | DO routing — one DO per channel/entity |
| `PrivateChannel('user.{id}')` | `env.CHANNELS.idFromName('user.' + id)` |
| `PresenceChannel` | DO + WebSocket hibernation with connection tracking |
| `Echo` (client) | Client-side WebSocket reconnection with `serializeAttachment()` metadata |
| `Broadcast::channel('user.{id}', ...)` | Authorization middleware on WebSocket upgrade request |
| `whisper` (client-to-client) | DO relays message to other WebSocket connections |

**Recommendation**: Add a `@roost/broadcast` package or extend the DO wrapper to support Laravel-style broadcasting. This is a natural fit because:
1. DOs provide the single-threaded coordination that broadcasting needs
2. WebSocket hibernation handles idle connections at near-zero cost
3. The channel metaphor maps 1:1 to DO-per-entity routing
4. Output gating guarantees messages aren't sent until state is durable

### API sketch:
```typescript
// Defining a broadcastable event
class OrderShipped extends Event implements ShouldBroadcast {
  broadcastOn() {
    return new PrivateChannel(`order.${this.orderId}`);
  }
  broadcastWith() {
    return { orderId: this.orderId, status: 'shipped' };
  }
}

// Triggering broadcast
Event.dispatch(new OrderShipped(order));

// Channel authorization
Channel.authorize('order.{id}', async (user, id) => {
  return user.canViewOrder(id);
});
```

## Laravel Events -> Roost Events

Laravel's event system (`Event::dispatch`, listeners, subscribers) should be added:

| Laravel Concept | Roost Implementation |
|---|---|
| `Event::dispatch(new OrderCreated($order))` | `Event.dispatch(new OrderCreated(order))` |
| Event Listeners | Registered in `EventServiceProvider` |
| `ShouldQueue` on listeners | Listener dispatches a Job to Cloudflare Queue |
| Event Subscribers | Class that subscribes to multiple events |

This maps cleanly to CF because:
- Sync listeners run in the same Worker request
- Queued listeners dispatch to CF Queues (already have `@roost/queue`)
- Broadcast listeners push to DO WebSockets

## Laravel Pennant -> Roost Feature Flags

Laravel Pennant's API is the gold standard for feature flags:

```typescript
// Laravel Pennant API (adapt for Roost)
Feature.active('new-onboarding')           // boolean check
Feature.value('purchase-button', 'blue')   // A/B testing
Feature.for(user).active('beta-feature')   // scoped to entity
Feature.define('new-onboarding', () => {   // resolver
  return user.isInternal;
})
```

Backed by KV in Roost (vs database in Laravel), with 60s eventual consistency acceptable for feature flags.

## Laravel Global Scopes -> Tenant Auto-Filtering

Laravel's Global Scopes pattern is the exact right abstraction for tenant isolation:

```typescript
// Laravel-style
class TenantScope implements Scope {
  apply(builder: QueryBuilder, model: Model) {
    builder.where('org_id', currentTenant().id);
  }
}

// Applied to model
class Post extends Model {
  static booted() {
    this.addGlobalScope(new TenantScope());
  }
}

// Escape hatch
Post.withoutGlobalScope(TenantScope).all()  // admin query
```

## New Gap Identified: Events + Broadcasting

The audit missed this — Laravel's Event system and Broadcasting are core primitives that have excellent CF mappings:

- **Events**: sync dispatch + queued listeners = Workers + Queues (already possible, needs formalization)
- **Broadcasting**: private/presence channels over WebSockets = Durable Objects with hibernation

Consider adding a Phase 9 or expanding Phase 7 to include Broadcasting via DOs.
