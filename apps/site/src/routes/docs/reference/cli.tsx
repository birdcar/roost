import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/cli')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/cli" subtitle="The roost command-line tool for project scaffolding, code generation, database operations, and deployment.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add -g @roost/cli`}</CodeBlock>

      <h2>Project Commands</h2>

      <h4><code>roost new &lt;name&gt; [flags]</code></h4>
      <p>Scaffold a new Roost project in a directory named <code>&lt;name&gt;</code>.</p>

      <h3>Flags for roost new</h3>

      <h4><code>--with-ai</code></h4>
      <p>Include <code>@roost/ai</code> and generate example agent and tool stubs.</p>

      <h4><code>--with-billing</code></h4>
      <p>Include <code>@roost/billing</code> and generate a Stripe webhook handler stub.</p>

      <h4><code>--with-queue</code></h4>
      <p>Include <code>@roost/queue</code> and generate example job and consumer stubs.</p>

      <h4><code>--force</code></h4>
      <p>Overwrite the target directory if it already exists.</p>

      <h3>Generated Project Structure</h3>
      <CodeBlock>{`<name>/
├── src/
│   ├── routes/          # TanStack Start routes
│   ├── models/          # Database models
│   ├── controllers/     # Request handlers
│   ├── agents/          # AI agents (--with-ai)
│   ├── tools/           # AI tools (--with-ai)
│   ├── jobs/            # Background jobs (--with-queue)
│   ├── mcp/             # MCP servers
│   ├── middleware/      # Custom middleware
│   └── app.ts           # Application entry point
├── database/
│   ├── migrations/      # Drizzle migration files
│   ├── seeders/         # Database seeders
│   └── schema.ts        # Drizzle schema definition
├── config/
│   ├── app.ts
│   ├── auth.ts
│   └── database.ts
├── tests/
├── .dev.vars
├── wrangler.jsonc
├── drizzle.config.ts
├── tsconfig.json
└── package.json`}</CodeBlock>

      <h2>Generator Commands</h2>

      <h4><code>roost make:model &lt;Name&gt;</code></h4>
      <p>
        Generate a model class at <code>src/models/&lt;Name&gt;.ts</code> and a corresponding
        migration file in <code>database/migrations/</code>.
      </p>

      <h4><code>roost make:controller &lt;Name&gt;</code></h4>
      <p>Generate a controller class at <code>src/controllers/&lt;Name&gt;.ts</code>.</p>

      <h4><code>roost make:agent &lt;Name&gt;</code></h4>
      <p>Generate an agent class at <code>src/agents/&lt;Name&gt;.ts</code>.</p>

      <h4><code>roost make:tool &lt;Name&gt;</code></h4>
      <p>Generate a tool class at <code>src/tools/&lt;Name&gt;.ts</code>.</p>

      <h4><code>roost make:mcp-server &lt;Name&gt;</code></h4>
      <p>Generate an MCP server class at <code>src/mcp/&lt;Name&gt;.ts</code>.</p>

      <h4><code>roost make:job &lt;Name&gt;</code></h4>
      <p>Generate a job class at <code>src/jobs/&lt;Name&gt;.ts</code>.</p>

      <h4><code>roost make:middleware &lt;Name&gt;</code></h4>
      <p>Generate a middleware class at <code>src/middleware/&lt;Name&gt;.ts</code>.</p>

      <h4><code>roost make:migration &lt;name&gt;</code></h4>
      <p>Generate a blank migration file in <code>database/migrations/</code>.</p>

      <h2>Database Commands</h2>

      <h4><code>roost migrate</code></h4>
      <p>Run all pending migration files against the configured D1 database.</p>

      <h4><code>roost migrate:rollback</code></h4>
      <p>Rollback the most recently applied migration batch.</p>

      <h4><code>roost migrate:reset</code></h4>
      <p>Rollback all migrations and re-run them from scratch.</p>

      <h4><code>roost migrate:generate</code></h4>
      <p>
        Generate new migration files based on changes to <code>database/schema.ts</code>
        using Drizzle Kit's diff tooling.
      </p>

      <h4><code>roost db:seed</code></h4>
      <p>Run all seeder classes in <code>database/seeders/</code>.</p>

      <h2>Development Commands</h2>

      <h4><code>roost dev [--port &lt;n&gt;]</code></h4>
      <p>Start the development server with hot module reload. Default port is <code>8787</code>.</p>

      <h4><code>roost build</code></h4>
      <p>Compile the project for production deployment.</p>

      <h4><code>roost deploy</code></h4>
      <p>Build the project and deploy to Cloudflare Workers via Wrangler.</p>

    </DocLayout>
  );
}
