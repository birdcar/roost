import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/getting-started')({
  component: GettingStartedPage,
});

function GettingStartedPage() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>Getting Started</h1>

      <h2 style={{ marginTop: '2rem' }}>Prerequisites</h2>
      <ul style={{ lineHeight: 2, paddingLeft: '1.5rem' }}>
        <li><a href="https://bun.sh">Bun</a> (v1.0+)</li>
        <li>A <a href="https://workos.com">WorkOS</a> account (API key + client ID)</li>
        <li>A <a href="https://dash.cloudflare.com">Cloudflare</a> account (for deployment)</li>
      </ul>

      <h2 style={{ marginTop: '2rem' }}>Create a New Project</h2>
      <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
        <code>{`bun add -g @roost/cli
roost new my-app
cd my-app && bun install && bun run dev`}</code>
      </pre>

      <h2 style={{ marginTop: '2rem' }}>Configure WorkOS</h2>
      <p style={{ lineHeight: 1.7, color: '#374151' }}>
        Edit <code>.dev.vars</code> in your project root:
      </p>
      <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
        <code>{`WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...`}</code>
      </pre>

      <h2 style={{ marginTop: '2rem' }}>Generate Code</h2>
      <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
        <code>{`roost make:model Post
roost make:agent Assistant
roost make:job SendWelcomeEmail
roost migrate`}</code>
      </pre>

      <h2 style={{ marginTop: '2rem' }}>Deploy</h2>
      <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
        <code>roost deploy</code>
      </pre>
    </div>
  );
}
