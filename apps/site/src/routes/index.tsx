import { createFileRoute, Link } from '@tanstack/react-router';
import { CodeBlock } from '../components/code-block';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div>
      <Hero />
      <Features />
      <Comparison />
      <CallToAction />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div>
          <div className="hero-eyebrow anim-fade-up anim-d1">TypeScript Framework</div>
          <h1 className="display anim-fade-up anim-d2">
            Build for the edge,<br />
            not around it.
          </h1>
          <p className="hero-description anim-fade-up anim-d3">
            Roost brings convention-over-configuration to Cloudflare Workers.
            Enterprise auth, Drizzle ORM, AI agents, job queues, and Stripe billing
            — wired together with a framework that stays out of your way.
          </p>
          <div className="hero-actions anim-fade-up anim-d4">
            <Link to="/docs/getting-started" className="hero-cta-primary">
              Get Started
            </Link>
            <a
              href="https://github.com/birdcar/roost"
              className="hero-cta-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="hero-code anim-slide-right anim-d3">
          <div className="hero-code-header">
            <div className="hero-code-dot" />
            <div className="hero-code-dot" />
            <div className="hero-code-dot" />
          </div>
          <pre><code>{heroCode()}</code></pre>
        </div>
      </div>
    </section>
  );
}

function heroCode() {
  return [
    s('tok-comment', '# Create a new app'),
    '\n',
    s('tok-keyword', '$ '),
    'roost new my-app ',
    s('tok-string', '--with-ai --with-billing'),
    '\n\n',
    s('tok-comment', '# Generate code'),
    '\n',
    s('tok-keyword', '$ '),
    'roost make:model Post\n',
    s('tok-keyword', '$ '),
    'roost make:agent Assistant\n',
    s('tok-keyword', '$ '),
    'roost migrate\n\n',
    s('tok-comment', '# Ship it'),
    '\n',
    s('tok-keyword', '$ '),
    'roost deploy',
  ];
}

function s(cls: string, text: string) {
  return <span key={text} className={cls}>{text}</span>;
}

function Features() {
  const items = [
    {
      label: 'Auth',
      title: 'WorkOS Authentication',
      desc: 'SSO, RBAC, organizations, and session management. Enterprise-ready from the first line of code.',
      featured: true,
    },
    {
      label: 'Data',
      title: 'Drizzle ORM on D1',
      desc: 'Laravel-like model classes with query builders, relationships, hooks, and migrations.',
      featured: true,
    },
    {
      label: 'Intelligence',
      title: 'AI Agent Framework',
      desc: 'Class-based agents with typed tools, structured output, streaming, and conversation memory.',
      featured: true,
    },
    {
      label: 'Interop',
      title: 'MCP Server',
      desc: 'Expose your app to AI clients with tools, resources, and prompts over the Model Context Protocol.',
    },
    {
      label: 'Revenue',
      title: 'Stripe Billing',
      desc: 'Abstract billing interface with subscriptions, metering, webhooks, and customer portal.',
    },
    {
      label: 'Background',
      title: 'Job Queues',
      desc: 'Typed job classes on Cloudflare Queues with dispatch, retry, chaining, and batching.',
    },
    {
      label: 'Frontend',
      title: 'TanStack Start',
      desc: 'Type-safe file routing, SSR, and server functions. React 19 on the edge.',
    },
    {
      label: 'Platform',
      title: 'All of Cloudflare',
      desc: 'Typed wrappers for D1, KV, R2, Queues, Durable Objects, AI, Vectorize, and Hyperdrive.',
    },
    {
      label: 'DX',
      title: 'CLI Generators',
      desc: 'Scaffold projects and generate models, agents, jobs, middleware — all from the terminal.',
    },
  ];

  return (
    <section className="features">
      <div className="features-header">
        <h2 className="display">Everything, wired together.</h2>
        <p>
          Each package works standalone, but they're designed to compose.
          Register a provider, and the framework handles the rest.
        </p>
      </div>
      <div className="features-grid">
        {items.map((item) => (
          <div key={item.title} className={`feature-item${'featured' in item && item.featured ? ' featured' : ''}`}>
            <div className="feature-label">{item.label}</div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Comparison() {
  return (
    <section className="comparison">
      <h2 className="display">Less ceremony, more building.</h2>
      <p>
        Same Cloudflare Workers runtime. Dramatically less boilerplate.
      </p>
      <div className="comparison-grid">
        <div>
          <div className="comparison-label before">Raw Cloudflare Workers</div>
          <CodeBlock>
{`export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/todos') {
      const cookie = request.headers
        .get('cookie')?.split(';')
        .find(c => c.includes('session='));
      // parse session, verify, refresh...
      const rows = await env.DB
        .prepare('SELECT * FROM todos')
        .bind(userId).all();
      return Response.json(rows);
    }
  }
}`}
          </CodeBlock>
        </div>
        <div>
          <div className="comparison-label after">With Roost</div>
          <CodeBlock>
{`import { Model } from '@roost/orm';

class Todo extends Model {
  static tableName = 'todos';
}

// In your route loader
const todos = await Todo
  .where('user_id', user.id)
  .orderBy('created_at', 'desc')
  .all();

// Auth, sessions, CSRF — handled
// by middleware. Automatically.`}
          </CodeBlock>
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="cta-section">
      <h2 className="display">Start building.</h2>
      <p>From zero to deployed in minutes. Enterprise-ready from the first line.</p>
      <div className="cta-actions">
        <Link to="/docs/getting-started" className="hero-cta-primary">
          Read the Docs
        </Link>
        <a
          href="https://github.com/birdcar/roost"
          className="hero-cta-secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      Roost is open source. Built on Cloudflare Workers, TanStack Start, Drizzle, and WorkOS.
    </footer>
  );
}
