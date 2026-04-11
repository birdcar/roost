import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';
import { Callout } from '../../../components/callout';

export const Route = createFileRoute('/docs/tutorials/build-a-saas-app')({
  component: BuildASaasAppPage,
});

function BuildASaasAppPage() {
  return (
    <DocLayout
      title="Build a SaaS App"
      subtitle="Add authentication, subscription billing, and background jobs to a Roost application."
    >
      <Callout type="note">
        <p><strong>What you'll learn</strong></p>
        <ul>
          <li>Protecting routes with WorkOS authentication via <code>AuthMiddleware</code></li>
          <li>Gating premium features with <code>SubscribedMiddleware</code> from <code>@roost/billing</code></li>
          <li>Creating Stripe Checkout sessions and verifying webhooks</li>
          <li>Dispatching background jobs with <code>@roost/queue</code></li>
        </ul>
        <p><strong>Time:</strong> ~45 minutes</p>
        <p><strong>Prerequisites:</strong></p>
        <ul>
          <li>Completed the <a href="/docs/getting-started">Quick Start</a></li>
          <li>A <a href="https://workos.com">WorkOS account</a> (free tier works)</li>
          <li>A <a href="https://stripe.com">Stripe account</a> (test mode works)</li>
        </ul>
        <p><strong>Packages used:</strong> <code>@roost/auth</code>, <code>@roost/billing</code>, <code>@roost/orm</code>, <code>@roost/start</code>, <code>@roost/queue</code></p>
      </Callout>

      <h2>Step 1: Create the Project</h2>
      <p>
        Use the <code>--with-billing</code> flag to scaffold a project that includes
        Stripe billing wiring, the <code>@roost/queue</code> package, and the necessary
        Cloudflare Queue bindings in <code>wrangler.jsonc</code>.
      </p>
      <CodeBlock title="terminal">
        {`roost new saas-app --with-billing
cd saas-app
bun install`}
      </CodeBlock>
      <p>
        <strong>You should see:</strong> A new <code>saas-app/</code> directory. Running
        <code>ls src/</code> shows <code>routes/</code>, <code>models/</code>, and a
        pre-wired <code>config/billing.ts</code> alongside the standard scaffolding.
      </p>

      <h2>Step 2: Configure WorkOS Credentials</h2>
      <p>
        Open <code>.dev.vars</code> and add your WorkOS credentials. You can find these
        in the WorkOS dashboard under <strong>API Keys</strong> and your application's
        <strong>Client ID</strong>.
      </p>
      <CodeBlock title=".dev.vars">
        {`WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          The <code>.dev.vars</code> file is in <code>.gitignore</code> by default.
          Never commit it. For production, set these secrets in the Cloudflare dashboard
          or with <code>wrangler secret put WORKOS_API_KEY</code>.
        </p>
      </Callout>
      <p>
        <strong>You should see:</strong> No visible change yet — credentials are loaded
        at runtime when the dev server starts.
      </p>

      <h2>Step 3: Start the Dev Server and Verify Auth Routes</h2>
      <CodeBlock title="terminal">
        {`bun run dev`}
      </CodeBlock>
      <p>
        Visit the following URLs in your browser. WorkOS handles the full OAuth flow;
        these routes are registered automatically by <code>AuthServiceProvider</code>
        once your credentials are in <code>.dev.vars</code>.
      </p>
      <CodeBlock>
        {`/auth/login      # Redirects to WorkOS hosted login
/auth/callback   # Receives the OAuth code, creates a session
/auth/logout     # Clears the session cookie`}
      </CodeBlock>
      <p>
        <strong>You should see:</strong> Visiting <code>/auth/login</code> redirects you
        to WorkOS. After signing in, you land back at <code>/dashboard</code> (which
        doesn't exist yet — a 404 is expected at this point).
      </p>

      <h2>Step 4: Create the Workspace Model</h2>
      <p>
        SaaS apps typically tie billing and data ownership to an organization (workspace).
        Generate a <code>Workspace</code> model with its migration:
      </p>
      <CodeBlock title="terminal">
        {`roost make:model Workspace`}
      </CodeBlock>
      <p>
        Open the generated migration in <code>database/migrations/</code> and define the
        schema. Each workspace belongs to a WorkOS organization:
      </p>
      <CodeBlock title="database/migrations/YYYYMMDDHHMMSS_create_workspaces_table.ts">
        {`import { Migration } from '@roost/orm';

export default class CreateWorkspacesTable extends Migration {
  async up(): Promise<void> {
    await this.schema.createTable('workspaces', (table) => {
      table.id();
      table.string('name');
      table.string('organization_id').unique();
      table.string('stripe_customer_id').nullable();
      table.string('subscription_id').nullable();
      table.string('subscription_status').default('inactive');
      table.timestamps();
    });
  }

  async down(): Promise<void> {
    await this.schema.dropTable('workspaces');
  }
}`}
      </CodeBlock>
      <p>Run the migration:</p>
      <CodeBlock title="terminal">
        {`roost migrate`}
      </CodeBlock>
      <p>
        <strong>You should see:</strong> Migration output confirming the <code>workspaces</code>
        table was created. The model file at <code>src/models/Workspace.ts</code> is ready
        to extend.
      </p>

      <h2>Step 5: Create a Protected Dashboard Route</h2>
      <p>
        Create the dashboard route. Applying <code>AuthMiddleware</code> redirects
        unauthenticated requests to <code>/auth/login</code> before the component renders.
      </p>
      <CodeBlock title="src/routes/dashboard.tsx">
        {`import { createFileRoute } from '@tanstack/react-router';
import { AuthMiddleware } from '@roost/auth';

export const Route = createFileRoute('/dashboard')({
  middleware: [new AuthMiddleware()],
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>You're signed in. Subscribe to unlock premium features.</p>
      <a href="/billing/checkout">Subscribe now</a>
    </div>
  );
}`}
      </CodeBlock>
      <p>
        <strong>You should see:</strong> Visiting <code>/dashboard</code> while signed
        out redirects you to <code>/auth/login</code>. After signing in, the dashboard
        renders.
      </p>

      <h2>Step 6: Add BillingMiddleware to Gate Premium Features</h2>
      <p>
        Create a route for premium content. <code>SubscribedMiddleware</code> checks the
        current user's workspace subscription status and redirects to <code>/billing/checkout</code>
        when they don't have an active subscription.
      </p>
      <CodeBlock title="src/routes/features/premium.tsx">
        {`import { createFileRoute } from '@tanstack/react-router';
import { AuthMiddleware } from '@roost/auth';
import { SubscribedMiddleware } from '@roost/billing';

export const Route = createFileRoute('/features/premium')({
  middleware: [new AuthMiddleware(), new SubscribedMiddleware()],
  component: PremiumPage,
});

function PremiumPage() {
  return (
    <div>
      <h1>Premium Features</h1>
      <p>You have an active subscription. Welcome to the good stuff.</p>
    </div>
  );
}`}
      </CodeBlock>
      <p>
        <strong>You should see:</strong> Visiting <code>/features/premium</code> while
        signed in but without an active subscription redirects you to
        <code>/billing/checkout</code>. You'll create that route in the next step.
      </p>

      <h2>Step 7: Configure Stripe and Create the Checkout Route</h2>
      <p>Add your Stripe credentials to <code>.dev.vars</code>:</p>
      <CodeBlock title=".dev.vars">
        {`WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...`}
      </CodeBlock>
      <p>
        Now create the checkout route. It uses <code>StripeProvider.createCheckoutSession</code>
        to generate a hosted Stripe Checkout URL and redirects the user there.
      </p>
      <CodeBlock title="src/routes/billing/checkout.tsx">
        {`import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { AuthMiddleware } from '@roost/auth';
import { StripeProvider } from '@roost/billing';

const startCheckout = createServerFn({ method: 'GET' }).handler(async ({ context }) => {
  const env = context.env as { STRIPE_SECRET_KEY: string; STRIPE_WEBHOOK_SECRET: string; STRIPE_PRICE_ID: string };
  const billing = new StripeProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);

  // In a real app, load the workspace's stripe_customer_id from the database.
  // For this tutorial we create a new customer each time.
  const customer = await billing.createCustomer({
    name: 'Tutorial User',
    email: 'user@example.com',
  });

  const session = await billing.createCheckoutSession({
    customerId: customer.providerId,
    priceId: env.STRIPE_PRICE_ID,
    successUrl: 'http://localhost:3000/billing/success',
    cancelUrl: 'http://localhost:3000/dashboard',
  });

  throw redirect({ href: session.url });
});

export const Route = createFileRoute('/billing/checkout')({
  middleware: [new AuthMiddleware()],
  loader: () => startCheckout(),
  component: () => null,
});`}
      </CodeBlock>
      <p>
        <strong>You should see:</strong> Visiting <code>/billing/checkout</code> while
        signed in immediately redirects you to Stripe's hosted checkout page. Use Stripe's
        test card <code>4242 4242 4242 4242</code> with any future expiry and CVC.
      </p>

      <h2>Step 8: Handle the subscription.created Webhook</h2>
      <p>
        After a successful checkout, Stripe sends a <code>customer.subscription.created</code>
        event to your webhook endpoint. <code>verifyStripeWebhook</code> validates the
        signature before you process the event.
      </p>
      <CodeBlock title="src/routes/billing/webhook.ts">
        {`import { createServerFileRoute } from '@tanstack/react-start/server';
import { verifyStripeWebhook, WebhookVerificationError } from '@roost/billing';
import { Workspace } from '../../models/Workspace';
import { SendWelcomeEmail } from '../../jobs/SendWelcomeEmail';

export const ServerRoute = createServerFileRoute('/billing/webhook').methods({
  POST: async ({ request, context }) => {
    const env = context.env as { STRIPE_WEBHOOK_SECRET: string };

    let event;
    try {
      event = await verifyStripeWebhook(request, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return new Response('Invalid signature', { status: 400 });
      }
      throw err;
    }

    if (event.type === 'customer.subscription.created') {
      const subscription = event.data.object as {
        id: string;
        status: string;
        customer: string;
        metadata: Record<string, string>;
      };

      await Workspace.query()
        .where('stripe_customer_id', subscription.customer)
        .update({
          subscription_id: subscription.id,
          subscription_status: subscription.status,
        });

      const organizationId = subscription.metadata['organization_id'] ?? '';
      await SendWelcomeEmail.dispatch({ organizationId });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
});`}
      </CodeBlock>
      <Callout type="warning">
        <p>
          Always return a <code>200</code> response to Stripe quickly. If processing takes
          more than a few seconds, dispatch a job immediately and do the work in the
          background — exactly what the next step covers.
        </p>
      </Callout>
      <p>
        <strong>You should see:</strong> When forwarding a test webhook with the Stripe
        CLI (<code>stripe listen --forward-to localhost:3000/billing/webhook</code>), the
        terminal shows a <code>200</code> response and your database row is updated.
      </p>

      <h2>Step 9: Create the SendWelcomeEmail Job</h2>
      <p>
        Generate a job class for sending the welcome email. The <code>@Queue</code>
        decorator tells the dispatcher which Cloudflare Queue binding to use.
      </p>
      <CodeBlock title="terminal">
        {`roost make:job SendWelcomeEmail`}
      </CodeBlock>
      <p>Fill in the generated file:</p>
      <CodeBlock title="src/jobs/SendWelcomeEmail.ts">
        {`import { Job, Queue } from '@roost/queue';

interface Payload {
  organizationId: string;
}

@Queue('default')
export class SendWelcomeEmail extends Job<Payload> {
  async handle(): Promise<void> {
    const { organizationId } = this.payload;

    // Replace with your actual email-sending logic.
    // @roost/ai, an HTTP client to Resend, or any transactional
    // email service can go here.
    console.log(\`Sending welcome email for organization: \${organizationId}\`);
  }

  onFailure(error: Error): void {
    console.error(\`SendWelcomeEmail failed for \${this.payload.organizationId}:\`, error);
  }
}`}
      </CodeBlock>
      <p>
        <strong>You should see:</strong> The file at <code>src/jobs/SendWelcomeEmail.ts</code>
        is in place. TypeScript will error if <code>handle()</code> is missing — the
        abstract method contract is enforced at compile time.
      </p>

      <h2>Step 10: Dispatch the Job from the Webhook Handler</h2>
      <p>
        The webhook handler in Step 8 already calls <code>SendWelcomeEmail.dispatch</code>.
        The static <code>dispatch</code> method serializes the payload and sends it to the
        Cloudflare Queue bound to the <code>'default'</code> queue name. No additional
        wiring is needed.
      </p>
      <p>
        If you want to delay the email by 30 seconds (for example, to let the database
        write settle across replicas), use <code>dispatchAfter</code>:
      </p>
      <CodeBlock title="src/routes/billing/webhook.ts (excerpt)">
        {`// Dispatch immediately
await SendWelcomeEmail.dispatch({ organizationId });

// Or delay by 30 seconds
await SendWelcomeEmail.dispatchAfter(30, { organizationId });`}
      </CodeBlock>
      <p>
        <strong>You should see:</strong> In <code>wrangler dev</code> output, a log line
        confirming the message was enqueued. The consumer worker picks it up and runs
        <code>handle()</code>, printing the console log from your job class.
      </p>

      <h2>Step 11: Test the Full Flow</h2>
      <p>Run the dev server and the Stripe CLI webhook forwarder in two terminals:</p>
      <CodeBlock title="terminal (tab 1)">
        {`bun run dev`}
      </CodeBlock>
      <CodeBlock title="terminal (tab 2)">
        {`stripe listen --forward-to localhost:3000/billing/webhook`}
      </CodeBlock>
      <p>Then walk through the complete signup-to-subscription flow:</p>
      <ol>
        <li>
          Visit <code>http://localhost:3000/auth/login</code> and sign in with WorkOS.
          You should land on <code>/dashboard</code>.
        </li>
        <li>
          Click <strong>Subscribe now</strong>. You should be redirected to Stripe
          Checkout.
        </li>
        <li>
          Complete checkout with test card <code>4242 4242 4242 4242</code>. You should
          be redirected to <code>/billing/success</code>.
        </li>
        <li>
          In terminal 2, you should see Stripe deliver a
          <code>customer.subscription.created</code> event and receive a
          <code>200</code> response.
        </li>
        <li>
          In terminal 1 (wrangler output), you should see the
          <code>SendWelcomeEmail</code> job log line appear as the queue consumer
          processes the message.
        </li>
        <li>
          Visit <code>http://localhost:3000/features/premium</code>. You should now see
          the premium page instead of being redirected to checkout.
        </li>
      </ol>
      <Callout type="tip">
        <p>
          Use <code>stripe trigger customer.subscription.created</code> in a third
          terminal to re-fire the event without going through checkout again during
          development.
        </p>
      </Callout>

      <h2>What You Built</h2>
      <p>In this tutorial you:</p>
      <ul>
        <li>Scaffolded a project with billing support using <code>roost new --with-billing</code></li>
        <li>
          Configured WorkOS credentials and verified the three auth routes
          (<code>/auth/login</code>, <code>/auth/callback</code>, <code>/auth/logout</code>)
        </li>
        <li>Created a <code>Workspace</code> model that tracks Stripe customer and subscription IDs</li>
        <li>Protected a dashboard route with <code>AuthMiddleware</code></li>
        <li>Gated a premium route with <code>SubscribedMiddleware</code></li>
        <li>
          Created a Stripe Checkout session with <code>StripeProvider.createCheckoutSession</code>
        </li>
        <li>
          Verified and handled the <code>customer.subscription.created</code> webhook
          using <code>verifyStripeWebhook</code>
        </li>
        <li>
          Defined a <code>SendWelcomeEmail</code> job by extending <code>Job</code> and
          decorating it with <code>@Queue('default')</code>
        </li>
        <li>Dispatched the job from a webhook handler with the static <code>dispatch</code> method</li>
      </ul>

      <h2>Next Steps</h2>
      <ul>
        <li>
          <a href="/docs/reference/auth">@roost/auth reference</a> — full API for
          <code>SessionManager</code>, <code>OrgResolver</code>, and role-based middleware
        </li>
        <li>
          <a href="/docs/guides/billing">@roost/billing guide</a> — subscription swaps,
          usage-based billing, the customer portal, and webhook event catalogue
        </li>
        <li>
          <a href="/docs/concepts/auth">Auth concepts</a> — how WorkOS AuthKit, the
          session layer, and organization membership fit together in Roost
        </li>
      </ul>
    </DocLayout>
  );
}
