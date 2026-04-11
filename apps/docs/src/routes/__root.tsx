import type { ReactNode } from 'react';
import { createRootRoute, Outlet, HeadContent, Scripts, Link } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Roost Documentation' },
    ],
  }),
  component: DocsLayout,
});

function DocsLayout({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; }
          .layout { display: flex; min-height: 100vh; }
          .sidebar { width: 260px; border-right: 1px solid #e5e7eb; padding: 1.5rem; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
          .sidebar h2 { font-size: 1.25rem; margin-bottom: 1rem; }
          .sidebar nav a { display: block; padding: 0.35rem 0; color: #4b5563; text-decoration: none; font-size: 0.9rem; }
          .sidebar nav a:hover { color: #000; }
          .sidebar section { margin-bottom: 1.5rem; }
          .sidebar section h3 { font-size: 0.75rem; text-transform: uppercase; color: #9ca3af; margin-bottom: 0.5rem; letter-spacing: 0.05em; }
          .main { flex: 1; padding: 2rem 3rem; max-width: 800px; }
          .main h1 { font-size: 2rem; margin-bottom: 1rem; }
          .main h2 { font-size: 1.5rem; margin: 2rem 0 0.75rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
          .main p { line-height: 1.7; margin-bottom: 1rem; color: #374151; }
          .main code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 3px; font-size: 0.85em; }
          .main pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 1rem 0; }
          .main pre code { background: none; padding: 0; color: inherit; }
        `}</style>
      </head>
      <body>
        <div className="layout">
          <aside className="sidebar">
            <h2><Link to="/">Roost</Link></h2>
            <nav>
              <section>
                <h3>Getting Started</h3>
                <Link to="/">Introduction</Link>
                <Link to="/getting-started">Quick Start</Link>
              </section>
              <section>
                <h3>Core</h3>
                <Link to="/packages/core">@roost/core</Link>
                <Link to="/packages/cloudflare">@roost/cloudflare</Link>
                <Link to="/packages/start">@roost/start</Link>
              </section>
              <section>
                <h3>Features</h3>
                <Link to="/packages/auth">@roost/auth</Link>
                <Link to="/packages/orm">@roost/orm</Link>
                <Link to="/packages/ai">@roost/ai</Link>
                <Link to="/packages/mcp">@roost/mcp</Link>
                <Link to="/packages/billing">@roost/billing</Link>
                <Link to="/packages/queue">@roost/queue</Link>
              </section>
              <section>
                <h3>Tooling</h3>
                <Link to="/packages/cli">@roost/cli</Link>
                <Link to="/packages/testing">@roost/testing</Link>
                <Link to="/packages/schema">@roost/schema</Link>
              </section>
            </nav>
          </aside>
          <main className="main">
            {children ?? <Outlet />}
          </main>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
