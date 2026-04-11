import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/deployment')({ component: Page });

function Page() {
  return (
    <DocLayout title="Deployment" subtitle="Task-oriented instructions for deploying Roost applications to Cloudflare Workers.">

      <h2>How to deploy with roost deploy</h2>
      <p><code>roost deploy</code> builds the application and publishes it to Cloudflare Workers in one step.</p>
      <CodeBlock title="terminal">{`roost deploy`}</CodeBlock>
      <p>Before deploying for the first time, ensure you are logged in to Cloudflare:</p>
      <CodeBlock title="terminal">{`wrangler login`}</CodeBlock>
      <p>The CLI reads <code>wrangler.jsonc</code> for the worker name, bindings, and compatibility settings. Confirm the <code>name</code> field matches your intended worker name before deploying.</p>
      <CodeBlock title="wrangler.jsonc">{`{
  "name": "my-app",
  "main": "dist/worker.js",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"]
}`}</CodeBlock>

      <h2>How to set production environment variables in Cloudflare dashboard</h2>
      <p>Production secrets are not deployed with <code>roost deploy</code>. Set them separately via <code>wrangler</code> or the dashboard.</p>
      <CodeBlock title="terminal">{`# Set a secret interactively (prompted for value)
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put WORKOS_API_KEY
wrangler secret put SESSION_SECRET`}</CodeBlock>
      <p>To set multiple secrets non-interactively (e.g., in CI), pipe the value:</p>
      <CodeBlock title="terminal">{`echo "$STRIPE_SECRET_KEY" | wrangler secret put STRIPE_SECRET_KEY`}</CodeBlock>
      <p>Via dashboard: Workers &rarr; your worker &rarr; Settings &rarr; Variables &amp; Secrets. See <a href="/docs/guides/environment">the environment guide</a> for local vs production secret management patterns.</p>

      <h2>How to configure custom domains</h2>
      <p>Add a custom domain to your worker in the Cloudflare dashboard or via <code>wrangler.jsonc</code>.</p>
      <CodeBlock title="wrangler.jsonc">{`{
  "name": "my-app",
  "routes": [
    { "pattern": "myapp.com/*", "zone_name": "myapp.com" },
    { "pattern": "www.myapp.com/*", "zone_name": "myapp.com" }
  ]
}`}</CodeBlock>
      <p>Your domain must be managed by Cloudflare DNS. After adding the route, deploy once for the mapping to take effect:</p>
      <CodeBlock title="terminal">{`roost deploy`}</CodeBlock>

      <h2>How to set up preview deployments</h2>
      <p>Use Cloudflare Workers' branching support to deploy non-production versions under a different name.</p>
      <CodeBlock title="terminal">{`# Deploy a named preview (uses a separate worker name)
wrangler deploy --name my-app-preview`}</CodeBlock>
      <p>For pull request previews in CI, derive the worker name from the branch or PR number:</p>
      <CodeBlock title=".github/workflows/preview.yml">{`name: Preview Deploy
on: [pull_request]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bun run build
      - run: wrangler deploy --name "my-app-pr-\${{ github.event.number }}"
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CF_API_TOKEN }}`}</CodeBlock>
      <p>Related: <a href="/docs/guides/environment">Environment guide</a> for managing per-environment configuration, <a href="/docs/guides/migrations">Migrations guide</a> for running migrations post-deploy.</p>

    </DocLayout>
  );
}
