import { createFileRoute, Link } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/reference/')({ component: Page });

function Page() {
  return (
    <DocLayout title="Reference" subtitle="Technical descriptions of every package, class, and method in the Roost framework.">
      <p>
        Reference documentation describes what things are and what they do — API signatures,
        configuration options, type definitions. It is designed for looking things up, not reading
        start to finish.
      </p>

      <h2>Core</h2>
      <p>Foundational packages required by every Roost application.</p>
      <ul>
        <li><Link to="/docs/reference/core">@roost/core</Link> — Dependency injection, configuration, middleware pipeline, application lifecycle, and service providers.</li>
        <li><Link to="/docs/reference/cloudflare">@roost/cloudflare</Link> — Typed wrappers for D1, KV, R2, Queues, AI, Vectorize, Durable Objects, and Hyperdrive bindings.</li>
        <li><Link to="/docs/reference/start">@roost/start</Link> — TanStack Start bridge: middleware factory and server function wrappers.</li>
        <li><Link to="/docs/reference/schema">@roost/schema</Link> — Fluent JSON Schema builder used by AI tools and MCP tool definitions.</li>
      </ul>

      <h2>Features</h2>
      <p>Optional packages that add application capabilities.</p>
      <ul>
        <li><Link to="/docs/reference/auth">@roost/auth</Link> — WorkOS authentication, session management, middleware guards, CSRF protection, and multi-tenancy.</li>
        <li><Link to="/docs/reference/orm">@roost/orm</Link> — Model classes, query builder, relationships, lifecycle hooks, migrations, factories, and seeders for D1.</li>
        <li><Link to="/docs/reference/ai">@roost/ai</Link> — Class-based agents, typed tools, conversation memory, and streaming on Cloudflare Workers AI.</li>
        <li><Link to="/docs/reference/mcp">@roost/mcp</Link> — Model Context Protocol server with tools, resources, and prompts.</li>
        <li><Link to="/docs/reference/billing">@roost/billing</Link> — Abstract billing interface with a Stripe adapter for subscriptions, checkout, and webhooks.</li>
        <li><Link to="/docs/reference/queue">@roost/queue</Link> — Background job processing on Cloudflare Queues with retry strategies and lifecycle hooks.</li>
      </ul>

      <h2>Tooling</h2>
      <p>Development and testing utilities.</p>
      <ul>
        <li><Link to="/docs/reference/cli">@roost/cli</Link> — Project scaffolding, code generators, database commands, and deployment.</li>
        <li><Link to="/docs/reference/testing">@roost/testing</Link> — HTTP test client, response assertions, unified fakes, and test setup helpers.</li>
      </ul>
    </DocLayout>
  );
}
