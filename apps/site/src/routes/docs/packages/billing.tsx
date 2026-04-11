import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/billing')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/billing</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Abstract billing interface with a Stripe adapter. Workers-compatible (uses fetch, not the Stripe Node SDK). Subscriptions, metering, checkout, portal, webhooks.</p>

      <h2>Setup</h2>
      <pre><code>{`// .dev.vars
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

app.register(BillingServiceProvider);`}</code></pre>

      <h2>Subscriptions</h2>
      <pre><code>{`const provider = container.resolve(BillingProviderToken);

const customer = await provider.createCustomer({ name: 'Alice', email: 'alice@test.com' });
const sub = await provider.subscribe({ customerId: customer.providerId, priceId: 'price_pro' });
await provider.cancelSubscription(sub.subscriptionId);`}</code></pre>

      <h2>Webhooks</h2>
      <pre><code>{`// Signature verified with Web Crypto API (crypto.subtle)
const event = await provider.parseWebhookEvent(request, webhookSecret);
// event.type: 'customer.subscription.created', etc.`}</code></pre>

      <h2>Testing</h2>
      <pre><code>{`const fake = Billing.fake();
await fake.createCustomer({ name: 'Test', email: 'test@test.com' });
fake.assertCustomerCreated('test@test.com');
Billing.restore();`}</code></pre>
    </div>
  );
}
