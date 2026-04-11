# Implementation Spec: Roost Framework - Phase 7

**Contract**: ./contract.md
**PRD**: ./prd-phase-7.md
**Estimated Effort**: XL

## Technical Approach

Phase 7 builds `@roost/billing` — a Laravel Cashier-inspired billing abstraction over Stripe, designed for Cloudflare Workers. The core constraint driving every architectural decision: **no Node.js Stripe SDK**. The official `stripe` npm package depends on Node.js APIs unavailable in Workers (`http`, `net`, `tls`). All Stripe communication must use the native `fetch` API against Stripe's REST endpoints.

The architecture has four layers:

1. **Abstract contract** (`BillingProvider` interface): All billing operations are defined here. Consumer code (models, controllers, middleware) depends only on this interface. A Stripe provider implements it; future providers (Paddle, LemonSqueezy) can be swapped without touching consumer code.

2. **Billable mixin**: A TypeScript mixin function that adds subscription-aware methods to any ORM model class (`User`, `Organization`, etc.). The mixin uses the `BillingProvider` from the container and loads/saves `Subscription` records via `@roost/orm`.

3. **Stripe adapter** (`StripeProvider`): Implements `BillingProvider` by calling Stripe's REST API directly via `fetch`. All requests are signed with the secret key using HTTP Basic auth (`Authorization: Bearer sk_...`). Webhook signature verification uses the `crypto.subtle` Web Crypto API.

4. **Webhook router**: A small request handler registered at `/billing/webhook` that verifies the Stripe signature, parses the event, and dispatches to registered event handlers. This integrates with Phase 2's routing (or stands alone as a `Request => Response` function).

The `Subscription` model persists to D1 via `@roost/orm` (Phase 4 dependency). The `Customer` record is stored alongside the user's model using a `stripe_customer_id` column. This is the same pattern as Laravel Cashier: local DB mirrors Stripe state, webhooks keep them in sync.

## Feedback Strategy

**Inner-loop command**: `bun test --filter packages/billing`

**Playground**: `bun:test` suite with `Billing.fake()` preventing real Stripe API calls. Webhook handling is tested by calling the webhook handler with fabricated Stripe event payloads and a valid HMAC signature (generated with a test secret).

**Why this approach**: The Stripe adapter can be fully mocked via `Billing.fake()`. Webhook signature verification uses real Web Crypto so it exercises the actual code path without needing Stripe's servers. The fake captures all calls, making billing-related behavior testable without any external dependencies.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/billing/package.json` | @roost/billing package manifest |
| `packages/billing/tsconfig.json` | Extends base TS config |
| `packages/billing/src/index.ts` | Public API barrel export |
| `packages/billing/src/types.ts` | Shared type definitions and interfaces |
| `packages/billing/src/provider.ts` | BillingProvider abstract interface |
| `packages/billing/src/billable.ts` | Billable mixin for ORM models |
| `packages/billing/src/subscription.ts` | Subscription model (extends @roost/orm Model) |
| `packages/billing/src/customer.ts` | Customer record helpers |
| `packages/billing/src/stripe/client.ts` | Stripe REST API fetch client |
| `packages/billing/src/stripe/provider.ts` | StripeProvider implements BillingProvider |
| `packages/billing/src/stripe/webhook.ts` | Stripe webhook signature verification |
| `packages/billing/src/stripe/types.ts` | Stripe API response type definitions |
| `packages/billing/src/webhook-handler.ts` | Framework webhook route handler |
| `packages/billing/src/middleware.ts` | subscribed, onTrial middleware classes |
| `packages/billing/src/fake.ts` | Billing.fake() and assertion helpers |
| `packages/billing/src/service-provider.ts` | BillingServiceProvider |
| `packages/billing/__tests__/billable.test.ts` | Billable mixin method tests |
| `packages/billing/__tests__/stripe-client.test.ts` | Stripe fetch client tests |
| `packages/billing/__tests__/webhook.test.ts` | Webhook signature verification and event handling |
| `packages/billing/__tests__/middleware.test.ts` | subscribed/onTrial middleware tests |
| `packages/billing/__tests__/fake.test.ts` | Billing.fake() and assertion tests |

### Modified Files

| File Path | Change |
|---|---|
| `packages/orm/src/model.ts` | No change to Model class itself; Billable is a mixin applied on top |

## Implementation Details

### 1. Type Definitions and Abstract Contract

**Overview**: The abstract layer defines what billing means without any provider specifics. `BillingProvider` is the interface every adapter implements. `SubscriptionStatus` is the canonical status enum shared across adapters.

```typescript
// packages/billing/src/types.ts

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export interface CreateCustomerParams {
  name: string;
  email: string;
  metadata?: Record<string, string>;
}

export interface CreateCustomerResult {
  providerId: string;    // e.g. Stripe customer ID: "cus_xxx"
}

export interface SubscribeParams {
  customerId: string;    // provider customer ID
  priceId: string;       // provider price/plan ID
  trialDays?: number;
  metadata?: Record<string, string>;
}

export interface SubscribeResult {
  subscriptionId: string;    // provider subscription ID
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAt: Date | null;
}

export interface SwapSubscriptionParams {
  subscriptionId: string;    // provider subscription ID
  newPriceId: string;
  prorationBehavior?: 'always_invoice' | 'create_prorations' | 'none';
}

export interface CreateCheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface CreatePortalSessionParams {
  customerId: string;
  returnUrl: string;
}

export interface CreatePortalSessionResult {
  url: string;
}

export interface MeterUsageParams {
  customerId: string;
  meterId: string;        // Stripe meter event name / usage record subscription item ID
  quantity: number;
  timestamp?: Date;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: unknown;
  raw: string;            // original request body for signature verification
}

export interface LocalSubscription {
  id: string;
  billableId: string;
  billableType: string;
  providerId: string;         // Stripe subscription ID
  providerCustomerId: string; // Stripe customer ID
  priceId: string;
  status: SubscriptionStatus;
  quantity: number;
  trialEndsAt: Date | null;
  endsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

```typescript
// packages/billing/src/provider.ts

import type {
  CreateCustomerParams,
  CreateCustomerResult,
  SubscribeParams,
  SubscribeResult,
  SwapSubscriptionParams,
  CreateCheckoutSessionParams,
  CreateCheckoutSessionResult,
  CreatePortalSessionParams,
  CreatePortalSessionResult,
  MeterUsageParams,
  WebhookEvent,
  LocalSubscription,
} from './types.ts';

/**
 * The abstract billing contract. Every billing adapter (Stripe, Paddle, etc.)
 * must implement this interface. Consumer code depends only on this interface,
 * not on any specific adapter.
 *
 * Injected via the service container as the BillingProvider token.
 */
export interface BillingProvider {
  createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult>;
  deleteCustomer(providerId: string): Promise<void>;

  subscribe(params: SubscribeParams): Promise<SubscribeResult>;
  cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<SubscribeResult>;
  swapSubscription(params: SwapSubscriptionParams): Promise<SubscribeResult>;

  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CreateCheckoutSessionResult>;
  createPortalSession(params: CreatePortalSessionParams): Promise<CreatePortalSessionResult>;

  meterUsage(params: MeterUsageParams): Promise<void>;

  parseWebhookEvent(payload: string, signature: string): Promise<WebhookEvent>;
}

// Token for container registration
export const BILLING_PROVIDER = Symbol('roost.billing.provider');
```

**Key decisions**:
- `parseWebhookEvent` is on the provider interface because signature verification is provider-specific (Stripe uses HMAC-SHA256; Paddle uses a different scheme). The framework's webhook handler calls this and then dispatches based on `event.type`.
- `LocalSubscription` is the framework's canonical representation — adapters map their native objects to this shape. This lets the Billable mixin work without knowing which adapter is active.

---

### 2. Subscription Model

**Overview**: The `Subscription` model extends `@roost/orm`'s `Model` base class. It represents the local state mirror of a provider subscription. All billing state changes go through webhooks that update this record.

```typescript
// packages/billing/src/subscription.ts
// This is the Drizzle schema + ORM model for subscriptions.
// It depends on @roost/orm being configured with a D1 binding.

import { Model } from '@roost/orm';
import type { SubscriptionStatus } from './types.ts';

// Drizzle table definition — generated migration adds this table.
// import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
//
// export const subscriptions = sqliteTable('subscriptions', {
//   id:                    text('id').primaryKey(),
//   billable_id:           text('billable_id').notNull(),
//   billable_type:         text('billable_type').notNull(),
//   provider_id:           text('provider_id').notNull().unique(),
//   provider_customer_id:  text('provider_customer_id').notNull(),
//   price_id:              text('price_id').notNull(),
//   status:                text('status').notNull(),
//   quantity:              integer('quantity').notNull().default(1),
//   trial_ends_at:         integer('trial_ends_at', { mode: 'timestamp' }),
//   ends_at:               integer('ends_at', { mode: 'timestamp' }),
//   current_period_start:  integer('current_period_start', { mode: 'timestamp' }).notNull(),
//   current_period_end:    integer('current_period_end', { mode: 'timestamp' }).notNull(),
//   created_at:            integer('created_at', { mode: 'timestamp' }).notNull(),
//   updated_at:            integer('updated_at', { mode: 'timestamp' }).notNull(),
// });

export class Subscription extends Model {
  static tableName = 'subscriptions';

  id!: string;
  billableId!: string;
  billableType!: string;
  providerId!: string;
  providerCustomerId!: string;
  priceId!: string;
  status!: SubscriptionStatus;
  quantity!: number;
  trialEndsAt!: Date | null;
  endsAt!: Date | null;
  currentPeriodStart!: Date;
  currentPeriodEnd!: Date;
  createdAt!: Date;
  updatedAt!: Date;

  get active(): boolean {
    return this.status === 'active' || this.status === 'trialing';
  }

  get onTrial(): boolean {
    return this.status === 'trialing' && this.trialEndsAt !== null && this.trialEndsAt > new Date();
  }

  get canceled(): boolean {
    return this.status === 'canceled';
  }

  get pastDue(): boolean {
    return this.status === 'past_due';
  }

  // Returns true if the subscription is active (including trial) and not
  // scheduled for cancellation at the end of the period.
  get valid(): boolean {
    if (!this.active) return false;
    if (this.endsAt !== null && this.endsAt < new Date()) return false;
    return true;
  }

  async cancel(provider: BillingProvider, immediately = false): Promise<void> {
    await provider.cancelSubscription(this.providerId, immediately);
    this.status = 'canceled';
    this.endsAt = immediately ? new Date() : this.currentPeriodEnd;
    await this.save();
  }

  async resume(provider: BillingProvider): Promise<void> {
    const result = await provider.resumeSubscription(this.providerId);
    this.status = result.status;
    this.endsAt = null;
    await this.save();
  }

  async swap(provider: BillingProvider, newPriceId: string): Promise<void> {
    const result = await provider.swapSubscription({
      subscriptionId: this.providerId,
      newPriceId,
    });
    this.priceId = newPriceId;
    this.status = result.status;
    await this.save();
  }
}

import type { BillingProvider } from './provider.ts';
```

**Key decisions**:
- The `Subscription` model mirrors Stripe's state locally. Webhooks are the source of truth for status changes — the model update on cancel/resume is optimistic and will be confirmed by the next webhook.
- `valid` is a computed property that considers both `status` and `endsAt`. A subscription can be `active` but scheduled to cancel at period end (`endsAt` is set). `valid` returns false once `endsAt` has passed.

---

### 3. Billable Mixin

**Overview**: A TypeScript mixin that adds billing methods to a model class. The mixin pattern avoids multiple inheritance issues — it's a function that takes a base class and returns an extended class.

```typescript
// packages/billing/src/billable.ts

import type { BillingProvider } from './provider.ts';
import type { Container } from '@roost/core';
import { Subscription } from './subscription.ts';
import type {
  CreateCheckoutSessionResult,
  CreatePortalSessionResult,
  SubscribeResult,
} from './types.ts';

// The contract for the base class that Billable extends.
// The model must have an `id` and `email` at minimum.
interface BillableBase {
  id: string;
  email: string;
  stripeCustomerId: string | null;
  save(): Promise<void>;
}

// Constructor type for the mixin pattern.
type Constructor<T = object> = new (...args: unknown[]) => T;

/**
 * Mixin that adds billing capabilities to a model class.
 *
 * Usage:
 *   class User extends Billable(Model) {
 *     // User now has subscribe(), subscribed(), onTrial(), etc.
 *   }
 */
export function Billable<TBase extends Constructor<BillableBase>>(Base: TBase) {
  return class BillableModel extends Base {
    // Container is set by the service provider after the model is instantiated.
    // Tests can set this directly.
    protected _billingContainer?: Container;

    private get billingProvider(): BillingProvider {
      if (!this._billingContainer) {
        throw new Error(
          'BillingProvider not available. Ensure BillingServiceProvider is booted.',
        );
      }
      return this._billingContainer.resolve(BILLING_PROVIDER) as BillingProvider;
    }

    // Loads all subscriptions for this billable instance.
    async subscriptions(): Promise<Subscription[]> {
      return Subscription.where('billable_id', this.id)
        .where('billable_type', this.constructor.name)
        .get();
    }

    // Returns the default (most recent active) subscription, or null.
    async subscription(name = 'default'): Promise<Subscription | null> {
      const results = await Subscription.where('billable_id', this.id)
        .where('billable_type', this.constructor.name)
        .orderBy('created_at', 'desc')
        .first();
      return results ?? null;
    }

    // Returns true if the billable has an active or trialing subscription.
    async subscribed(priceId?: string): Promise<boolean> {
      const sub = await this.subscription();
      if (!sub?.valid) return false;
      if (priceId) return sub.priceId === priceId;
      return true;
    }

    // Returns true if the billable is currently in a trial period.
    async onTrial(): Promise<boolean> {
      const sub = await this.subscription();
      return sub?.onTrial ?? false;
    }

    // Creates a checkout session for initial subscription.
    async newSubscription(
      priceId: string,
      successUrl: string,
      cancelUrl: string,
      trialDays?: number,
    ): Promise<CreateCheckoutSessionResult> {
      const customerId = await this.getOrCreateStripeCustomer();
      return this.billingProvider.createCheckoutSession({
        customerId,
        priceId,
        successUrl,
        cancelUrl,
        trialDays,
      });
    }

    // Creates a customer portal session for self-service billing.
    async billingPortal(returnUrl: string): Promise<CreatePortalSessionResult> {
      const customerId = await this.getOrCreateStripeCustomer();
      return this.billingProvider.createPortalSession({ customerId, returnUrl });
    }

    // Records usage for a metered billing feature.
    async meter(meterId: string, quantity: number): Promise<void> {
      const customerId = await this.getOrCreateStripeCustomer();
      await this.billingProvider.meterUsage({ customerId, meterId, quantity });
    }

    // Ensures a Stripe customer exists for this billable instance.
    // Creates one if not present and persists the ID.
    private async getOrCreateStripeCustomer(): Promise<string> {
      if (this.stripeCustomerId) {
        return this.stripeCustomerId;
      }
      const result = await this.billingProvider.createCustomer({
        name: 'name' in this ? String((this as { name: string }).name) : this.email,
        email: this.email,
        metadata: {
          billableId: this.id,
          billableType: this.constructor.name,
        },
      });
      this.stripeCustomerId = result.providerId;
      await this.save();
      return result.providerId;
    }
  };
}

import { BILLING_PROVIDER } from './provider.ts';
```

**Key decisions**:
- The mixin pattern (`Billable(Model)`) is idiomatic TypeScript and avoids the "mixin via interface + abstract class" confusion. It also works with any base class, not just `@roost/orm`'s `Model`.
- `getOrCreateStripeCustomer()` is lazy — a Stripe customer is only created on the first billing action. This prevents orphaned customer records for users who never subscribe.
- `subscribed()` accepts an optional `priceId` for plan-specific checks: `user.subscribed('price_premium')`.

**Implementation steps**:
1. Define `BillableBase` interface to constrain what the mixin requires
2. Implement `Billable` mixin function with all methods
3. Add `stripeCustomerId` column to user model migration (documented in provider setup guide, not auto-added)
4. Test: mixin applied to mock model class, `subscribed()` returns false with no subscription, returns true with active subscription, `onTrial()` correctly reads trial status

---

### 4. Stripe REST Client

**Overview**: A minimal fetch-based client for Stripe's API. This is the core infrastructure that makes Workers compatibility possible. It handles authentication, URL encoding, and error normalization. It is not a full Stripe SDK — it only implements the endpoints `@roost/billing` needs.

```typescript
// packages/billing/src/stripe/client.ts

export interface StripeClientOptions {
  secretKey: string;
  apiVersion?: string;  // default: '2024-06-20'
  baseUrl?: string;     // default: 'https://api.stripe.com/v1'
}

export class StripeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly stripeCode: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'StripeRequestError';
  }
}

/**
 * Minimal Stripe REST client built on the Fetch API.
 *
 * Uses HTTP Basic authentication: the secret key is the username,
 * password is empty. This is equivalent to `Authorization: Bearer sk_...`.
 *
 * All request bodies are application/x-www-form-urlencoded (Stripe's
 * preferred format for non-file endpoints).
 */
export class StripeClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly apiVersion: string;

  constructor(private readonly options: StripeClientOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.stripe.com/v1';
    this.apiVersion = options.apiVersion ?? '2024-06-20';
    // Stripe uses HTTP Basic auth: key as username, empty password
    this.authHeader = `Basic ${btoa(`${options.secretKey}:`)}`;
  }

  async post<TResponse>(
    path: string,
    body: Record<string, string | number | boolean | undefined>,
  ): Promise<TResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': this.apiVersion,
      },
      body: encodeFormBody(body),
    });
    return this.parseResponse<TResponse>(response);
  }

  async get<TResponse>(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<TResponse> {
    const url = params
      ? `${this.baseUrl}${path}?${encodeFormBody(params)}`
      : `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
        'Stripe-Version': this.apiVersion,
      },
    });
    return this.parseResponse<TResponse>(response);
  }

  async delete<TResponse>(path: string): Promise<TResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: this.authHeader,
        'Stripe-Version': this.apiVersion,
      },
    });
    return this.parseResponse<TResponse>(response);
  }

  private async parseResponse<TResponse>(response: Response): Promise<TResponse> {
    const json = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const error = json.error as Record<string, unknown> | undefined;
      throw new StripeRequestError(
        response.status,
        error?.code as string | undefined,
        (error?.message as string) ?? `Stripe API error: ${response.status}`,
      );
    }
    return json as TResponse;
  }
}

/**
 * Encodes a flat record to application/x-www-form-urlencoded format.
 * Stripe does not accept JSON bodies for most endpoints.
 * Undefined values are omitted.
 */
function encodeFormBody(
  data: Record<string, string | number | boolean | undefined>,
): string {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}
```

**Key decisions**:
- `application/x-www-form-urlencoded` is Stripe's standard request format. JSON is only supported on a few newer Stripe endpoints. Using form encoding is the safe, universal choice.
- The auth header is computed once in the constructor. Stripe supports both `Authorization: Bearer sk_...` and HTTP Basic auth; Basic auth is slightly simpler to implement correctly with `btoa`.
- `encodeFormBody` is a flat encoder. Stripe supports nested parameters via bracket notation (e.g., `metadata[key]=value`), but this spec deliberately keeps the client simple. Nested params are handled by the StripeProvider by flattening before passing to `post()`.
- The client does not implement rate limiting, automatic retries, or idempotency keys — those are left for a future `@roost/billing` v2. The current scope is correctness on the happy path.

**Implementation steps**:
1. Implement `StripeClient` with `post`, `get`, `delete`
2. Implement `encodeFormBody`
3. Implement `parseResponse` with `StripeRequestError`
4. Test: mock `fetch`, verify correct auth header, correct content-type, error throws `StripeRequestError` with status and code, undefined values omitted from body

---

### 5. Stripe Provider

**Overview**: `StripeProvider` implements `BillingProvider` by calling `StripeClient` and mapping Stripe's API responses to the framework's `LocalSubscription` and other canonical types.

```typescript
// packages/billing/src/stripe/provider.ts

import type { BillingProvider } from '../provider.ts';
import type {
  CreateCustomerParams,
  CreateCustomerResult,
  SubscribeParams,
  SubscribeResult,
  SwapSubscriptionParams,
  CreateCheckoutSessionParams,
  CreateCheckoutSessionResult,
  CreatePortalSessionParams,
  CreatePortalSessionResult,
  MeterUsageParams,
  SubscriptionStatus,
  WebhookEvent,
} from '../types.ts';
import { StripeClient } from './client.ts';
import { verifyStripeWebhook } from './webhook.ts';
import type { StripeSubscription, StripeCustomer, StripeCheckoutSession } from './types.ts';

export interface StripeProviderOptions {
  secretKey: string;
  webhookSecret: string;
  apiVersion?: string;
}

export class StripeProvider implements BillingProvider {
  private readonly client: StripeClient;

  constructor(private readonly options: StripeProviderOptions) {
    this.client = new StripeClient({
      secretKey: options.secretKey,
      apiVersion: options.apiVersion,
    });
  }

  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const customer = await this.client.post<StripeCustomer>('/customers', {
      name: params.name,
      email: params.email,
      ...flattenMetadata(params.metadata),
    });
    return { providerId: customer.id };
  }

  async deleteCustomer(providerId: string): Promise<void> {
    await this.client.delete<{ deleted: boolean }>(`/customers/${providerId}`);
  }

  async subscribe(params: SubscribeParams): Promise<SubscribeResult> {
    const subscription = await this.client.post<StripeSubscription>('/subscriptions', {
      customer: params.customerId,
      'items[0][price]': params.priceId,
      ...(params.trialDays ? { trial_period_days: params.trialDays } : {}),
      ...flattenMetadata(params.metadata),
    });
    return mapSubscription(subscription);
  }

  async cancelSubscription(subscriptionId: string, immediately = false): Promise<void> {
    if (immediately) {
      await this.client.delete<StripeSubscription>(`/subscriptions/${subscriptionId}`);
    } else {
      await this.client.post<StripeSubscription>(`/subscriptions/${subscriptionId}`, {
        cancel_at_period_end: true,
      });
    }
  }

  async resumeSubscription(subscriptionId: string): Promise<SubscribeResult> {
    const subscription = await this.client.post<StripeSubscription>(
      `/subscriptions/${subscriptionId}`,
      { cancel_at_period_end: false },
    );
    return mapSubscription(subscription);
  }

  async swapSubscription(params: SwapSubscriptionParams): Promise<SubscribeResult> {
    // First, get the subscription to find the item ID.
    const existing = await this.client.get<StripeSubscription>(
      `/subscriptions/${params.subscriptionId}`,
    );
    const itemId = existing.items.data[0]?.id;
    if (!itemId) {
      throw new Error(`Subscription ${params.subscriptionId} has no items`);
    }

    const subscription = await this.client.post<StripeSubscription>(
      `/subscriptions/${params.subscriptionId}`,
      {
        'items[0][id]': itemId,
        'items[0][price]': params.newPriceId,
        proration_behavior: params.prorationBehavior ?? 'create_prorations',
      },
    );
    return mapSubscription(subscription);
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CreateCheckoutSessionResult> {
    const session = await this.client.post<StripeCheckoutSession>('/checkout/sessions', {
      customer: params.customerId,
      mode: 'subscription',
      'line_items[0][price]': params.priceId,
      'line_items[0][quantity]': 1,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      ...(params.trialDays
        ? { 'subscription_data[trial_period_days]': params.trialDays }
        : {}),
      ...flattenMetadata(params.metadata, 'subscription_data[metadata]'),
    });
    return { sessionId: session.id, url: session.url };
  }

  async createPortalSession(
    params: CreatePortalSessionParams,
  ): Promise<CreatePortalSessionResult> {
    const session = await this.client.post<{ url: string }>('/billing_portal/sessions', {
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  async meterUsage(params: MeterUsageParams): Promise<void> {
    await this.client.post('/billing/meter_events', {
      event_name: params.meterId,
      payload: JSON.stringify({
        stripe_customer_id: params.customerId,
        value: String(params.quantity),
      }),
      ...(params.timestamp ? { timestamp: Math.floor(params.timestamp.getTime() / 1000) } : {}),
    });
  }

  async parseWebhookEvent(payload: string, signature: string): Promise<WebhookEvent> {
    await verifyStripeWebhook(payload, signature, this.options.webhookSecret);
    const event = JSON.parse(payload) as { id: string; type: string; data: unknown };
    return {
      id: event.id,
      type: event.type,
      data: event.data,
      raw: payload,
    };
  }
}

// Maps a Stripe subscription object to the framework's canonical SubscribeResult.
function mapSubscription(s: StripeSubscription): SubscribeResult {
  return {
    subscriptionId: s.id,
    status: s.status as SubscriptionStatus,
    currentPeriodStart: new Date(s.current_period_start * 1000),
    currentPeriodEnd: new Date(s.current_period_end * 1000),
    trialStart: s.trial_start ? new Date(s.trial_start * 1000) : null,
    trialEnd: s.trial_end ? new Date(s.trial_end * 1000) : null,
    cancelAt: s.cancel_at ? new Date(s.cancel_at * 1000) : null,
  };
}

// Flattens a metadata object to Stripe's bracket notation:
// { key: 'val' } => { 'metadata[key]': 'val' }
function flattenMetadata(
  metadata?: Record<string, string>,
  prefix = 'metadata',
): Record<string, string> {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [`${prefix}[${k}]`, v]),
  );
}
```

**Key decisions**:
- Stripe's form-encoded API uses bracket notation for nested objects: `items[0][price]=price_xxx`. The provider constructs these strings directly rather than going through a recursive encoder — it's more readable and easier to trace back to Stripe docs.
- `meterUsage` targets Stripe's Billing Meter Events API (2024 metering API), not the deprecated Usage Records API. The `payload` field is JSON-stringified as Stripe expects.
- `swapSubscription` requires fetching the existing subscription first to get the subscription item ID. This is an extra API call but is necessary — Stripe requires the item ID when updating a subscription's price.

---

### 6. Webhook Signature Verification

**Overview**: Verifies that incoming webhook requests are from Stripe using HMAC-SHA256. Uses the Web Crypto API (`crypto.subtle`) which is available in all Workers environments. No Node.js `crypto` module.

```typescript
// packages/billing/src/stripe/webhook.ts

/**
 * Verifies a Stripe webhook signature using the Web Crypto API.
 *
 * Stripe signs webhooks with HMAC-SHA256 using the webhook endpoint's
 * signing secret. The signature is in the `Stripe-Signature` header
 * in format: `t=<timestamp>,v1=<signature>[,v1=<signature>]`
 *
 * Verification steps:
 * 1. Parse the header to extract timestamp and v1 signatures
 * 2. Reject if timestamp is older than tolerance (default: 300 seconds)
 * 3. Compute expected signature: HMAC-SHA256(`${timestamp}.${payload}`, secret)
 * 4. Compare with constant-time comparison to prevent timing attacks
 *
 * @throws {WebhookVerificationError} if signature is invalid or timestamp is stale
 */
export async function verifyStripeWebhook(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds = 300,
): Promise<void> {
  const parts = parseSignatureHeader(signatureHeader);
  if (!parts) {
    throw new WebhookVerificationError('Invalid Stripe-Signature header format');
  }

  const { timestamp, signatures } = parts;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    throw new WebhookVerificationError(
      `Webhook timestamp is too old (${now - timestamp}s). Possible replay attack.`,
    );
  }

  const signingPayload = `${timestamp}.${payload}`;
  const expectedSig = await computeHmac(signingPayload, webhookSecret);

  const isValid = signatures.some((sig) => constantTimeEqual(sig, expectedSig));
  if (!isValid) {
    throw new WebhookVerificationError('Webhook signature verification failed');
  }
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

function parseSignatureHeader(
  header: string,
): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(',');
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = parseInt(value, 10);
    if (key === 'v1') signatures.push(value);
  }

  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

async function computeHmac(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

**Key decisions**:
- `crypto.subtle` is the Workers-native crypto API and is used here exclusively. It is asynchronous, hence the `async` function.
- The 300-second tolerance window is Stripe's recommendation. It's configurable for testing environments where test clock skew is common.
- `constantTimeEqual` prevents timing-based signature forgery. It is not using a library — the implementation is straightforward and auditable.
- The function accepts and returns `Promise<void>` (throws on failure) rather than returning `boolean`. This makes the caller's error handling path explicit: invalid signatures produce `WebhookVerificationError`, not a silent false.

**Implementation steps**:
1. Implement `parseSignatureHeader`
2. Implement `computeHmac` using `crypto.subtle`
3. Implement `constantTimeEqual`
4. Implement `verifyStripeWebhook` composing the above
5. Test: valid signature passes, wrong secret fails, stale timestamp fails, tampered payload fails, multiple v1 signatures (Stripe sends these during key rotation) — valid one passes

---

### 7. Webhook Handler

**Overview**: The `WebhookHandler` is a `Request => Response` function that sits at `/billing/webhook`. It calls `provider.parseWebhookEvent()` for signature verification, then dispatches to type-specific handler functions. Developers register handlers for the events they care about; unhandled events return 200 (Stripe requires a 200 for all processed events).

```typescript
// packages/billing/src/webhook-handler.ts

import type { BillingProvider } from './provider.ts';
import { Subscription } from './subscription.ts';
import { WebhookVerificationError } from './stripe/webhook.ts';

type WebhookEventHandler = (data: unknown) => Promise<void>;

export class WebhookHandler {
  private readonly handlers = new Map<string, WebhookEventHandler[]>();

  constructor(private readonly provider: BillingProvider) {
    // Register built-in handlers for Stripe subscription lifecycle events.
    this.on('customer.subscription.created', (data) => this.handleSubscriptionUpsert(data));
    this.on('customer.subscription.updated', (data) => this.handleSubscriptionUpsert(data));
    this.on('customer.subscription.deleted', (data) => this.handleSubscriptionDeleted(data));
    this.on('invoice.payment_succeeded', (data) => this.handleInvoicePaid(data));
    this.on('invoice.payment_failed', (data) => this.handleInvoiceFailed(data));
    this.on('checkout.session.completed', (data) => this.handleCheckoutCompleted(data));
  }

  // Register a handler for a specific Stripe event type.
  on(eventType: string, handler: WebhookEventHandler): this {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
    return this;
  }

  // Process an incoming webhook request.
  async handle(request: Request): Promise<Response> {
    const payload = await request.text();
    const signature = request.headers.get('Stripe-Signature') ?? '';

    let event;
    try {
      event = await this.provider.parseWebhookEvent(payload, signature);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return new Response('Webhook signature verification failed', { status: 400 });
      }
      return new Response('Webhook processing error', { status: 500 });
    }

    const eventHandlers = this.handlers.get(event.type) ?? [];
    try {
      await Promise.all(eventHandlers.map((h) => h(event.data)));
    } catch (err) {
      console.error(`Webhook handler error for ${event.type}:`, err);
      // Return 500 so Stripe retries the event.
      return new Response('Webhook handler failed', { status: 500 });
    }

    return new Response('OK', { status: 200 });
  }

  // --- Built-in handlers for Stripe subscription events ---

  private async handleSubscriptionUpsert(data: unknown): Promise<void> {
    const sub = data as { object: StripeSubscriptionWebhookObject };
    const stripeSubscription = sub.object;

    const existing = await Subscription.where('provider_id', stripeSubscription.id).first();
    if (existing) {
      existing.status = stripeSubscription.status as SubscriptionStatus;
      existing.priceId = stripeSubscription.items.data[0]?.price.id ?? existing.priceId;
      existing.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
      existing.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      existing.trialEndsAt = stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : null;
      existing.endsAt = stripeSubscription.cancel_at
        ? new Date(stripeSubscription.cancel_at * 1000)
        : null;
      existing.updatedAt = new Date();
      await existing.save();
    }
    // Note: subscriptions are created locally in the checkout.session.completed handler,
    // not here, because we need the billable model ID from the session metadata.
  }

  private async handleSubscriptionDeleted(data: unknown): Promise<void> {
    const sub = data as { object: { id: string } };
    const existing = await Subscription.where('provider_id', sub.object.id).first();
    if (existing) {
      existing.status = 'canceled';
      existing.endsAt = new Date();
      existing.updatedAt = new Date();
      await existing.save();
    }
  }

  private async handleInvoicePaid(data: unknown): Promise<void> {
    const invoice = data as { object: { subscription: string | null } };
    if (!invoice.object.subscription) return;
    const sub = await Subscription.where('provider_id', invoice.object.subscription).first();
    if (sub && sub.status === 'past_due') {
      sub.status = 'active';
      sub.updatedAt = new Date();
      await sub.save();
    }
  }

  private async handleInvoiceFailed(data: unknown): Promise<void> {
    const invoice = data as { object: { subscription: string | null } };
    if (!invoice.object.subscription) return;
    const sub = await Subscription.where('provider_id', invoice.object.subscription).first();
    if (sub) {
      sub.status = 'past_due';
      sub.updatedAt = new Date();
      await sub.save();
    }
  }

  private async handleCheckoutCompleted(data: unknown): Promise<void> {
    const session = data as {
      object: {
        id: string;
        customer: string;
        subscription: string | null;
        metadata: Record<string, string>;
      };
    };
    const { customer, subscription, metadata } = session.object;
    if (!subscription) return;

    // Create the local subscription record using metadata the app put on the session.
    const billableId = metadata.billableId;
    const billableType = metadata.billableType ?? 'User';
    if (!billableId) return;

    // Fetch full subscription from Stripe to get all details.
    // This is a second Stripe API call but is necessary for accurate local state.
    // The alternative (trusting event data) can race with subscription.created events.
    const existing = await Subscription.where('provider_id', subscription).first();
    if (!existing) {
      await Subscription.create({
        id: crypto.randomUUID(),
        billableId,
        billableType,
        providerId: subscription,
        providerCustomerId: customer,
        priceId: metadata.priceId ?? '',
        status: 'active',
        quantity: 1,
        trialEndsAt: null,
        endsAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
}

import type { SubscriptionStatus } from './types.ts';
interface StripeSubscriptionWebhookObject {
  id: string;
  status: string;
  items: { data: Array<{ price: { id: string } }> };
  current_period_start: number;
  current_period_end: number;
  trial_end: number | null;
  cancel_at: number | null;
}
```

**Key decisions**:
- Unhandled event types return 200 silently. Stripe retries on 4xx/5xx. An unhandled event type is not an error — the app just doesn't care about it.
- Subscription creation happens in `checkout.session.completed`, not `customer.subscription.created`. The checkout session metadata carries `billableId` and `billableType` (set when creating the session). This is the reliable way to link a Stripe subscription to a local user.
- Handler errors return 500 to trigger Stripe retry. This is correct behavior — if the DB write failed, we want Stripe to re-send the event.

---

### 8. Middleware

**Overview**: Two middleware classes that gate route access based on subscription status. They extend the `Middleware` interface from `@roost/core` (Phase 1).

```typescript
// packages/billing/src/middleware.ts

import type { Middleware } from '@roost/core';
import type { Container } from '@roost/core';
import type { Billable } from './billable.ts';

/**
 * Requires the authenticated user to have an active subscription.
 *
 * Usage in route config:
 *   middleware: ['subscribed']           // any active subscription
 *   middleware: ['subscribed:premium']   // specific price ID
 *
 * The middleware reads the authenticated user from the request context
 * (set by @roost/auth's middleware in Phase 3).
 */
export class SubscribedMiddleware implements Middleware {
  constructor(private readonly container: Container) {}

  async handle(
    request: Request,
    next: (req: Request) => Promise<Response>,
    priceId?: string,
  ): Promise<Response> {
    const user = this.getUserFromRequest(request);
    if (!user) {
      return Response.redirect('/login', 302);
    }

    const isSubscribed = await user.subscribed(priceId);
    if (!isSubscribed) {
      const redirectUrl = this.getRedirectUrl(request);
      return Response.redirect(redirectUrl, 302);
    }

    return next(request);
  }

  private getUserFromRequest(request: Request): (BillableModel & BillableMethods) | null {
    // Reads from request context set by auth middleware.
    // The exact mechanism depends on Phase 3's auth implementation.
    return (request as RequestWithContext).context?.user ?? null;
  }

  private getRedirectUrl(_request: Request): string {
    // Could be made configurable via config('billing.redirect')
    return '/pricing';
  }
}

/**
 * Allows access only when the user is in a trial period.
 * Redirects to subscription page if not on trial.
 */
export class OnTrialMiddleware implements Middleware {
  constructor(private readonly container: Container) {}

  async handle(
    request: Request,
    next: (req: Request) => Promise<Response>,
  ): Promise<Response> {
    const user = this.getUserFromRequest(request);
    if (!user) {
      return Response.redirect('/login', 302);
    }

    const isOnTrial = await user.onTrial();
    if (!isOnTrial) {
      return Response.redirect('/pricing', 302);
    }

    return next(request);
  }

  private getUserFromRequest(request: Request): (BillableModel & BillableMethods) | null {
    return (request as RequestWithContext).context?.user ?? null;
  }
}

// Internal types for request context (matches @roost/auth's shape)
interface BillableModel {
  subscribed(priceId?: string): Promise<boolean>;
  onTrial(): Promise<boolean>;
}
type BillableMethods = BillableModel;
interface RequestWithContext extends Request {
  context?: { user?: BillableModel };
}
```

---

### 9. Testing Fake

**Overview**: `BillingFake` replaces `StripeProvider` in the container with an in-memory implementation. It captures all calls and provides assertion helpers. It also supports simulating webhooks by directly invoking webhook handlers with fabricated event data.

```typescript
// packages/billing/src/fake.ts

import type { BillingProvider } from './provider.ts';
import type {
  CreateCustomerParams,
  CreateCustomerResult,
  SubscribeParams,
  SubscribeResult,
  SwapSubscriptionParams,
  CreateCheckoutSessionParams,
  CreateCheckoutSessionResult,
  CreatePortalSessionParams,
  CreatePortalSessionResult,
  MeterUsageParams,
  WebhookEvent,
  SubscriptionStatus,
} from './types.ts';

interface CustomerRecord {
  params: CreateCustomerParams;
  providerId: string;
}

interface SubscriptionRecord {
  params: SubscribeParams;
  result: SubscribeResult;
}

interface MeterRecord {
  params: MeterUsageParams;
}

export class BillingFake implements BillingProvider {
  readonly customers: CustomerRecord[] = [];
  readonly subscriptions: SubscriptionRecord[] = [];
  readonly meters: MeterRecord[] = [];
  readonly canceledSubscriptions: string[] = [];
  readonly checkoutSessions: CreateCheckoutSessionParams[] = [];
  readonly portalSessions: CreatePortalSessionParams[] = [];
  private customerIdCounter = 1;
  private subscriptionIdCounter = 1;

  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const providerId = `cus_fake_${this.customerIdCounter++}`;
    this.customers.push({ params, providerId });
    return { providerId };
  }

  async deleteCustomer(providerId: string): Promise<void> {
    const index = this.customers.findIndex((c) => c.providerId === providerId);
    if (index >= 0) this.customers.splice(index, 1);
  }

  async subscribe(params: SubscribeParams): Promise<SubscribeResult> {
    const now = new Date();
    const result: SubscribeResult = {
      subscriptionId: `sub_fake_${this.subscriptionIdCounter++}`,
      status: params.trialDays ? 'trialing' : 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      trialStart: params.trialDays ? now : null,
      trialEnd: params.trialDays
        ? new Date(now.getTime() + params.trialDays * 24 * 60 * 60 * 1000)
        : null,
      cancelAt: null,
    };
    this.subscriptions.push({ params, result });
    return result;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    this.canceledSubscriptions.push(subscriptionId);
  }

  async resumeSubscription(subscriptionId: string): Promise<SubscribeResult> {
    const sub = this.subscriptions.find((s) => s.result.subscriptionId === subscriptionId);
    if (!sub) throw new Error(`Fake: subscription ${subscriptionId} not found`);
    sub.result.status = 'active';
    return sub.result;
  }

  async swapSubscription(params: SwapSubscriptionParams): Promise<SubscribeResult> {
    const sub = this.subscriptions.find(
      (s) => s.result.subscriptionId === params.subscriptionId,
    );
    if (!sub) throw new Error(`Fake: subscription ${params.subscriptionId} not found`);
    sub.params.priceId = params.newPriceId;
    return sub.result;
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CreateCheckoutSessionResult> {
    this.checkoutSessions.push(params);
    return {
      sessionId: `cs_fake_${Date.now()}`,
      url: `https://checkout.stripe.com/fake/${Date.now()}`,
    };
  }

  async createPortalSession(
    params: CreatePortalSessionParams,
  ): Promise<CreatePortalSessionResult> {
    this.portalSessions.push(params);
    return { url: `https://billing.stripe.com/p/fake/${Date.now()}` };
  }

  async meterUsage(params: MeterUsageParams): Promise<void> {
    this.meters.push({ params });
  }

  async parseWebhookEvent(payload: string, _signature: string): Promise<WebhookEvent> {
    // In test mode, skip signature verification.
    const event = JSON.parse(payload) as { id: string; type: string; data: unknown };
    return { id: event.id, type: event.type, data: event.data, raw: payload };
  }

  // --- Assertion helpers ---

  assertCustomerCreated(email?: string): void {
    if (email) {
      const found = this.customers.some((c) => c.params.email === email);
      if (!found) {
        throw new Error(`Expected customer with email "${email}" to be created, but was not.`);
      }
    } else {
      if (this.customers.length === 0) {
        throw new Error('Expected at least one customer to be created, but none were.');
      }
    }
  }

  assertSubscribed(customerId?: string): void {
    if (customerId) {
      const found = this.subscriptions.some((s) => s.params.customerId === customerId);
      if (!found) {
        throw new Error(
          `Expected customer "${customerId}" to have a subscription, but none found.`,
        );
      }
    } else {
      if (this.subscriptions.length === 0) {
        throw new Error('Expected at least one subscription, but none were created.');
      }
    }
  }

  assertCanceled(subscriptionId: string): void {
    if (!this.canceledSubscriptions.includes(subscriptionId)) {
      throw new Error(`Expected subscription "${subscriptionId}" to be canceled, but it was not.`);
    }
  }

  assertMetered(meterId: string, quantity?: number): void {
    const records = this.meters.filter((m) => m.params.meterId === meterId);
    if (records.length === 0) {
      throw new Error(`Expected meter event "${meterId}" to be recorded, but was not.`);
    }
    if (quantity !== undefined) {
      const totalQuantity = records.reduce((sum, m) => sum + m.params.quantity, 0);
      if (totalQuantity !== quantity) {
        throw new Error(
          `Expected meter "${meterId}" total quantity ${quantity}, but got ${totalQuantity}.`,
        );
      }
    }
  }
}

// Module-level fake reference, managed by the service provider in tests.
let fakeInstance: BillingFake | null = null;

export const Billing = {
  fake(): BillingFake {
    fakeInstance = new BillingFake();
    return fakeInstance;
  },

  restore(): void {
    fakeInstance = null;
  },

  current(): BillingFake | null {
    return fakeInstance;
  },
};
```

**Key decisions**:
- `parseWebhookEvent` in the fake skips signature verification. This allows webhook tests to pass in a fabricated payload without computing a valid HMAC. Tests for signature verification itself live in `webhook.test.ts` which tests `verifyStripeWebhook` directly.
- Assertion methods throw with descriptive messages. This matches the `JobFake` pattern from Phase 6 and the general Roost testing philosophy: assertions are not boolean returns — they throw on failure.
- `Billing.fake()` returns the `BillingFake` instance so tests can access the raw records (`billing.customers`, `billing.subscriptions`) for assertions beyond what the built-in helpers cover.

---

### 10. Service Provider

**Overview**: `BillingServiceProvider` registers all billing services into the container. It reads Stripe keys from env and wires the webhook handler into the application's routing.

```typescript
// packages/billing/src/service-provider.ts

import { ServiceProvider } from '@roost/core';
import { StripeProvider } from './stripe/provider.ts';
import { WebhookHandler } from './webhook-handler.ts';
import { BILLING_PROVIDER } from './provider.ts';

export interface BillingServiceProviderOptions {
  // Env key names, not the values themselves. Values are read from this.app.env.
  stripeSecretKey?: string;        // default: 'STRIPE_SECRET_KEY'
  stripeWebhookSecret?: string;    // default: 'STRIPE_WEBHOOK_SECRET'
  webhookPath?: string;            // default: '/billing/webhook'
}

export class BillingServiceProvider extends ServiceProvider {
  constructor(
    app: Application,
    private readonly opts: BillingServiceProviderOptions = {},
  ) {
    super(app);
  }

  register(): void {
    const secretKeyVar = this.opts.stripeSecretKey ?? 'STRIPE_SECRET_KEY';
    const webhookSecretVar = this.opts.stripeWebhookSecret ?? 'STRIPE_WEBHOOK_SECRET';

    this.app.container.singleton(BILLING_PROVIDER, () => {
      const secretKey = this.app.env[secretKeyVar] as string | undefined;
      const webhookSecret = this.app.env[webhookSecretVar] as string | undefined;

      if (!secretKey) {
        throw new Error(
          `Billing: env var "${secretKeyVar}" is not set. Add it to your wrangler.toml [vars] or secrets.`,
        );
      }
      if (!webhookSecret) {
        throw new Error(
          `Billing: env var "${webhookSecretVar}" is not set. Run: wrangler secret put ${webhookSecretVar}`,
        );
      }

      return new StripeProvider({ secretKey, webhookSecret });
    });

    this.app.container.singleton(WebhookHandler, (c) =>
      new WebhookHandler(c.resolve(BILLING_PROVIDER) as BillingProvider),
    );
  }
}

import type { Application } from '@roost/core';
import type { BillingProvider } from './provider.ts';
```

**User setup** (in their route config, Phase 2 dependency):

```typescript
import { BillingServiceProvider } from '@roost/billing';

const app = Application.create(env);
app.register(new BillingServiceProvider(app));
await app.boot();

// Register webhook route (Phase 2 routing pattern)
app.router.post('/billing/webhook', async (request) => {
  const handler = app.container.resolve(WebhookHandler);
  return handler.handle(request);
});
```

---

## Data Model

```sql
-- D1 migration generated by @roost/orm make:migration
CREATE TABLE subscriptions (
  id                   TEXT PRIMARY KEY,
  billable_id          TEXT NOT NULL,
  billable_type        TEXT NOT NULL,
  provider_id          TEXT NOT NULL UNIQUE,
  provider_customer_id TEXT NOT NULL,
  price_id             TEXT NOT NULL,
  status               TEXT NOT NULL,
  quantity             INTEGER NOT NULL DEFAULT 1,
  trial_ends_at        INTEGER,
  ends_at              INTEGER,
  current_period_start INTEGER NOT NULL,
  current_period_end   INTEGER NOT NULL,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE INDEX subscriptions_billable_idx
  ON subscriptions (billable_id, billable_type);

CREATE INDEX subscriptions_provider_idx
  ON subscriptions (provider_id);
```

Additionally, the user's model table (typically `users`) needs:

```sql
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
CREATE INDEX users_stripe_customer_idx ON users (stripe_customer_id);
```

## API Design

### Billable Model (developer-facing)

```typescript
class User extends Billable(Model) {
  // ...
}

// Check subscription status
const isSubscribed = await user.subscribed();
const isOnPremium = await user.subscribed('price_premium_monthly');
const isTrial = await user.onTrial();

// Start a new subscription (redirects to Stripe Checkout)
const session = await user.newSubscription('price_basic_monthly', successUrl, cancelUrl);
return Response.redirect(session.url);

// Self-service billing portal
const portal = await user.billingPortal('https://app.example.com/dashboard');
return Response.redirect(portal.url);

// Usage-based billing
await user.meter('api_calls', 5);

// Cancel subscription
const sub = await user.subscription();
await sub?.cancel(provider);

// Swap plan
await sub?.swap(provider, 'price_premium_monthly');
```

### Middleware (developer-facing, Phase 2 routing)

```typescript
// Require any active subscription
router.get('/dashboard', [SubscribedMiddleware], handler);

// Require specific plan
router.get('/premium-feature', [SubscribedMiddleware.for('price_premium')], handler);

// Trial users only
router.get('/trial-feature', [OnTrialMiddleware], handler);
```

### Webhook Registration (developer-facing)

```typescript
const handler = app.container.resolve(WebhookHandler);

// Add a custom handler alongside built-in ones
handler.on('customer.subscription.trial_will_end', async (data) => {
  const event = data as { object: { customer: string } };
  await SendTrialEndingEmail.dispatch({ customerId: event.object.customer });
});
```

### Testing (developer-facing)

```typescript
import { Billing, BillingFake } from '@roost/billing';
import { describe, it, beforeEach, afterEach, expect } from 'bun:test';

describe('subscription flow', () => {
  let billing: BillingFake;

  beforeEach(() => {
    billing = Billing.fake();
  });

  afterEach(() => {
    Billing.restore();
  });

  it('creates a customer and subscription when user subscribes', async () => {
    const user = await User.factory().create();
    await user.newSubscription('price_basic', 'https://app.com/success', 'https://app.com/cancel');

    billing.assertCustomerCreated(user.email);
    billing.assertCheckoutSessionCreated('price_basic');
  });

  it('simulates a webhook to test subscription state update', async () => {
    const webhookHandler = app.container.resolve(WebhookHandler);
    const event = {
      id: 'evt_test_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_1',
          status: 'past_due',
          items: { data: [{ price: { id: 'price_basic' } }] },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
          trial_end: null,
          cancel_at: null,
        },
      },
    };

    await webhookHandler.handle(
      new Request('https://app.com/billing/webhook', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'Stripe-Signature': 'fake-sig' },
      }),
    );

    // Verify local subscription updated
    const sub = await Subscription.where('provider_id', 'sub_test_1').first();
    expect(sub?.status).toBe('past_due');
  });
});
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/billing/__tests__/billable.test.ts` | subscribed() returns false/true based on local subscription, onTrial() checks trial date, meter() calls provider, getOrCreateStripeCustomer creates once then reuses |
| `packages/billing/__tests__/stripe-client.test.ts` | Correct auth header, form-encoded body, error response throws StripeRequestError, undefined values omitted |
| `packages/billing/__tests__/webhook.test.ts` | Valid signature passes, wrong secret fails, stale timestamp fails, tampered payload fails, header parsing handles multiple v1 sigs |
| `packages/billing/__tests__/middleware.test.ts` | subscribed middleware redirects unsubscribed user, allows subscribed user, passes priceId param correctly, onTrial redirects non-trial user |
| `packages/billing/__tests__/fake.test.ts` | assertCustomerCreated passes/fails, assertSubscribed passes/fails, simulateWebhook calls handlers, restore() resets state |

**Key test cases**:
- Billable: `user.subscribed()` returns `false` when no Subscription record exists
- Billable: `user.subscribed()` returns `true` when a Subscription with `status: 'active'` exists
- Billable: `user.subscribed('price_premium')` returns `false` when subscription is `price_basic`
- Stripe client: `encodeFormBody({ a: 'b', c: undefined })` produces `a=b` (no `c=`)
- Webhook: compute a real HMAC with a known secret and timestamp, verify it passes; tamper the payload by one byte, verify it fails
- Webhook handler: unhandled event type returns 200, handler that throws returns 500

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| Invalid webhook signature | Return 400, do not process event |
| Stale webhook timestamp | Return 400 with `WebhookVerificationError` |
| Stripe API returns 4xx | Throw `StripeRequestError` with status and code, let caller decide how to handle |
| Stripe API returns 429 (rate limit) | `StripeRequestError` with status 429; future work: automatic retry with backoff |
| Missing STRIPE_SECRET_KEY env var | Throw at provider construction time with actionable error message |
| Billable model has no stripeCustomerId and customer creation fails | `StripeRequestError` propagates to caller; subscription flow fails cleanly |
| Subscription not found in DB when webhook arrives | Log warning, return 200 to Stripe (idempotent — subscription may have been created by a later event) |
| Webhook handler throws | Return 500 so Stripe retries; log the error |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| StripeClient | Workers fetch timeout | Stripe API latency spike | Request fails | Workers has 30s CPU limit; Stripe is typically <1s. Document that billing operations should not be on the critical request path |
| WebhookHandler | Duplicate event delivery | Stripe retries after 5xx | Subscription state updated twice | Make all handlers idempotent — check existing state before writing |
| Subscription model | Out-of-sync with Stripe | Webhook missed or failed | Local subscription shows wrong status | Implement `syncSubscription()` admin command that fetches from Stripe directly |
| Billable mixin | stripeCustomerId null race | Two requests simultaneously create customer | Two Stripe customers for one user | DB unique constraint on stripeCustomerId prevents duplicate, second insert fails gracefully |
| StripeProvider | API version deprecation | Stripe retires an API version | API calls start failing | Pin `apiVersion` in `StripeClient`, update periodically |
| Checkout session | User visits success URL without completing payment | Browser back button manipulation | Subscription created prematurely | Create subscription only in `checkout.session.completed` webhook, not on success URL redirect |

## Validation Commands

```bash
# Type checking
bun run --filter @roost/billing tsc --noEmit

# Unit tests
bun test --filter packages/billing

# Build
bun run --filter @roost/billing build

# Full suite
bun test
```
