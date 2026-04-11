import { createFileRoute, Link } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/guides/')({ component: Page });

function Page() {
  return (
    <DocLayout title="How-to Guides" subtitle="Task-oriented instructions for accomplishing specific goals with Roost.">
      <p>
        Guides assume you already know the basics. Each one addresses a specific goal — how to
        configure something, how to integrate a feature, how to solve a particular problem.
      </p>

      <h2>Cross-cutting</h2>
      <p>Guides that span multiple packages or apply to the full application lifecycle.</p>
      <ul>
        <li><Link to="/docs/guides/migrations">Migrations — create, run, rollback, and define columns</Link></li>
        <li><Link to="/docs/guides/deployment">Deployment — deploy to Cloudflare Workers, custom domains, previews</Link></li>
        <li><Link to="/docs/guides/environment">Environment — .dev.vars, production secrets, per-environment config</Link></li>
        <li><Link to="/docs/guides/error-handling">Error Handling — routes, jobs, logging, custom error responses</Link></li>
      </ul>

      <h2>Core</h2>
      <p>Guides for the foundational packages every Roost app uses.</p>
      <ul>
        <li><Link to="/docs/guides/core">@roost/core — service providers, DI bindings, middleware, config</Link></li>
        <li><Link to="/docs/guides/cloudflare">@roost/cloudflare — D1, R2, KV, Queues, Workers AI, Vectorize</Link></li>
        <li><Link to="/docs/guides/start">@roost/start — routes, server functions, SSR</Link></li>
      </ul>

      <h2>Features</h2>
      <p>Guides for feature packages you add as your application grows.</p>
      <ul>
        <li><Link to="/docs/guides/auth">@roost/auth — authentication, roles, multi-tenancy, sessions, CSRF</Link></li>
        <li><Link to="/docs/guides/orm">@roost/orm — models, migrations, queries, relationships, factories</Link></li>
        <li><Link to="/docs/guides/ai">@roost/ai — agents, tools, streaming, conversation memory</Link></li>
        <li><Link to="/docs/guides/mcp">@roost/mcp — MCP servers, tools, resources, prompts</Link></li>
        <li><Link to="/docs/guides/billing">@roost/billing — Stripe, subscriptions, webhooks, metered billing</Link></li>
        <li><Link to="/docs/guides/queue">@roost/queue — jobs, dispatch, chains, batches, retries</Link></li>
      </ul>

      <h2>Tooling</h2>
      <p>Guides for the development and testing tools.</p>
      <ul>
        <li><Link to="/docs/guides/cli">@roost/cli — scaffold, generate, migrate, deploy</Link></li>
        <li><Link to="/docs/guides/testing">@roost/testing — HTTP tests, assertions, fakes, database isolation</Link></li>
        <li><Link to="/docs/guides/schema">@roost/schema — tool input schemas, optional fields, descriptions</Link></li>
      </ul>
    </DocLayout>
  );
}
