import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/getting-started')({
  component: GettingStartedPage,
});

function GettingStartedPage() {
  return (
    <div>
      <h1>Getting Started</h1>

      <h2>Prerequisites</h2>
      <ul>
        <li><a href="https://bun.sh">Bun</a> (v1.0+)</li>
        <li>A <a href="https://workos.com">WorkOS</a> account (API key + client ID)</li>
        <li>A <a href="https://dash.cloudflare.com">Cloudflare</a> account (for deployment)</li>
      </ul>

      <h2>Create a New Project</h2>
      <pre><code>{`# Install the CLI globally
bun add -g @roost/cli

# Scaffold a new project
roost new my-app

# With optional packages
roost new my-app --with-ai --with-billing --with-queue`}</code></pre>

      <h2>Configure WorkOS</h2>
      <p>
        Edit <code>.dev.vars</code> in your project root and add your WorkOS credentials:
      </p>
      <pre><code>{`WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...`}</code></pre>

      <h2>Start Development</h2>
      <pre><code>{`cd my-app
bun install
bun run dev`}</code></pre>
      <p>
        Your app is now running at <code>http://localhost:3000</code> with
        server-side rendering, file-based routing, and WorkOS authentication.
      </p>

      <h2>Generate Code</h2>
      <pre><code>{`# Create a model with migration
roost make:model Post

# Create an AI agent
roost make:agent Assistant

# Create a background job
roost make:job SendWelcomeEmail

# Run migrations
roost migrate`}</code></pre>

      <h2>Deploy</h2>
      <pre><code>{`roost deploy`}</code></pre>
      <p>
        This builds your app with Vite and deploys to Cloudflare Workers via Wrangler.
      </p>
    </div>
  );
}
