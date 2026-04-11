import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IntroPage,
});

function IntroPage() {
  return (
    <div>
      <h1>Roost Documentation</h1>
      <p>
        Roost is a Laravel-inspired TypeScript framework for Cloudflare Workers.
        It provides convention-over-configuration, enterprise-ready authentication
        via WorkOS, a Drizzle-powered ORM, AI agent primitives, MCP server support,
        Stripe billing, and background job processing — all running on the edge.
      </p>

      <h2>Why Roost?</h2>
      <p>
        Cloudflare Workers is one of the most performant platforms for web applications,
        but building on it today means wiring up Drizzle, auth, routing, and bindings
        manually for every project. Roost is the composition layer that makes this
        stack feel productive.
      </p>

      <h2>Quick Start</h2>
      <pre><code>{`bun add -g @roost/cli
roost new my-app
cd my-app
bun install
bun run dev`}</code></pre>

      <h2>Packages</h2>
      <p>Roost is a monorepo of 12 packages, each handling a specific concern:</p>
      <ul style={{ lineHeight: 2 }}>
        <li><code>@roost/core</code> — Service container, config, middleware pipeline</li>
        <li><code>@roost/cloudflare</code> — Typed wrappers for all 8 CF bindings</li>
        <li><code>@roost/start</code> — TanStack Start integration</li>
        <li><code>@roost/auth</code> — WorkOS authentication + session management</li>
        <li><code>@roost/orm</code> — Drizzle-powered model layer</li>
        <li><code>@roost/ai</code> — AI agent classes with tools + streaming</li>
        <li><code>@roost/mcp</code> — MCP server implementation</li>
        <li><code>@roost/schema</code> — Fluent JSON Schema builder</li>
        <li><code>@roost/billing</code> — Stripe billing abstraction</li>
        <li><code>@roost/queue</code> — Background job processing</li>
        <li><code>@roost/cli</code> — Project scaffolding + code generators</li>
        <li><code>@roost/testing</code> — HTTP test client + unified fakes</li>
      </ul>
    </div>
  );
}
