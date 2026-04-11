import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/auth')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/auth</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Enterprise-ready authentication via WorkOS. SSO, organizations, RBAC, session management, and directory sync.</p>

      <h2>Setup</h2>
      <pre><code>{`// .dev.vars
WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...

// Register in your app
app.register(AuthServiceProvider);`}</code></pre>

      <h2>Session Management</h2>
      <pre><code>{`// KV-backed sessions with sliding 7-day TTL
// SessionManager handles load, create, destroy, token refresh

const user = await sessionManager.resolveUser(request);
// Returns RoostUser with id, email, memberships, organizationId`}</code></pre>

      <h2>Middleware Guards</h2>
      <pre><code>{`// AuthMiddleware — redirects to /auth/login if unauthenticated
// GuestMiddleware — redirects to /dashboard if authenticated
// RoleMiddleware — checks membership role, returns 403
// CsrfMiddleware — double-submit cookie on mutations`}</code></pre>

      <h2>Multi-Tenancy</h2>
      <pre><code>{`import { OrgResolver } from '@roost/auth';

// Resolves org from subdomain, path prefix, or X-Org-Slug header
const resolver = new OrgResolver(['subdomain', 'path-prefix', 'header']);
const org = resolver.resolve(request); // { slug: 'acme' }`}</code></pre>
    </div>
  );
}
