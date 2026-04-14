import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Roost Todo</h1>
      <p>A simple todo app built with Roost.</p>
      <ul>
        <li>WorkOS AuthKit authentication</li>
        <li>CRUD operations against D1 via @roostjs/orm</li>
        <li>Server-rendered with TanStack Start</li>
      </ul>
      <a href="/todos">Go to Todos</a>
    </div>
  );
}
