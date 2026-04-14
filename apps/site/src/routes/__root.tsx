import { useState, useEffect, type ReactNode } from 'react';
import { createRootRoute, Outlet, HeadContent, Scripts, Link } from '@tanstack/react-router';
import { SearchModal } from '../components/search';
import '../global.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Roost — The Laravel of Cloudflare Workers' },
      { name: 'description', content: 'Convention-over-configuration TypeScript framework for Cloudflare Workers. Enterprise auth, Drizzle ORM, AI agents, Stripe billing — all running on the edge.' },
    ],
    links: [
      { rel: 'icon', href: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="80" font-family="serif">R</text></svg>' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  component: RootLayout,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="not-found">
      <h1 className="display not-found-title">404</h1>
      <p className="not-found-text">This page doesn't exist.</p>
      <p className="not-found-suggestion">Try one of these instead:</p>
      <ul className="not-found-links">
        <li><Link to="/docs">Documentation</Link></li>
        <li><Link to="/docs/getting-started">Getting Started</Link></li>
        <li><Link to="/docs/reference/core">@roostjs/core</Link></li>
        <li><Link to="/docs/reference/orm">@roostjs/orm</Link></li>
      </ul>
      <Link to="/" className="not-found-home">Back to Home</Link>
    </div>
  );
}

function RootLayout({ children }: { children?: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <nav className="site-nav">
          <Link to="/" className="brand">Roost</Link>
          <div className="nav-links">
            <button className="nav-search-btn" onClick={() => setSearchOpen(true)} aria-label="Search docs">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <span className="nav-search-label">Search</span>
              <kbd className="nav-search-kbd">
                <span>⌘</span>K
              </kbd>
            </button>
            <Link to="/docs">Docs</Link>
            <a href="https://github.com/birdcar/roost" target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link to="/docs/getting-started" className="nav-cta">Get Started</Link>
          </div>
        </nav>
        {children ?? <Outlet />}
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        <Scripts />
      </body>
    </html>
  );
}
