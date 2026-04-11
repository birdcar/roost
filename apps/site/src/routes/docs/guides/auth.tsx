import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/auth')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/auth Guides" subtitle="Task-oriented instructions for authentication, authorization, sessions, and multi-tenancy.">

      <h2>How to protect routes with authentication</h2>
      <p>Add <code>AuthMiddleware</code> globally to require authentication on every route, or scope it to specific routes via a pipeline.</p>
      <CodeBlock title="src/app.ts">{`import { Application } from '@roost/core';
import { AuthMiddleware } from '@roost/auth';
import { AuthServiceProvider } from '@roost/auth';

const app = Application.create(env, {
  auth: { redirectUrl: 'https://myapp.com/auth/callback' },
});

app.register(AuthServiceProvider);
app.useMiddleware(AuthMiddleware); // All routes now require authentication`}</CodeBlock>
      <p>Unauthenticated requests are redirected to <code>/auth/login</code> automatically. Pass <code>return_to</code> in the redirect to bring the user back after login:</p>
      <CodeBlock>{`// Link users to login with a return destination
<a href={'/auth/login?return_to=' + encodeURIComponent('/dashboard')}>Sign In</a>`}</CodeBlock>
      <p>In TanStack Start, enforce authentication in route <code>beforeLoad</code> hooks for page routes:</p>
      <CodeBlock title="src/routes/dashboard.tsx">{`import { createFileRoute, redirect } from '@tanstack/react-router';
import { getCurrentUser } from '../functions/auth';

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: '/auth/login' });
  },
  component: DashboardPage,
});`}</CodeBlock>

      <h2>How to check user roles and permissions</h2>
      <p>Use <code>RoleMiddleware</code> to gate access by organization role. Pass one or more allowed roles as middleware arguments.</p>
      <CodeBlock>{`import { RoleMiddleware } from '@roost/auth';

// Only 'admin' role can access
app.useMiddleware(RoleMiddleware, 'admin');

// Multiple roles allowed
app.useMiddleware(RoleMiddleware, 'admin', 'moderator');`}</CodeBlock>
      <p>For in-component checks, resolve the user from the session and inspect <code>memberships</code>:</p>
      <CodeBlock>{`const user = await sessionManager.resolveUser(request);

const isAdmin = user?.memberships.some(
  (m) => m.organizationId === orgId && m.role === 'admin'
);

if (!isAdmin) {
  return new Response('Forbidden', { status: 403 });
}`}</CodeBlock>

      <h2>How to implement multi-tenancy with organizations</h2>
      <p>Use <code>OrgResolver</code> to detect the tenant from the request. Pick a resolution strategy that fits your URL scheme.</p>
      <CodeBlock>{`import { OrgResolver } from '@roost/auth';

// Resolve from subdomain: acme.myapp.com → 'acme'
const resolver = new OrgResolver(['subdomain']);

// Or from path prefix: /org/acme/dashboard → 'acme'
const resolver = new OrgResolver(['path-prefix']);

// Or cascade: try subdomain first, then header
const resolver = new OrgResolver(['subdomain', 'header']);

const org = resolver.resolve(request);
if (!org) return new Response('Tenant not found', { status: 404 });

// org.slug is the organization identifier
const tenantData = await loadTenantData(org.slug);`}</CodeBlock>
      <p>To direct a user to a specific organization's login, pass <code>organization_id</code> to the login route:</p>
      <CodeBlock>{`<a href={'/auth/login?organization_id=' + org.id}>Sign in to {org.name}</a>`}</CodeBlock>

      <h2>How to manage sessions</h2>
      <p>Sessions are stored in KV with a sliding TTL. Use <code>SessionManager</code> to create, resolve, and destroy sessions.</p>
      <CodeBlock>{`import { SessionManager } from '@roost/auth';

const sessionManager = new SessionManager(env.SESSION_KV, env.SESSION_SECRET);

// Create a session after successful auth
const { sessionId, response } = await sessionManager.createSession(workosUser, orgId);
// response has the Set-Cookie header — return it to the client

// Resolve the current user from an incoming request
const user = await sessionManager.resolveUser(request);
// user is null if session is missing or expired

// Destroy the session on logout
const logoutResponse = await sessionManager.destroySession(sessionId);
// logoutResponse clears the cookie`}</CodeBlock>

      <h2>How to handle the OAuth callback</h2>
      <p><code>AuthServiceProvider</code> registers <code>/auth/callback</code> automatically. You only need to ensure the route is listed in your WorkOS dashboard's allowed redirect URIs.</p>
      <CodeBlock title=".dev.vars">{`WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...`}</CodeBlock>
      <CodeBlock title="src/app.ts">{`app.register(AuthServiceProvider);
// /auth/login, /auth/callback, /auth/logout are now live`}</CodeBlock>
      <p>After the callback, the user is redirected to the URL in <code>return_to</code>, or to <code>/dashboard</code> if absent. To customize the post-login destination, set <code>auth.defaultRedirect</code> in your config.</p>

      <h2>How to add CSRF protection</h2>
      <p>Add <code>CsrfMiddleware</code> globally. All POST/PUT/PATCH/DELETE requests must include the <code>_csrf</code> token.</p>
      <CodeBlock>{`import { CsrfMiddleware } from '@roost/auth';

app.useMiddleware(CsrfMiddleware);`}</CodeBlock>
      <p>Include the token in every form. Resolve the current CSRF token from the request context or set it as a cookie the client reads:</p>
      <CodeBlock>{`// In your form component, read the token from context
function MyForm({ csrfToken }: { csrfToken: string }) {
  return (
    <form method="POST" action="/submit">
      <input type="hidden" name="_csrf" value={csrfToken} />
      <button type="submit">Submit</button>
    </form>
  );
}

// For fetch/XHR, include the token in a header
await fetch('/api/resource', {
  method: 'POST',
  headers: { 'x-csrf-token': csrfToken },
  body: JSON.stringify(data),
});`}</CodeBlock>
      <p>CSRF middleware uses the double-submit cookie pattern. Requests missing a valid token receive a <code>403 Forbidden</code> response.</p>

    </DocLayout>
  );
}
