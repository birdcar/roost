import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/auth')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/auth" subtitle="Why Roost delegates authentication to WorkOS, how sessions are stored on KV, and the organization model that makes multi-tenancy a first-class concern.">
      <h2>Why WorkOS Instead of Rolling Auth</h2>
      <p>
        Authentication is deceptively hard to implement correctly. Beyond username and password,
        production applications need email verification, password reset flows, magic links, OAuth
        providers, and — for enterprise customers — SSO, SCIM provisioning, and directory sync.
        Each of these has subtle security requirements, and getting any of them wrong has serious
        consequences. Rolling a complete auth system from scratch means owning all of that surface
        area indefinitely.
      </p>
      <p>
        WorkOS is purpose-built for the enterprise authentication problems that other providers
        underserve. It ships SSO, SCIM, Directory Sync, and AuthKit — a hosted, customizable
        authentication UI — as a unified API. For applications that need to sell to enterprise
        customers, WorkOS provides the authentication infrastructure that those customers require
        without building it in-house. Roost chose WorkOS to make enterprise auth a configuration
        choice rather than a months-long implementation project.
      </p>

      <h2>Session Storage on KV</h2>
      <p>
        Cloudflare Workers do not have filesystem access or process memory that persists across
        requests reliably. Traditional server-side session storage — writing session data to disk
        or to a process-level in-memory store — does not apply. Roost stores sessions in Cloudflare
        KV, the platform's globally replicated key-value store.
      </p>
      <p>
        KV is eventually consistent: writes propagate globally within seconds, but reads may
        briefly see stale data at distant edge locations. For session data, this trade-off is
        generally acceptable: a user who logs in from one data center and immediately makes a
        request handled by a different data center might briefly see a stale session, but this
        window is measured in seconds. For applications where this is unacceptable, the session
        store implementation is replaceable — <code>AuthServiceProvider</code> resolves the
        <code>KVSessionStore</code> through the container, and any implementation that satisfies
        the session store interface can be swapped in.
      </p>

      <h2>The Organization Model and Multi-Tenancy</h2>
      <p>
        Roost's auth layer treats multi-tenancy as a first-class concern rather than an
        application-level concern. The <code>OrgResolver</code> determines which organization
        context a request belongs to using configurable strategies: subdomain extraction
        (<code>app.company.com</code> maps to <code>company</code>), URL path prefix
        (<code>/org/company/dashboard</code>), or an explicit HTTP header. This resolution
        happens in middleware, before the route handler runs, so the organization is always
        available in the request context without route-level boilerplate.
      </p>
      <p>
        The organization model maps directly to WorkOS's organization concept. When a user
        authenticates via SSO configured for their organization, WorkOS returns the organization
        ID. Roost stores this in the session and resolves the current organization on every
        subsequent request. RBAC is built on top of this: permissions are checked in the context
        of the resolved organization, so a user with admin permissions in one organization is
        not automatically an admin in another.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/packages/auth">@roost/auth reference — middleware, session management, and RBAC API</a></li>
        <li><a href="/docs/concepts/edge-computing">Edge Computing — why KV is the right session store for Workers</a></li>
        <li><a href="https://workos.com/docs" target="_blank" rel="noopener noreferrer">WorkOS Documentation</a></li>
      </ul>
    </DocLayout>
  );
}
