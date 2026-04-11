import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div>
      <Hero />
      <Features />
      <CodeComparison />
      <CallToAction />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section style={{ textAlign: 'center', padding: '6rem 2rem 4rem', background: 'linear-gradient(135deg, #0a0a0a, #1a1a2e)', color: '#fff' }}>
      <h1 style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: 1.1, maxWidth: '700px', margin: '0 auto 1.5rem' }}>
        The Laravel of<br />Cloudflare Workers
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#a0aec0', maxWidth: '600px', margin: '0 auto 2rem' }}>
        Convention-over-configuration TypeScript framework. Enterprise auth, AI agents,
        Drizzle ORM, Stripe billing — all running on the edge.
      </p>
      <pre style={{ display: 'inline-block', background: '#2d2d3f', padding: '0.75rem 1.5rem', borderRadius: '8px', fontSize: '1rem', color: '#e2e8f0' }}>
        <code>bun add -g @roost/cli && roost new my-app</code>
      </pre>
    </section>
  );
}

function Features() {
  const features = [
    { title: 'WorkOS Auth', desc: 'SSO, organizations, RBAC, session management — enterprise-ready from day one.' },
    { title: 'Drizzle ORM', desc: 'Laravel-like model classes wrapping Drizzle with D1. Migrations, relationships, factories.' },
    { title: 'AI Agents', desc: 'Class-based agents with typed tools, structured output, streaming. Cloudflare AI native.' },
    { title: 'MCP Server', desc: 'Expose your app to AI clients with class-based tools, resources, and prompts.' },
    { title: 'Stripe Billing', desc: 'Abstract billing interface with Stripe adapter. Subscriptions, metering, webhooks.' },
    { title: 'CF Queues', desc: 'Laravel Horizon-inspired job classes with dispatch, retry, chain, and batch.' },
    { title: 'TanStack Start', desc: 'Type-safe file routing, SSR, server functions. React on the edge.' },
    { title: 'CLI', desc: 'roost new, make:model, make:agent — scaffold and generate in seconds.' },
  ];

  return (
    <section style={{ padding: '4rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', fontSize: '2rem', marginBottom: '2rem' }}>Everything You Need</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
        {features.map((f) => (
          <div key={f.title} style={{ padding: '1.25rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{f.title}</h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CodeComparison() {
  return (
    <section style={{ padding: '4rem 2rem', background: '#f9fafb' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2rem', marginBottom: '2rem' }}>Before vs After</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '0.875rem', color: '#ef4444', marginBottom: '0.5rem' }}>Raw Cloudflare Workers</h3>
            <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '1rem', borderRadius: '8px', fontSize: '0.8rem', overflow: 'auto' }}>
              <code>{`export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/todos') {
      const db = env.DB;
      const cookie = request.headers
        .get('cookie')?.split(';')
        .find(c => c.includes('session='));
      // parse session, verify token,
      // refresh if expired, check org...
      const rows = await db
        .prepare('SELECT * FROM todos WHERE user_id = ?')
        .bind(userId)
        .all();
      return Response.json(rows.results);
    }
    return new Response('Not found', { status: 404 });
  }
}`}</code>
            </pre>
          </div>
          <div>
            <h3 style={{ fontSize: '0.875rem', color: '#22c55e', marginBottom: '0.5rem' }}>With Roost</h3>
            <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '1rem', borderRadius: '8px', fontSize: '0.8rem', overflow: 'auto' }}>
              <code>{`// app/routes/todos.tsx
import { createFileRoute } from '@tanstack/react-router';

const loadTodos = roostFn(
  roostMiddleware,
  async (roost) => {
    const user = await requireUser();
    return Todo
      .where('user_id', user.id)
      .all();
  }
);

export const Route = createFileRoute('/todos')({
  loader: () => loadTodos(),
  component: TodosPage,
});`}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Start Building</h2>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '1.1rem' }}>
        From zero to deployed in minutes. Enterprise-ready from the first line.
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <a href="/docs" style={{ padding: '0.75rem 1.5rem', background: '#000', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
          Read the Docs
        </a>
        <a href="https://github.com/birdcar/roost" style={{ padding: '0.75rem 1.5rem', border: '1px solid #000', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
          View on GitHub
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ padding: '2rem', borderTop: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
      <p>
        Roost is open source. Built on Cloudflare Workers, TanStack Start, Drizzle, and WorkOS.
      </p>
    </footer>
  );
}
