import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/')({
  component: DocsIndexPage,
});

function DocsIndexPage() {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 57px)' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '2rem 3rem', maxWidth: '800px' }}>
        <h1>Roost Documentation</h1>
        <p style={{ lineHeight: 1.7, color: '#374151', marginTop: '1rem' }}>
          Roost is a Laravel-inspired TypeScript framework for Cloudflare Workers.
          It provides convention-over-configuration, enterprise-ready authentication
          via WorkOS, a Drizzle-powered ORM, AI agent primitives, MCP server support,
          Stripe billing, and background job processing.
        </p>

        <h2 style={{ marginTop: '2rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>Quick Start</h2>
        <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
          <code>{`bun add -g @roost/cli
roost new my-app
cd my-app && bun install && bun run dev`}</code>
        </pre>

        <h2 style={{ marginTop: '2rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>Packages</h2>
        <ul style={{ lineHeight: 2, paddingLeft: '1.5rem', color: '#374151' }}>
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
      </main>
    </div>
  );
}

function Sidebar() {
  return (
    <aside style={{ width: '240px', borderRight: '1px solid #e5e7eb', padding: '1.5rem', fontSize: '0.9rem' }}>
      <nav>
        <Section title="Getting Started">
          <Link to="/docs">Introduction</Link>
          <Link to="/docs/getting-started">Quick Start</Link>
        </Section>
        <Section title="Core">
          <Link to="/docs/packages/core">@roost/core</Link>
          <Link to="/docs/packages/cloudflare">@roost/cloudflare</Link>
          <Link to="/docs/packages/start">@roost/start</Link>
        </Section>
        <Section title="Features">
          <Link to="/docs/packages/auth">@roost/auth</Link>
          <Link to="/docs/packages/orm">@roost/orm</Link>
          <Link to="/docs/packages/ai">@roost/ai</Link>
          <Link to="/docs/packages/mcp">@roost/mcp</Link>
          <Link to="/docs/packages/billing">@roost/billing</Link>
          <Link to="/docs/packages/queue">@roost/queue</Link>
        </Section>
        <Section title="Tooling">
          <Link to="/docs/packages/cli">@roost/cli</Link>
          <Link to="/docs/packages/testing">@roost/testing</Link>
          <Link to="/docs/packages/schema">@roost/schema</Link>
        </Section>
      </nav>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {children}
      </div>
    </div>
  );
}
