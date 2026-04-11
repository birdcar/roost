import type { ReactNode } from 'react';
import { createRootRoute, Outlet, HeadContent, Scripts, Link } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Roost — The Laravel of Cloudflare Workers' },
      { name: 'description', content: 'A TypeScript framework for Cloudflare Workers with Laravel-like conventions, WorkOS auth, Drizzle ORM, AI agents, and more.' },
    ],
  }),
  component: RootLayout,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 800 }}>404</h1>
      <p style={{ color: '#6b7280', marginTop: '0.5rem', fontSize: '1.1rem' }}>Page not found.</p>
      <Link to="/" style={{ display: 'inline-block', marginTop: '1.5rem', padding: '0.5rem 1rem', background: '#000', color: '#fff', borderRadius: '6px', textDecoration: 'none' }}>
        Back to Home
      </Link>
    </div>
  );
}

function RootLayout({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; }
          a { color: inherit; }
          .nav { display: flex; align-items: center; gap: 2rem; padding: 1rem 2rem; border-bottom: 1px solid #e5e7eb; }
          .nav-brand { font-weight: 700; font-size: 1.1rem; text-decoration: none; }
          .nav a { text-decoration: none; font-size: 0.9rem; color: #4b5563; }
          .nav a:hover { color: #000; }
        `}</style>
      </head>
      <body>
        <nav className="nav">
          <Link to="/" className="nav-brand">Roost</Link>
          <Link to="/docs">Docs</Link>
          <Link to="/docs/getting-started">Getting Started</Link>
          <a href="https://github.com/birdcar/roost">GitHub</a>
        </nav>
        {children ?? <Outlet />}
        <Scripts />
      </body>
    </html>
  );
}
