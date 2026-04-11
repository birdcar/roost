import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/billing')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/billing Guides" subtitle="Task-oriented instructions for Stripe integration, subscriptions, webhooks, and metered billing.">

      <h2>How to configure Stripe credentials</h2>
      <p>Add your Stripe keys to <code>.dev.vars</code> for local development and to the Cloudflare dashboard for production.</p>
      <CodeBlock title=".dev.vars">{`STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...`}</CodeBlock>
      <CodeBlock title="src/app.ts">{`import { BillingServiceProvider } from '@roost/billing';

app.register(BillingServiceProvider);
// BillingProvider is now available in the container`}</CodeBlock>
      <p>For production, add secrets via the Cloudflare dashboard under Workers &rarr; Settings &rarr; Variables. See <a href="/docs/guides/environment">the environment guide</a> for the full secrets workflow.</p>

      <h2>How to create a customer and subscription</h2>
      <p>Resolve <code>BillingProviderToken</code> from the container and call <code>createCustomer</code>, then <code>subscribe</code>. Store the returned IDs on your user record.</p>
      <CodeBlock>{`import { BillingProviderToken } from '@roost/billing';

async function subscribeUser(userId: string, priceId: string) {
  const billing = container.resolve(BillingProviderToken);
  const user = await User.findOrFail(userId);

  // Create Stripe customer if not yet created
  if (!user.attributes.stripeCustomerId) {
    const customer = await billing.createCustomer({
      name: user.attributes.name,
      email: user.attributes.email,
      metadata: { userId },
    });
    user.attributes.stripeCustomerId = customer.providerId;
    await user.save();
  }

  // Subscribe to a plan
  const subscription = await billing.subscribe({
    customerId: user.attributes.stripeCustomerId,
    priceId,               // e.g. 'price_pro_monthly' from Stripe dashboard
    trialDays: 14,
  });

  user.attributes.stripeSubscriptionId = subscription.subscriptionId;
  await user.save();

  return subscription;
}`}</CodeBlock>

      <h2>How to handle Stripe webhooks</h2>
      <p>Use <code>parseWebhookEvent</code> to verify the signature and parse the event. Return 200 immediately — process asynchronously if the handler is slow.</p>
      <CodeBlock title="src/routes/api/webhooks/stripe.ts">{`import { createFileRoute } from '@tanstack/react-router';
import { BillingProviderToken } from '@roost/billing';

export const Route = createFileRoute('/api/webhooks/stripe')({ component: () => null });

export async function POST(request: Request) {
  const billing = container.resolve(BillingProviderToken);

  let event;
  try {
    event = await billing.parseWebhookEvent(request, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      await User.where('stripeSubscriptionId', sub.id)
        .first()
        .then((user) => {
          if (user) {
            user.attributes.subscriptionStatus = sub.status;
            return user.save();
          }
        });
      break;
    }
    case 'customer.subscription.deleted': {
      // Handle cancellation
      break;
    }
    case 'invoice.payment_failed': {
      // Notify user of payment failure
      break;
    }
  }

  return new Response('OK', { status: 200 });
}`}</CodeBlock>
      <p>Register the webhook endpoint URL in the Stripe dashboard under Developers &rarr; Webhooks. Use <code>stripe listen --forward-to localhost:8787/api/webhooks/stripe</code> for local testing.</p>

      <h2>How to gate routes by subscription status</h2>
      <p>Add <code>SubscriptionMiddleware</code> to routes that require an active subscription. Pass the allowed statuses as arguments.</p>
      <CodeBlock>{`import { SubscriptionMiddleware } from '@roost/billing';

// Allow both active subscriptions and trials
app.useMiddleware(SubscriptionMiddleware, ['active', 'trialing']);`}</CodeBlock>
      <p>Users without a matching subscription receive a <code>402 Payment Required</code> response. To redirect instead, wrap the check in a custom middleware:</p>
      <CodeBlock>{`async function requireSubscription(request: Request, next: Handler): Promise<Response> {
  const user = await sessionManager.resolveUser(request);
  const billing = container.resolve(BillingProviderToken);
  const status = await billing.getSubscriptionStatus(user.stripeSubscriptionId);

  if (!['active', 'trialing'].includes(status)) {
    return Response.redirect('/billing/upgrade', 302);
  }

  return next(request);
}`}</CodeBlock>

      <h2>How to implement metered billing</h2>
      <p>Report usage to Stripe after each billable action using <code>reportUsage</code> with the subscription item ID from the subscription object.</p>
      <CodeBlock>{`import { BillingProviderToken } from '@roost/billing';

async function runAiQuery(userId: string, query: string) {
  const user = await User.findOrFail(userId);
  const billing = container.resolve(BillingProviderToken);

  // Run the billable action
  const result = await aiService.run(query);

  // Report one unit of usage
  await billing.reportUsage({
    subscriptionItemId: user.attributes.stripeSubscriptionItemId,
    quantity: 1,
    timestamp: Math.floor(Date.now() / 1000),
  });

  return result;
}`}</CodeBlock>
      <p>The <code>subscriptionItemId</code> (format: <code>si_...</code>) is the metered item within the subscription. Store it when you first create the subscription — it's available in the subscription object returned by <code>subscribe()</code>.</p>

    </DocLayout>
  );
}
