import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';
import { Callout } from '../../../components/callout';

export const Route = createFileRoute('/docs/tutorials/deploy-to-cloudflare')({
  component: DeployToCloudfarePage,
});

function DeployToCloudfarePage() {
  return (
    <DocLayout
      title="Deploy to Cloudflare"
      subtitle="Take your Roost application from local development to production on Cloudflare Workers."
    >
      <Callout type="note">
        <p><strong>What you'll learn</strong></p>
        <ul>
          <li>How to deploy a Roost app to Cloudflare Workers</li>
          <li>How to set production secrets in the Cloudflare dashboard</li>
          <li>How to attach a custom domain to your deployed app</li>
        </ul>
        <p><strong>Time:</strong> ~20 minutes</p>
        <p><strong>Prerequisites:</strong> A working local Roost app and a Cloudflare account.</p>
        <p>
          <strong>Packages used:</strong>{' '}
          <a href="/docs/packages/cloudflare">@roost/cloudflare</a>,{' '}
          <a href="/docs/packages/start">@roost/start</a>,{' '}
          <a href="/docs/packages/cli">@roost/cli</a>
        </p>
      </Callout>

      <h2>Step 1: Verify your local app works</h2>
      <p>Before deploying, confirm everything runs cleanly on your machine.</p>
      <CodeBlock title="terminal">
        {`bun run dev`}
      </CodeBlock>
      <p>
        You should see the dev server start and print a local URL. Open{' '}
        <code>http://localhost:3000</code> in your browser and confirm your app loads without errors.
        Fix any issues locally before continuing — deployments are much easier to debug when you
        start from a known-good state.
      </p>

      <h2>Step 2: Review wrangler.jsonc</h2>
      <p>
        Open <code>wrangler.jsonc</code> at the root of your project. Roost scaffolds this file for
        you, but it's worth understanding what's there.
      </p>
      <CodeBlock title="wrangler.jsonc">
        {`{
  "name": "my-app",
  "compatibility_date": "2024-01-01",

  // D1 — serverless SQL database
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-app-db",
      "database_id": "YOUR_D1_DATABASE_ID"
    }
  ],

  // KV — key-value store used for sessions and caching
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "YOUR_KV_NAMESPACE_ID"
    }
  ],

  // AI — Cloudflare Workers AI for built-in model inference
  "ai": {
    "binding": "AI"
  }
}`}
      </CodeBlock>
      <p>
        You should see bindings for <code>DB</code> (D1 database), <code>KV</code> (key-value
        store), and <code>AI</code> (Workers AI). The <code>database_id</code> and KV{' '}
        <code>id</code> fields are filled in automatically when you run <code>roost new</code>. If
        they're still placeholder values, run <code>roost provision</code> to create the resources
        and populate the file.
      </p>

      <h2>Step 3: Sign up for Cloudflare</h2>
      <p>
        If you don't have a Cloudflare account yet, create one at{' '}
        <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">
          dash.cloudflare.com/sign-up
        </a>
        . The free tier is enough to deploy and run your app.
      </p>
      <p>
        You should see the Cloudflare dashboard after signing in. Keep this tab open — you'll use
        it in the next step.
      </p>

      <h2>Step 4: Set production environment variables</h2>
      <p>
        Your <code>.dev.vars</code> file holds local secrets but is never deployed. Production
        secrets live in the Cloudflare dashboard.
      </p>
      <p>
        In the Cloudflare dashboard, go to <strong>Workers &amp; Pages</strong>, select your
        worker (it will appear after the first deploy if it doesn't exist yet — come back to this
        step then), and open <strong>Settings &gt; Variables</strong>. Add each secret as an
        encrypted environment variable:
      </p>
      <CodeBlock title="Production secrets to add">
        {`WORKOS_API_KEY       = sk_live_...
WORKOS_CLIENT_ID     = client_...

# If you use billing
STRIPE_SECRET_KEY    = sk_live_...
STRIPE_WEBHOOK_SECRET = whsec_...`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          Use the <strong>Encrypt</strong> toggle for each value so it's never shown in plaintext
          again after saving. Cloudflare will inject these automatically at runtime.
        </p>
      </Callout>
      <p>
        You should see each variable listed under <strong>Environment Variables</strong> with an
        encrypted badge.
      </p>

      <h2>Step 5: Deploy with roost deploy</h2>
      <p>Run the deploy command from your project root:</p>
      <CodeBlock title="terminal">
        {`roost deploy`}
      </CodeBlock>
      <p>
        Roost builds your app, runs database migrations against your production D1 instance, and
        publishes the Worker. The output looks like this:
      </p>
      <CodeBlock title="terminal output">
        {`Building application...
  ✓ TypeScript compiled
  ✓ Vite bundle complete (142 kB)

Running migrations...
  ✓ 0001_create_users applied
  ✓ 0002_create_posts applied

Deploying to Cloudflare Workers...
  ✓ Uploaded my-app (2.3 sec)
  ✓ Published my-app

https://my-app.your-subdomain.workers.dev`}
      </CodeBlock>
      <p>
        You should see a <code>workers.dev</code> URL printed at the end of the output. Copy it —
        you'll use it in the next step.
      </p>

      <h2>Step 6: Visit the live URL</h2>
      <p>
        Open the <code>workers.dev</code> URL from the deploy output in your browser. Your app is
        now running on Cloudflare's global network.
      </p>
      <p>
        You should see the same app you tested locally in Step 1. Try logging in and exercising a
        few routes to confirm the production environment is wired up correctly. If anything looks
        wrong, check the Cloudflare dashboard under <strong>Workers &gt; Logs</strong> for error
        details.
      </p>

      <h2>Step 7: Set up a custom domain</h2>
      <p>
        To serve your app from your own domain instead of <code>workers.dev</code>, open the
        Cloudflare dashboard, go to <strong>Workers &amp; Pages</strong>, select your worker, and
        click <strong>Settings &gt; Triggers &gt; Add Custom Domain</strong>. Enter your domain
        (e.g. <code>app.example.com</code>) and click <strong>Add Custom Domain</strong>.
      </p>
      <p>
        Cloudflare will create the DNS record automatically if your domain's nameservers point to
        Cloudflare. If they don't, you'll see instructions to add a CNAME record at your registrar.
      </p>
      <p>
        You should see your custom domain listed under Triggers with a green <strong>Active</strong>{' '}
        status after the DNS propagates (usually under a minute when using Cloudflare DNS).
      </p>

      <h2>Step 8: Make a change and redeploy</h2>
      <p>
        Edit any file in your app — for example, change a heading in one of your routes. Then
        deploy again:
      </p>
      <CodeBlock title="terminal">
        {`roost deploy`}
      </CodeBlock>
      <p>
        You should see the same build and deploy output as before, completing in a few seconds.
        Reload your custom domain in the browser and you should see your change live immediately.
        No restarts, no servers to manage — Cloudflare's edge deploys the new version globally
        within seconds.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li><a href="/docs/packages/cloudflare">@roost/cloudflare</a> — D1, KV, AI bindings in depth</li>
        <li><a href="/docs/packages/auth">@roost/auth</a> — configure production WorkOS callbacks</li>
        <li><a href="/docs/packages/billing">@roost/billing</a> — connect Stripe webhooks for production</li>
        <li><a href="/docs/packages/queue">@roost/queue</a> — background jobs with Cloudflare Queues</li>
      </ul>
    </DocLayout>
  );
}
