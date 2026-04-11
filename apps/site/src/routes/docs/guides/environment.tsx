import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/environment')({ component: Page });

function Page() {
  return (
    <DocLayout title="Environment" subtitle="Task-oriented instructions for managing environment variables and secrets across local and production environments.">

      <h2>How to manage .dev.vars for local development</h2>
      <p>Wrangler reads <code>.dev.vars</code> during local development and injects values into <code>env</code>. This file should never be committed.</p>
      <CodeBlock title=".dev.vars">{`# Auth
WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...
SESSION_SECRET=local-dev-secret-change-me

# Billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Other services
SENDGRID_KEY=SG....`}</CodeBlock>
      <CodeBlock title=".gitignore">{`.dev.vars`}</CodeBlock>
      <p>Commit a <code>.env.example</code> with all required keys but empty values so other developers know what to fill in:</p>
      <CodeBlock title=".env.example">{`WORKOS_API_KEY=
WORKOS_CLIENT_ID=
SESSION_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=`}</CodeBlock>

      <h2>How to set secrets in Cloudflare dashboard for production</h2>
      <p>Use <code>wrangler secret put</code> or the dashboard to set production values. These are encrypted at rest and injected into <code>env</code> at runtime.</p>
      <CodeBlock title="terminal">{`# Interactive (prompts for value, nothing echoed to terminal)
wrangler secret put WORKOS_API_KEY
wrangler secret put SESSION_SECRET
wrangler secret put STRIPE_SECRET_KEY

# List current secrets (names only, not values)
wrangler secret list`}</CodeBlock>
      <p>Via dashboard: Cloudflare dashboard &rarr; Workers &amp; Pages &rarr; your worker &rarr; Settings &rarr; Variables &amp; Secrets.</p>

      <h2>How to access env vars via the config manager</h2>
      <p>In a Worker, all env vars arrive as properties on the <code>env</code> object passed to the <code>fetch</code> handler. Access them directly or merge them into <code>ConfigManager</code>.</p>
      <CodeBlock title="src/app.ts">{`import { Application, ConfigManager } from '@roost/core';

export default {
  async fetch(request: Request, env: Env) {
    const app = Application.create(env, {
      auth: {
        apiKey: env.WORKOS_API_KEY,
        clientId: env.WORKOS_CLIENT_ID,
        redirectUrl: env.AUTH_REDIRECT_URL ?? 'http://localhost:8787/auth/callback',
      },
      stripe: {
        secretKey: env.STRIPE_SECRET_KEY,
      },
    });

    // Or use mergeEnv to overlay env vars onto existing config
    const config = new ConfigManager({ app: { debug: false } });
    config.mergeEnv({
      APP_DEBUG: env.APP_DEBUG,
    });

    return app.handle(request);
  },
};`}</CodeBlock>

      <h2>How to use different configs per environment</h2>
      <p>Detect the environment from an env var and conditionally set config values. Avoid branching on <code>NODE_ENV</code> — Workers don't have a standard equivalent. Use an explicit <code>APP_ENV</code> variable.</p>
      <CodeBlock title=".dev.vars">{`APP_ENV=development`}</CodeBlock>
      <CodeBlock title="src/config/app.ts">{`export function buildAppConfig(env: Env) {
  const isDev = env.APP_ENV === 'development';

  return {
    app: {
      debug: isDev,
      logLevel: isDev ? 'debug' : 'error',
    },
    auth: {
      redirectUrl: isDev
        ? 'http://localhost:8787/auth/callback'
        : 'https://myapp.com/auth/callback',
    },
    cors: {
      allowedOrigins: isDev
        ? ['http://localhost:3000']
        : ['https://myapp.com'],
    },
  };
}`}</CodeBlock>
      <CodeBlock title="src/app.ts">{`import { buildAppConfig } from './config/app';

export default {
  async fetch(request: Request, env: Env) {
    const app = Application.create(env, buildAppConfig(env));
    return app.handle(request);
  },
};`}</CodeBlock>
      <p>Related: <a href="/docs/guides/deployment">Deployment guide</a> for setting production secrets, <a href="/docs/packages/core">@roost/core reference</a> for the ConfigManager API.</p>

    </DocLayout>
  );
}
