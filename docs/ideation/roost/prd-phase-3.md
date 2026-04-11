# PRD: Roost Framework - Phase 3

**Contract**: ./contract.md
**Phase**: 3 of 11
**Focus**: WorkOS authentication, session management, and multi-tenancy

## Phase Overview

Phase 3 makes every Roost app enterprise-ready from birth. Instead of bolting auth on later, Roost wraps WorkOS's full authentication suite — SSO, email+password, social login, organizations, RBAC, and directory sync — behind clean framework abstractions.

This phase depends on Phase 2 (routing) because auth needs routes for login/callback pages, middleware for protecting routes, and the session must integrate with the request lifecycle. It's sequenced before ORM because many apps need auth before they need custom models.

After this phase, a developer gets: login/signup pages (via WorkOS AuthKit), session management backed by KV, middleware guards (`auth`, `guest`, `role:admin`, `org:acme`), and multi-tenant organization support. All configured via a single WorkOS client ID and API key.

## User Stories

1. As a Roost app developer, I want authentication to work out of the box so that I don't spend days wiring up login flows.
2. As a Roost app developer, I want session management handled by the framework so that I don't manually manage cookies and session storage.
3. As a Roost app developer, I want middleware guards so that I can protect routes with `auth`, `guest`, `role`, and `organization` checks.
4. As a Roost app developer, I want multi-tenant support so that users belong to organizations with role-based access control.
5. As a Roost app developer, I want WorkOS Widgets integration so that I can embed prebuilt UI for user management, organization switching, and profile editing.
6. As a Roost app developer, I want directory sync support so that enterprise customers can provision users from their identity provider.

## Functional Requirements

### WorkOS Integration (@roost/auth)

- **FR-3.1**: WorkOS Node SDK wrapped in a Roost service provider, auto-configured from environment variables (WORKOS_API_KEY, WORKOS_CLIENT_ID)
- **FR-3.2**: AuthKit redirect flow — login, callback, and logout routes auto-registered
- **FR-3.3**: User object hydrated from WorkOS session with typed properties (id, email, name, org, role, permissions)
- **FR-3.4**: `currentUser()` helper available in loaders, actions, and middleware

### Session Management

- **FR-3.5**: KV-backed session store with configurable TTL
- **FR-3.6**: Cookie-based session ID with secure defaults (HttpOnly, Secure, SameSite=Lax)
- **FR-3.7**: Session data typed and accessible via `session.get('key')` / `session.set('key', value)`
- **FR-3.8**: WorkOS session tokens stored and refreshed automatically
- **FR-3.9**: Session invalidation on logout clears both local session and WorkOS session

### Middleware Guards

- **FR-3.10**: `auth` middleware — requires authenticated user, redirects to login
- **FR-3.11**: `guest` middleware — requires no authenticated user, redirects to dashboard
- **FR-3.12**: `role:name` middleware — requires specific role, returns 403 if missing
- **FR-3.13**: `org:slug` middleware — requires membership in specific organization
- **FR-3.14**: `permission:name` middleware — requires specific permission via WorkOS FGA
- **FR-3.15**: Guards composable: `['auth', 'role:admin', 'org:acme']`

### Multi-Tenancy & Organizations

- **FR-3.16**: Organization context resolved from subdomain, path prefix, or header
- **FR-3.17**: Current organization available via `currentOrg()` helper
- **FR-3.18**: Organization-scoped data access helpers for use in loaders/actions
- **FR-3.19**: Organization switching UI via WorkOS Widgets

### WorkOS Widgets

- **FR-3.20**: React components wrapping WorkOS Widgets (UserProfile, OrganizationSwitcher, etc.)
- **FR-3.21**: Widget authentication token generation endpoint
- **FR-3.22**: Widgets styled to match app theme via CSS custom properties

### Directory Sync

- **FR-3.23**: Webhook endpoint for WorkOS Directory Sync events
- **FR-3.24**: Event handlers for user provisioned/deprovisioned, group changes
- **FR-3.25**: Pluggable sync handlers so apps define what happens on directory events

## Non-Functional Requirements

- **NFR-3.1**: Auth redirect flow completes in < 200ms (framework overhead, excluding WorkOS round-trip)
- **NFR-3.2**: Session lookup from KV < 10ms (edge latency)
- **NFR-3.3**: No auth secrets stored in client-accessible code or cookies (only session IDs)
- **NFR-3.4**: CSRF protection on all mutation routes by default

## Dependencies

### Prerequisites

- Phase 1 complete (service container, KV binding for sessions)
- Phase 2 complete (routing for login pages, middleware pipeline for guards)

### Outputs for Next Phase

- Authenticated user context available in loaders/actions
- Middleware guards for route protection
- Organization context for multi-tenant data scoping (used by Phase 4 ORM)
- Session management infrastructure (used by Phase 5 AI for conversation context)

## Acceptance Criteria

- [ ] `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` env vars configure auth automatically
- [ ] Navigating to a protected route redirects to WorkOS AuthKit login
- [ ] After login, user is redirected back with a valid session
- [ ] `currentUser()` returns typed user object in loaders and actions
- [ ] `auth` middleware blocks unauthenticated requests with redirect
- [ ] `role:admin` middleware returns 403 for non-admin users
- [ ] Session persists across requests via KV-backed cookie
- [ ] Logout clears session and redirects to login
- [ ] Organization context resolves correctly from subdomain or path
- [ ] WorkOS Widget components render and authenticate correctly
- [ ] Directory sync webhook receives and processes events
- [ ] CSRF tokens are validated on all POST/PUT/DELETE requests
