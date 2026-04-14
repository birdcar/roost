# @roostjs/billing

Provider-agnostic billing abstraction for Cloudflare Workers. Ships with a Stripe implementation that uses raw REST calls instead of the Stripe SDK, keeping your bundle lean.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/billing
```

## Quick Start

```ts
import { StripeProvider } from '@roostjs/billing';

const billing = new StripeProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);

// Create a customer and start a subscription
const { providerId } = await billing.createCustomer({ name: 'Acme', email: 'billing@acme.com' });
const { subscriptionId, status } = await billing.subscribe({
  customerId: providerId,
  priceId: 'price_xxx',
  trialDays: 14,
});

// Send them to a hosted checkout page
const { url } = await billing.createCheckoutSession({
  customerId: providerId,
  priceId: 'price_xxx',
  successUrl: 'https://app.example.com/welcome',
  cancelUrl: 'https://app.example.com/pricing',
});
```

## Features

- `BillingProvider` interface — swap providers without touching application code
- `StripeProvider` backed by raw Stripe REST API (no `stripe` npm package required)
- Subscriptions: create, cancel, resume, swap price
- Checkout sessions and customer portal sessions
- Usage-based billing via `reportUsage()`
- Stripe webhook verification with `parseWebhookEvent()`
- `FakeBillingProvider` with assertion helpers for unit tests
- `SubscribedMiddleware` and `OnTrialMiddleware` for route-level subscription gates

## API

### StripeProvider

```ts
new StripeProvider(secretKey: string, webhookSecret: string)
```

```ts
billing.createCustomer({ name, email, metadata? })
  // => { providerId: string }

billing.subscribe({ customerId, priceId, trialDays?, metadata? })
  // => { subscriptionId, status, currentPeriodEnd }

billing.cancelSubscription(subscriptionId)
billing.resumeSubscription(subscriptionId)
billing.swapSubscription(subscriptionId, newPriceId)
  // => { subscriptionId, status, currentPeriodEnd }

billing.getSubscriptionStatus(subscriptionId)
  // => SubscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | ...

billing.createCheckoutSession({ customerId, priceId, successUrl, cancelUrl, trialDays? })
  // => { sessionId, url }

billing.createPortalSession({ customerId, returnUrl })
  // => { url }

billing.reportUsage({ subscriptionItemId, quantity, timestamp? })

billing.parseWebhookEvent(request, secret?)
  // => { id, type, data }
```

### FakeBillingProvider (testing)

```ts
import { Billing, FakeBillingProvider } from '@roostjs/billing';

const fake = Billing.fake();    // installs globally; returns FakeBillingProvider instance
// ... run code that calls billing ...
fake.assertCustomerCreated('billing@acme.com');
fake.assertSubscribed('cus_fake_1');
fake.assertCanceled('sub_fake_1');
Billing.restore();
```

`FakeBillingProvider` exposes `customers`, `subscriptions`, `canceledSubscriptions`, `usageRecords`, and `webhookEvents` arrays for direct inspection alongside the assertion helpers.

### BillingProvider interface

```ts
import type { BillingProvider } from '@roostjs/billing';

class MyProvider implements BillingProvider {
  // implement the full interface to swap providers
}
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/billing](https://roost.birdcar.dev/docs/reference/billing)

## License

MIT
