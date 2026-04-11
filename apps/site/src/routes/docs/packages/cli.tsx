import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/cli')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/cli</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>The <code>roost</code> command — project scaffolding, code generators, and dev/deploy wrappers.</p>

      <h2>Project Scaffolding</h2>
      <pre><code>{`roost new my-app
roost new my-app --with-ai --with-billing --with-queue`}</code></pre>

      <h2>Code Generators</h2>
      <pre><code>{`roost make:model Post          # src/models/post.ts
roost make:controller Post     # src/controllers/post.ts
roost make:agent Assistant     # src/agents/assistant.ts
roost make:tool SearchWeb      # src/tools/search-web.ts
roost make:mcp-server Chat     # src/mcp/chat.ts
roost make:job SendEmail       # src/jobs/send-email.ts
roost make:middleware RateLimit # src/middleware/rate-limit.ts`}</code></pre>

      <h2>Dev & Deploy</h2>
      <pre><code>{`roost dev               # vite dev
roost build             # vite build
roost deploy            # vite build + wrangler deploy
roost migrate           # drizzle-kit push
roost migrate:generate  # drizzle-kit generate
roost db:seed           # bun run database/seeders/index.ts`}</code></pre>
    </div>
  );
}
