# PRD: Roost Framework - Phase 7

**Contract**: ./contract.md
**Phase**: 7 of 11
**Focus**: Abstract billing interface with Stripe adapter

## Phase Overview

Phase 7 gives Roost apps billing. Like Laravel Cashier, it wraps subscription management, metering, and customer portal access behind a clean interface — but with an abstract contract so providers beyond Stripe can be added later. The Stripe adapter ships as the first implementation.

This phase depends on Phase 4 (ORM) for Customer/Subscription model persistence and Phase 1 (core) for the service container and middleware. It can run in parallel with Phases 5 and 6 once Phase 4 is complete.

After this phase, a developer can add billing to any Roost app: create customers, manage subscriptions, handle plan changes, process webhooks, and gate features behind subscription status — all with a few lines of code.

## User Stories

1. As a Roost app developer, I want to create billable customers linked to my User model so that I can charge them.
2. As a Roost app developer, I want to manage subscriptions (create, swap, cancel, resume) with a fluent API.
3. As a Roost app developer, I want webhook handling built in so that subscription state stays in sync.
4. As a Roost app developer, I want middleware to gate routes by subscription status so that premium features are protected.
5. As a Roost app developer, I want a customer portal redirect so that users can manage their own billing.
6. As a Roost app developer, I want usage-based metering so that I can bill based on consumption.

## Functional Requirements

### Abstract Billing Contract (@roostjs/billing)

- **FR-7.1**: `BillingProvider` interface with methods: `createCustomer`, `subscribe`, `cancelSubscription`, `swapSubscription`, `resumeSubscription`, `createPortalSession`, `processWebhook`
- **FR-7.2**: `Billable` mixin for model classes — adds `.subscription()`, `.subscribed()`, `.onTrial()`, `.subscribedToPrice()`
- **FR-7.3**: `Subscription` model with status, plan, price, trial/cancel dates
- **FR-7.4**: Provider-agnostic subscription statuses: `active`, `trialing`, `past_due`, `canceled`, `incomplete`

### Stripe Adapter

- **FR-7.5**: Stripe SDK integration configured from `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` env vars
- **FR-7.6**: Customer creation synced to Stripe on first subscription
- **FR-7.7**: Subscription CRUD mapped to Stripe Subscriptions API
- **FR-7.8**: Checkout session creation for initial subscription flow
- **FR-7.9**: Customer portal session for self-service billing management
- **FR-7.10**: Price/product resolution from Stripe product catalog

### Webhooks

- **FR-7.11**: Webhook endpoint auto-registered at `/billing/webhook`
- **FR-7.12**: Webhook signature verification (Stripe-specific in adapter)
- **FR-7.13**: Event handlers for: `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`, `checkout.session.completed`
- **FR-7.14**: Webhook events update local Subscription model state
- **FR-7.15**: Extensible webhook handler — developers can add custom event handlers

### Metering

- **FR-7.16**: `meter(feature, quantity)` method on billable model for usage reporting
- **FR-7.17**: Usage records synced to Stripe usage-based billing
- **FR-7.18**: `hasFeature(feature)` and `canUseFeature(feature)` entitlement checks

### Middleware

- **FR-7.19**: `subscribed` middleware — requires active subscription
- **FR-7.20**: `subscribed:premium` middleware — requires specific plan
- **FR-7.21**: `onTrial` middleware — allows trial users
- **FR-7.22**: Customizable redirect for non-subscribed users (pricing page, upgrade prompt)

### Testing

- **FR-7.23**: `Billing.fake()` prevents real Stripe API calls
- **FR-7.24**: `Billing.assertCustomerCreated()`, `Billing.assertSubscribed()` assertions
- **FR-7.25**: Fake supports webhook simulation: `Billing.simulateWebhook('invoice.paid', data)`

## Non-Functional Requirements

- **NFR-7.1**: Webhook processing < 50ms (local state update, not including Stripe round-trip)
- **NFR-7.2**: No Stripe secrets exposed to client — all billing operations server-side only
- **NFR-7.3**: Webhook endpoint validates signatures and rejects tampered payloads
- **NFR-7.4**: Abstract interface allows adding a new provider without changing consumer code

## Dependencies

### Prerequisites

- Phase 1 complete (service container, environment/secrets)
- Phase 4 complete (ORM for Customer/Subscription models)

### Outputs for Next Phase

- Billing fakes/assertions pattern for Phase 9 testing utilities
- Subscription model for Phase 10 SaaS starter example
- Webhook infrastructure pattern reusable by other packages

## Acceptance Criteria

- [ ] `user.subscribe('price_xxx')` creates a Stripe subscription and local Subscription record
- [ ] `user.subscription().cancel()` cancels and updates local state
- [ ] `user.subscribed()` returns correct boolean based on subscription status
- [ ] Webhook endpoint receives Stripe events and updates subscription state
- [ ] `subscribed` middleware blocks unsubscribed users with redirect
- [ ] `user.meter('api_calls', 1)` reports usage to Stripe
- [ ] Customer portal redirect generates valid Stripe portal session URL
- [ ] `Billing.fake()` prevents real API calls in tests
- [ ] A new provider can be swapped in by implementing `BillingProvider` interface
- [ ] All billing operations work on Cloudflare Workers (no Node.js-specific Stripe SDK dependencies)
