import type { ReactNode } from 'react';
import {
  createRootRoute,
  Outlet,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Roost Playground' },
    ],
  }),
  component: RootDocument,
  errorComponent: RootError,
});

function RootDocument({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children ?? <Outlet />}
        <Scripts />
      </body>
    </html>
  );
}

function RootError({ error }: { error: unknown }) {
  return (
    <html lang="en">
      <head><title>Error</title></head>
      <body>
        <h1>Something went wrong</h1>
        <pre>{error instanceof Error ? error.message : String(error)}</pre>
      </body>
    </html>
  );
}
