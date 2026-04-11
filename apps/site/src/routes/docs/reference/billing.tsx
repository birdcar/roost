import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/billing')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/billing" subtitle="Abstract billing provider interface with a Stripe adapter. Implemented using only fetch for Cloudflare Worker compatibility — no Node.js SDK.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/billing`}</CodeBlock>

      <h2>Configuration</h2>
      <p>Required environment variables:</p>
      <CodeBlock title=".dev.vars">{`STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...`}</CodeBlock>
      <p>Register the service provider:</p>
      <CodeBlock title="src/app.ts">{`import { BillingServiceProvider } from '@roost/billing';
app.register(BillingServiceProvider);`}</CodeBlock>
      <p>
        Resolve the provider via the <code>BillingProviderToken</code> symbol:
      </p>
      <CodeBlock>{`import { BillingProviderToken } from '@roost/billing';
const billing = container.resolve(BillingProviderToken);`}</CodeBlock>

      <h2>BillingProvider Interface</h2>
      <p>
        The abstract interface implemented by <code>StripeAdapter</code> (and <code>BillingFake</code>).
        Resolve via <code>BillingProviderToken</code> to stay provider-agnostic.
      </p>

      <h4><code>createCustomer(params: CreateCustomerParams): Promise&lt;CreateCustomerResult&gt;</code></h4>
      <p>Create a billing customer record. Returns the provider-assigned customer ID.</p>

      <h4><code>subscribe(params: SubscribeParams): Promise&lt;SubscribeResult&gt;</code></h4>
      <p>Create a subscription for a customer on the given price.</p>

      <h4><code>cancelSubscription(subscriptionId: string): Promise&lt;void&gt;</code></h4>
      <p>Cancel a subscription. The subscription remains active until the end of the billing period.</p>

      <h4><code>resumeSubscription(subscriptionId: string): Promise&lt;SubscribeResult&gt;</code></h4>
      <p>Resume a cancelled subscription before the billing period ends.</p>

      <h4><code>swapSubscription(params: SwapSubscriptionParams): Promise&lt;SubscribeResult&gt;</code></h4>
      <p>Change an existing subscription to a different price. Prorates immediately.</p>

      <h4><code>getSubscriptionStatus(subscriptionId: string): Promise&lt;SubscriptionStatus&gt;</code></h4>
      <p>
        Returns the current status string. Possible values: <code>'active'</code>,
        <code>'trialing'</code>, <code>'past_due'</code>, <code>'canceled'</code>,
        <code>'incomplete'</code>, <code>'incomplete_expired'</code>, <code>'paused'</code>.
      </p>

      <h4><code>createCheckoutSession(params: CheckoutSessionParams): Promise&lt;CheckoutSessionResult&gt;</code></h4>
      <p>Create a hosted checkout session. The result contains a <code>url</code> to redirect the user to.</p>

      <h4><code>createPortalSession(params: PortalSessionParams): Promise&lt;PortalSessionResult&gt;</code></h4>
      <p>Create a customer portal session. The result contains a <code>url</code> for the portal.</p>

      <h4><code>reportUsage(params: UsageRecordParams): Promise&lt;void&gt;</code></h4>
      <p>Report metered usage for a subscription item.</p>

      <h4><code>parseWebhookEvent(request: Request, webhookSecret: string): Promise&lt;WebhookEvent&gt;</code></h4>
      <p>
        Verify the webhook signature using the Web Crypto API and parse the event payload.
        Throws if the signature is invalid.
      </p>

      <h2>StripeAdapter</h2>
      <p>
        Concrete implementation of <code>BillingProvider</code> using Stripe's REST API
        via <code>fetch</code>. Registered by <code>BillingServiceProvider</code>.
      </p>

      <h2>BillingFake</h2>
      <p>
        In-memory implementation of <code>BillingProvider</code> for use in tests. Records
        all calls and returns synthetic results without network requests.
      </p>
      <CodeBlock>{`import { BillingFake } from '@roost/billing';

const fake = new BillingFake();
const customer = await fake.createCustomer({ name: 'Test', email: 'test@example.com' });`}</CodeBlock>

      <h2>SubscriptionMiddleware</h2>
      <p>
        Middleware that gates access by subscription status. Accepts one or more allowed
        status strings as arguments. Returns <code>402 Payment Required</code> if the user
        has no active subscription matching an allowed status.
      </p>
      <CodeBlock>{`import { SubscriptionMiddleware } from '@roost/billing';
app.useMiddleware(SubscriptionMiddleware, 'active', 'trialing');`}</CodeBlock>

      <h2>Types</h2>
      <CodeBlock>{`interface CreateCustomerParams {
  name: string;
  email: string;
  metadata?: Record<string, string>;
}

interface CreateCustomerResult {
  providerId: string;
}

interface SubscribeParams {
  customerId: string;
  priceId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

interface SubscribeResult {
  subscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
}

interface SwapSubscriptionParams {
  subscriptionId: string;
  priceId: string;
}

interface CheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}

interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

interface PortalSessionParams {
  customerId: string;
  returnUrl: string;
}

interface PortalSessionResult {
  url: string;
}

interface UsageRecordParams {
  subscriptionItemId: string;
  quantity: number;
  timestamp: number;
}

interface WebhookEvent {
  type: string;
  data: unknown;
}

type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';`}</CodeBlock>

    </DocLayout>
  );
}
