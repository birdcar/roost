import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/auth')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/auth" subtitle="WorkOS-backed authentication with session management, middleware guards, CSRF protection, RBAC, and multi-tenancy support.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/auth`}</CodeBlock>

      <h2>Configuration</h2>
      <p>Required environment variables:</p>
      <CodeBlock title=".dev.vars">{`WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...`}</CodeBlock>
      <p>Required application config:</p>
      <CodeBlock>{`{
  auth: {
    redirectUrl: 'https://example.com/auth/callback',
  }
}`}</CodeBlock>
      <p>Register the service provider:</p>
      <CodeBlock title="src/app.ts">{`import { AuthServiceProvider } from '@roost/auth';
app.register(AuthServiceProvider);`}</CodeBlock>

      <h2>AuthServiceProvider</h2>
      <p>
        Registers <code>SessionManager</code> and <code>WorkOSClient</code> in the container.
        Also registers the <code>/auth/login</code>, <code>/auth/callback</code>, and
        <code>/auth/logout</code> routes on the application.
      </p>

      <h2>SessionManager API</h2>
      <p>
        Manages session creation, validation, and destruction using Cloudflare KV storage
        with a sliding TTL.
      </p>

      <h4><code>constructor(kv: KVNamespace, secret: string)</code></h4>
      <p>Construct with a KV namespace for session storage and a secret for signing session tokens.</p>

      <h4><code>async resolveUser(request: Request): Promise&lt;RoostUser | null&gt;</code></h4>
      <p>
        Parse and validate the session cookie from the request. Returns the associated
        <code>RoostUser</code>, or <code>null</code> if the session is missing, invalid, or expired.
      </p>

      <h4><code>async createSession(user: WorkOSUser, organizationId?: string): Promise&lt;&#123; sessionId: string; response: Response &#125;&gt;</code></h4>
      <p>
        Create a new KV session entry for the user. Returns a <code>Response</code> with the
        <code>Set-Cookie</code> header set and the generated session ID.
      </p>

      <h4><code>async destroySession(sessionId: string): Promise&lt;Response&gt;</code></h4>
      <p>
        Delete the session from KV. Returns a <code>Response</code> with the session cookie
        cleared.
      </p>

      <h2>Built-in Auth Routes</h2>
      <p>Registered automatically by <code>AuthServiceProvider</code>.</p>

      <h4><code>GET /auth/login</code></h4>
      <p>
        Redirects the user to the WorkOS-hosted login page. Accepts optional query parameters:
        <code>organization_id</code> (string) and <code>return_to</code> (URL).
      </p>

      <h4><code>GET /auth/callback</code></h4>
      <p>
        WorkOS OAuth callback endpoint. Exchanges the authorization code for a session,
        creates a KV session, and redirects to <code>return_to</code> or <code>/</code>.
      </p>

      <h4><code>GET /auth/logout</code></h4>
      <p>Destroys the current session and redirects to <code>/</code>.</p>

      <h2>Middleware</h2>

      <h4><code>AuthMiddleware</code></h4>
      <p>
        Requires the request to have a valid session. Redirects to <code>/auth/login</code>
        if no valid session is present.
      </p>

      <h4><code>GuestMiddleware</code></h4>
      <p>
        Requires the request to have no valid session. Redirects to <code>/</code> if the
        user is already authenticated.
      </p>

      <h4><code>RoleMiddleware</code></h4>
      <p>
        Requires the authenticated user to have one of the specified roles in the current
        organization. Accepts one or more role strings as middleware arguments.
        Returns <code>403 Forbidden</code> if the user's role is not in the allowed list.
      </p>
      <CodeBlock>{`app.useMiddleware(RoleMiddleware, 'admin', 'owner');`}</CodeBlock>

      <h4><code>CsrfMiddleware</code></h4>
      <p>
        Double-submit cookie CSRF protection. Validates that the <code>_csrf</code> form field
        or <code>X-CSRF-Token</code> header matches the CSRF cookie value on state-mutating
        requests (<code>POST</code>, <code>PUT</code>, <code>PATCH</code>, <code>DELETE</code>).
      </p>

      <h2>OrgResolver API</h2>
      <p>
        Extracts organization identity from an incoming request using one or more resolution
        strategies tried in order.
      </p>

      <h4><code>constructor(strategies: OrgResolutionStrategy[])</code></h4>
      <p>
        Construct with an ordered array of strategy names. Available strategies:
        <code>'subdomain'</code>, <code>'path-prefix'</code>, <code>'header'</code>.
      </p>

      <h4><code>resolve(request: Request): &#123; slug: string &#125; | null</code></h4>
      <p>
        Attempt each strategy in order. Returns <code>&#123; slug &#125;</code> on first match,
        or <code>null</code> if no strategy matches.
      </p>

      <h3>Resolution Strategies</h3>

      <h4><code>'subdomain'</code></h4>
      <p>
        Extracts the first subdomain from the request hostname. Ignores <code>www</code> and
        <code>api</code>. Example: <code>acme.example.com</code> → <code>acme</code>.
      </p>

      <h4><code>'path-prefix'</code></h4>
      <p>
        Extracts the organization slug from the second path segment.
        Example: <code>/org/acme/dashboard</code> → <code>acme</code>.
      </p>

      <h4><code>'header'</code></h4>
      <p>Reads the <code>X-Org-Slug</code> request header.</p>

      <h2>Types</h2>
      <CodeBlock>{`interface RoostUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId?: string;
  memberships: OrganizationMembership[];
}

interface OrganizationMembership {
  organizationId: string;
  organizationSlug: string;
  role: string;
}

type OrgResolutionStrategy = 'subdomain' | 'path-prefix' | 'header';`}</CodeBlock>

    </DocLayout>
  );
}
