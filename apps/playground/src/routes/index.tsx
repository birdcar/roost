import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Roost Playground</h1>
      <p>The Laravel of Cloudflare Workers.</p>
      <p>This is a development harness for the Roost framework.</p>
      <ul>
        <li>TanStack Start for routing and SSR</li>
        <li>@roost/core for service container, config, middleware</li>
        <li>@roost/cloudflare for typed CF bindings</li>
      </ul>
    </div>
  );
}
