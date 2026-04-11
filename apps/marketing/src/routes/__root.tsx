import type { ReactNode } from 'react';
import { createRootRoute, Outlet, HeadContent, Scripts } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Roost — The Laravel of Cloudflare Workers' },
      { name: 'description', content: 'A TypeScript framework for Cloudflare Workers with Laravel-like conventions, WorkOS auth, Drizzle ORM, AI agents, and more.' },
    ],
  }),
  component: MarketingLayout,
});

function MarketingLayout({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; }
        `}</style>
      </head>
      <body>
        {children ?? <Outlet />}
        <Scripts />
      </body>
    </html>
  );
}
