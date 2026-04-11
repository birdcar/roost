import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/cli')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/cli Guides" subtitle="Task-oriented instructions for scaffolding, code generation, migrations, and deployment.">

      <h2>How to scaffold a new project</h2>
      <p>Use <code>roost new</code> with flags to include the packages your application needs. Generated projects are deployment-ready on Cloudflare Workers.</p>
      <CodeBlock title="terminal">{`# Minimal project
roost new my-app

# With AI agents
roost new my-app --with-ai

# Full-featured app
roost new my-app --with-ai --with-billing --with-queue

# Overwrite existing directory
roost new my-app --force`}</CodeBlock>
      <p>After scaffolding, copy <code>.env.example</code> to <code>.dev.vars</code> and fill in your credentials before running <code>roost dev</code>.</p>
      <CodeBlock title="terminal">{`cd my-app
cp .env.example .dev.vars
# Edit .dev.vars with your credentials
roost dev`}</CodeBlock>

      <h2>How to generate models, controllers, and other code</h2>
      <p>Use the <code>make:</code> generators to create boilerplate files. Each generator creates a file in the conventional location with TODO comments for customization.</p>
      <CodeBlock title="terminal">{`# Model + migration
roost make:model Post

# Controller
roost make:controller PostController

# Background job
roost make:job SendWelcomeEmail

# AI agent
roost make:agent SupportAgent

# AI tool
roost make:tool OrderStatusTool

# MCP server
roost make:mcp-server AppServer

# Middleware
roost make:middleware RateLimit

# Standalone migration (without model)
roost make:migration add_published_at_to_posts`}</CodeBlock>
      <p>Generator names are used as class names directly. Use PascalCase for classes (<code>PostController</code>), snake_case for migrations (<code>add_status_to_posts</code>).</p>

      <h2>How to run and rollback migrations</h2>
      <p>Run all pending migrations with <code>roost migrate</code>. Roll back the last batch with <code>roost migrate:rollback</code>.</p>
      <CodeBlock title="terminal">{`# Run pending migrations
roost migrate

# Roll back the most recent batch
roost migrate:rollback

# Roll back all migrations and re-run from scratch (destructive)
roost migrate:reset

# Generate migration files from Drizzle schema changes
roost migrate:generate`}</CodeBlock>
      <p>Migrations run in filename order. The CLI tracks which migrations have run in a <code>migrations</code> table in your D1 database. See <a href="/docs/guides/migrations">the migrations guide</a> for defining columns and indexes.</p>

      <h2>How to deploy your application</h2>
      <p>Use <code>roost deploy</code> to build and push to Cloudflare Workers in one step.</p>
      <CodeBlock title="terminal">{`# Build and deploy
roost deploy`}</CodeBlock>
      <p>Before deploying, make sure your production secrets are set in the Cloudflare dashboard — <code>roost deploy</code> does not push <code>.dev.vars</code> values.</p>
      <CodeBlock title="terminal">{`# Set a secret for production (interactive)
wrangler secret put STRIPE_SECRET_KEY

# Or use the dashboard:
# Workers > my-app > Settings > Variables`}</CodeBlock>
      <p>After first deployment, run migrations against the production D1 database:</p>
      <CodeBlock title="terminal">{`# Run migrations against production D1
wrangler d1 execute my-app-db --remote --file=database/migrations/0001_create_users.sql`}</CodeBlock>
      <p>See <a href="/docs/guides/deployment">the deployment guide</a> for custom domains, preview deployments, and CI/CD setup.</p>

    </DocLayout>
  );
}
