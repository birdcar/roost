# @roostjs/auth

WorkOS AuthKit integration — KV-backed sessions, middleware guards, and multi-tenant org resolution.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/auth
```

## Quick Start

```typescript
import { Application } from '@roostjs/core';
import { CloudflareServiceProvider } from '@roostjs/cloudflare';
import { AuthServiceProvider, AuthMiddleware } from '@roostjs/auth';

const app = Application.create(env, {
  auth: { session: { kvBinding: 'SESSION_KV' } },
});

app.register(CloudflareServiceProvider);
app.register(AuthServiceProvider);    // requires WORKOS_API_KEY + WORKOS_CLIENT_ID in env
app.useMiddleware(AuthMiddleware);    // redirects unauthenticated requests to /auth/login
```

Requires a KV namespace bound to `SESSION_KV` (configurable) and these env vars:

```
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
```

## Features

- `AuthServiceProvider` bootstraps the WorkOS client, `SessionManager`, `KVSessionStore`, and `OrgResolver` from env — register it and you're done
- KV-backed sessions with automatic token refresh when the access token is within 60 seconds of expiry; 7-day session lifetime
- `AuthMiddleware` — redirects unauthenticated requests to `/auth/login`
- `GuestMiddleware` — redirects authenticated users away from guest-only routes (e.g. login page) to `/dashboard`
- `RoleMiddleware` — checks WorkOS organization membership roles; redirects to login if unauthenticated, 403 if role is missing
- `CsrfMiddleware` — sets a `roost_csrf` cookie on GET requests; validates `x-csrf-token` header matches cookie on mutation methods
- `OrgResolver` — extracts org slug from subdomain, path prefix (`/org/:slug`), or `x-org-slug` header; strategies are configurable
- `handleCallback` / `handleLogout` / `createLoginHandler` — route handlers for the OAuth flow
- `FakeWorkOSClient` for testing without hitting the WorkOS API

## API

```typescript
// Middleware
AuthMiddleware          // unauthenticated → 302 /auth/login
GuestMiddleware         // authenticated → 302 /dashboard
RoleMiddleware          // pipeline.use(RoleMiddleware, 'admin')
CsrfMiddleware          // validates x-csrf-token on POST/PUT/PATCH/DELETE

// Session
sessionManager.loadSession(request)    // SessionData | null (auto-refreshes)
sessionManager.createSession(authResp) // { sessionId, cookie }
sessionManager.destroySession(request) // { cookie } | null (revokes WorkOS session)
sessionManager.resolveUser(request)    // RoostUser | null

// RoostUser shape
interface RoostUser {
  id, email, firstName, lastName, emailVerified
  organizationId: string | null
  memberships: Array<{ organizationId: string; role: string }>
}

// Org resolution
orgResolver.resolve(request)           // ResolvedOrg | null
// ResolvedOrg: { slug: string; id?: string }

// OAuth route handlers
createLoginHandler(getWorkOS, clientId, callbackUrl)
handleCallback(request, workos, sessionManager, clientId, successRedirect?)
handleLogout(request, sessionManager, redirectTo?)
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/auth](https://roost.birdcar.dev/docs/reference/auth)

## License

MIT
