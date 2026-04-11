import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/billing')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/billing" subtitle="Why billing is an abstract interface, how the adapter pattern lets you swap providers, and the subscription lifecycle model.">
      <h2>Why an Abstract Billing Interface</h2>
      <p>
        Direct Stripe integration is the default choice for most SaaS applications, and Stripe is
        genuinely excellent. But coupling application code directly to Stripe's SDK creates a
        dependency that is expensive to change. It also makes testing harder: tests that call Stripe
        directly require real API keys, create real test-mode customers, and are slow to run.
      </p>
      <p>
        Roost defines billing through the <code>BillingProvider</code> interface: a set of methods
        that every billing backend must implement — <code>createCustomer</code>, <code>subscribe</code>,
        <code>cancelSubscription</code>, <code>createCheckoutSession</code>, and others. Application
        code calls methods on this interface, resolved from the container, without knowing whether
        it is talking to Stripe, Paddle, or a fake. The adapter pattern — a class that wraps a
        specific billing provider's SDK and translates it to the <code>BillingProvider</code>
        interface — is where the Stripe-specific code lives.
      </p>

      <h2>The Adapter Pattern in Practice</h2>
      <p>
        <code>StripeProvider</code> is Roost's built-in implementation of <code>BillingProvider</code>.
        It wraps Stripe's Node.js SDK (which works fine on Workers), translates Roost's generic
        billing operations into Stripe API calls, and normalizes Stripe's responses into Roost's
        billing types. When Stripe introduces a new API version or changes a field name, only
        <code>StripeProvider</code> needs to change — not every piece of application code that
        creates customers or manages subscriptions.
      </p>
      <p>
        The <code>FakeBillingProvider</code> is the other built-in implementation, designed for
        tests. It records every billing operation in memory and provides assertion methods. A test
        can register the fake provider in the container, run application code that triggers billing,
        and assert that the right billing operations were recorded — without any Stripe API calls.
      </p>

      <h2>Webhook Verification</h2>
      <p>
        Billing providers send webhooks to notify your application of subscription changes, payment
        failures, and other events. Webhooks arrive as unsigned HTTP requests — any attacker who
        knows your webhook URL can send fake events. Providers sign their webhooks with a secret,
        and your endpoint must verify the signature before processing the event.
      </p>
      <p>
        Roost provides <code>verifyStripeWebhook(request, secret)</code> to verify Stripe's
        signature scheme. This is kept as a function rather than being embedded in the
        <code>BillingProvider</code> interface because webhook verification is inherently
        provider-specific: Stripe's signing algorithm is different from Paddle's, which is
        different again from Lemon Squeezy's. The interface covers the business operations;
        verification is a provider-level concern.
      </p>

      <h2>Subscription Lifecycle</h2>
      <p>
        A subscription has a lifecycle: created on a trial, converted to paid, potentially paused,
        cancelled, or resumed. Roost does not try to model every nuance of every provider's
        subscription state machine — Stripe alone has over a dozen subscription statuses. Instead,
        it provides middleware — <code>SubscribedMiddleware</code> and <code>OnTrialMiddleware</code>
        — that checks subscription status at the route level and redirects or rejects as
        appropriate. The middleware resolves the current user's subscription status through the
        <code>BillingProvider</code> interface, so it works with any provider.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/packages/billing">@roost/billing reference — BillingProvider, StripeProvider, FakeBillingProvider API</a></li>
        <li><a href="/docs/concepts/testing-philosophy">Testing Philosophy — fakes over mocks and how FakeBillingProvider fits the pattern</a></li>
        <li><a href="https://stripe.com/docs" target="_blank" rel="noopener noreferrer">Stripe Documentation</a></li>
      </ul>
    </DocLayout>
  );
}
