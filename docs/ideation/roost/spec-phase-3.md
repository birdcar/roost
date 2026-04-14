# Implementation Spec: Roost Framework - Phase 3

**Contract**: ./contract.md
**PRD**: ./prd-phase-3.md
**Estimated Effort**: XL

## Technical Approach

Phase 3 wraps WorkOS's full auth suite behind a clean framework abstraction. The approach avoids reimplementing auth logic — WorkOS handles token issuance, SSO, RBAC, and organizations. Roost's job is to: (1) bridge WorkOS into the service container, (2) manage the session lifecycle in KV, (3) expose guard middleware that reads the session, and (4) make the authenticated user available anywhere a server function or loader runs.

The session is a simple KV record keyed by a random session ID stored in an HttpOnly cookie. The session record holds the WorkOS access token, refresh token, and user metadata. On each request, the `SessionManager` reads the session from KV, validates it, and refreshes the WorkOS token if expired. The session ID cookie never leaves the server boundary — `currentUser()` is server-only.

Multi-tenancy resolves the current organization from the request before the loader runs. Resolution order: subdomain → path prefix → custom header. The resolved org slug is attached to the Roost context so loaders scope queries without extra work.

WorkOS Widgets are thin React wrapper components. They call a framework-generated token endpoint (`/auth/widgets/token`) that exchanges the session for a short-lived Widget token via the WorkOS SDK.

CSRF protection is a standalone middleware that validates a double-submit cookie token on all state-mutating requests (POST, PUT, PATCH, DELETE). It generates a token on GET requests and stores it in a signed cookie.

## Feedback Strategy

**Inner-loop command**: `bun test --filter packages/auth`

**Playground**: `apps/playground/` from Phase 2 gains auth routes and protected pages. The playground uses the WorkOS staging environment so real OAuth flows can be tested without production credentials.

**Why this approach**: Session management, OAuth callbacks, and KV interactions are complex enough to require integration testing against real HTTP. However, the `SessionManager`, `AuthGuard`, and `OrgResolver` are pure logic classes that bun:test can cover in < 5 seconds. The WorkOS SDK is wrapped behind an interface, so tests inject a fake.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/auth/package.json` | @roostjs/auth package manifest |
| `packages/auth/tsconfig.json` | Extends base TS config |
| `packages/auth/src/index.ts` | Public API barrel export |
| `packages/auth/src/provider.ts` | AuthServiceProvider — registers all auth services |
| `packages/auth/src/workos-client.ts` | WorkOS SDK wrapper and interface |
| `packages/auth/src/session/manager.ts` | SessionManager — KV-backed session lifecycle |
| `packages/auth/src/session/store.ts` | KVSessionStore — raw KV read/write for sessions |
| `packages/auth/src/session/types.ts` | Session and SessionData type definitions |
| `packages/auth/src/user.ts` | RoostUser type, currentUser() helper |
| `packages/auth/src/org.ts` | OrgResolver, currentOrg() helper |
| `packages/auth/src/middleware/auth.ts` | `auth` guard middleware |
| `packages/auth/src/middleware/guest.ts` | `guest` guard middleware |
| `packages/auth/src/middleware/role.ts` | `role:name` guard middleware |
| `packages/auth/src/middleware/org.ts` | `org:slug` guard middleware |
| `packages/auth/src/middleware/permission.ts` | `permission:name` guard middleware |
| `packages/auth/src/middleware/csrf.ts` | CSRF double-submit cookie middleware |
| `packages/auth/src/routes/login.ts` | /auth/login route handler |
| `packages/auth/src/routes/callback.ts` | /auth/callback route handler |
| `packages/auth/src/routes/logout.ts` | /auth/logout route handler |
| `packages/auth/src/routes/widgets-token.ts` | /auth/widgets/token endpoint |
| `packages/auth/src/routes/webhook.ts` | /webhooks/workos directory sync handler |
| `packages/auth/src/widgets/index.ts` | React component exports |
| `packages/auth/src/widgets/UserProfile.tsx` | WorkOS UserProfile widget wrapper |
| `packages/auth/src/widgets/OrganizationSwitcher.tsx` | WorkOS OrgSwitcher widget wrapper |
| `packages/auth/src/before-load.ts` | TanStack Router beforeLoad guard factories |
| `packages/auth/__tests__/session-manager.test.ts` | SessionManager lifecycle tests |
| `packages/auth/__tests__/session-store.test.ts` | KV session store tests |
| `packages/auth/__tests__/auth-guard.test.ts` | auth/guest middleware tests |
| `packages/auth/__tests__/role-guard.test.ts` | role/permission middleware tests |
| `packages/auth/__tests__/org-resolver.test.ts` | OrgResolver tests |
| `packages/auth/__tests__/csrf.test.ts` | CSRF middleware tests |
| `packages/auth/__tests__/workos-client.test.ts` | WorkOS client fake tests |
| `apps/playground/app/routes/auth/login.tsx` | Login redirect page |
| `apps/playground/app/routes/auth/callback.tsx` | OAuth callback page |
| `apps/playground/app/routes/auth/logout.tsx` | Logout page |
| `apps/playground/app/routes/_authenticated.tsx` | Pathless layout applying auth guard |
| `apps/playground/app/routes/_authenticated/dashboard.tsx` | Example protected page |

### Modified Files

| File Path | Change |
|---|---|
| `apps/playground/src/nitro-middleware.ts` | Register `AuthServiceProvider` |
| `packages/start/src/context.ts` | Add optional `user` and `org` fields to `RoostServerContext` |
| `packages/start/src/types.ts` | Export augmented context type |

## Implementation Details

### 1. WorkOS Client Interface (`packages/auth/src/workos-client.ts`)

**Overview**: A narrow interface over the WorkOS Node SDK. Wrapping the SDK behind an interface makes every consumer testable with a fake — no real HTTP in unit tests.

Pattern to follow: `packages/cloudflare/src/bindings/kv.ts` — thin wrapper, consistent API, injectable in tests.

```typescript
// packages/auth/src/workos-client.ts
import { WorkOS } from '@workos-inc/node';

/**
 * The narrow interface Roost uses from the WorkOS SDK.
 * Only methods actually used by the framework are declared here.
 * This keeps the fake minimal and tests focused.
 */
export interface WorkOSClient {
  /** Generates the WorkOS AuthKit authorization URL to redirect users to. */
  getAuthorizationUrl(options: AuthorizationUrlOptions): string;

  /** Exchanges an OAuth code for an access token and user profile. */
  authenticateWithCode(options: AuthenticateWithCodeOptions): Promise<AuthenticateResponse>;

  /** Refreshes an expired access token using a refresh token. */
  refreshSession(options: RefreshSessionOptions): Promise<RefreshSessionResponse>;

  /** Revokes the given session on WorkOS (used on logout). */
  revokeSession(sessionId: string): Promise<void>;

  /** Returns user profile from a valid access token. */
  getUser(userId: string): Promise<WorkOSUser>;

  /** Lists organization memberships for a user. */
  listOrganizationMemberships(userId: string): Promise<OrganizationMembership[]>;

  /** Generates a short-lived token for WorkOS Widgets. */
  getWidgetToken(options: WidgetTokenOptions): Promise<string>;
}

export interface AuthorizationUrlOptions {
  clientId: string;
  redirectUri: string;
  state?: string;
  provider?: string;
  organizationId?: string;
}

export interface AuthenticateWithCodeOptions {
  clientId: string;
  code: string;
}

export interface AuthenticateResponse {
  accessToken: string;
  refreshToken: string;
  user: WorkOSUser;
  organizationId?: string;
  sessionId: string;
}

export interface RefreshSessionOptions {
  clientId: string;
  refreshToken: string;
}

export interface RefreshSessionResponse {
  accessToken: string;
  refreshToken: string;
}

export interface WorkOSUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
}

export interface OrganizationMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: { slug: string };
}

export interface WidgetTokenOptions {
  userId: string;
  organizationId?: string;
}

/**
 * Production WorkOS client backed by the @workos-inc/node SDK.
 * Constructed by AuthServiceProvider from WORKOS_API_KEY env var.
 */
export class RoostWorkOSClient implements WorkOSClient {
  private sdk: WorkOS;

  constructor(apiKey: string) {
    this.sdk = new WorkOS(apiKey);
  }

  getAuthorizationUrl(options: AuthorizationUrlOptions): string {
    return this.sdk.userManagement.getAuthorizationUrl(options);
  }

  async authenticateWithCode(options: AuthenticateWithCodeOptions): Promise<AuthenticateResponse> {
    const result = await this.sdk.userManagement.authenticateWithCode(options);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      organizationId: result.organizationId ?? undefined,
      sessionId: result.session?.id ?? result.user.id,
    };
  }

  async refreshSession(options: RefreshSessionOptions): Promise<RefreshSessionResponse> {
    const result = await this.sdk.userManagement.authenticateWithRefreshToken(options);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sdk.userManagement.revokeSession({ sessionId });
  }

  async getUser(userId: string): Promise<WorkOSUser> {
    return this.sdk.userManagement.getUser(userId);
  }

  async listOrganizationMemberships(userId: string): Promise<OrganizationMembership[]> {
    const result = await this.sdk.userManagement.listOrganizationMemberships({ userId });
    return result.data;
  }

  async getWidgetToken(options: WidgetTokenOptions): Promise<string> {
    const result = await this.sdk.widgets.getToken({ user: { id: options.userId } });
    return result.token;
  }
}

/**
 * In-memory fake for testing. Inject this instead of RoostWorkOSClient in tests.
 *
 * @example
 * ```typescript
 * const fakeWorkOS = new FakeWorkOSClient({ user: mockUser });
 * container.singleton(WorkOSClientToken, () => fakeWorkOS);
 * ```
 */
export class FakeWorkOSClient implements WorkOSClient {
  private user: WorkOSUser;
  public revokedSessions: string[] = [];
  public lastAuthCode: string | null = null;

  constructor(options: { user: WorkOSUser }) {
    this.user = options.user;
  }

  getAuthorizationUrl(_options: AuthorizationUrlOptions): string {
    return 'https://fake.workos.com/authorize';
  }

  async authenticateWithCode(options: AuthenticateWithCodeOptions): Promise<AuthenticateResponse> {
    this.lastAuthCode = options.code;
    return {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      user: this.user,
      sessionId: 'fake-session-id',
    };
  }

  async refreshSession(_options: RefreshSessionOptions): Promise<RefreshSessionResponse> {
    return { accessToken: 'refreshed-access-token', refreshToken: 'new-refresh-token' };
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.revokedSessions.push(sessionId);
  }

  async getUser(_userId: string): Promise<WorkOSUser> {
    return this.user;
  }

  async listOrganizationMemberships(_userId: string): Promise<OrganizationMembership[]> {
    return [];
  }

  async getWidgetToken(_options: WidgetTokenOptions): Promise<string> {
    return 'fake-widget-token';
  }
}
```

**Key decisions**:
- Narrow interface — only methods Roost actually needs. The WorkOS SDK has many more APIs; keeping the interface small makes the fake cheap to maintain.
- `FakeWorkOSClient` is exported alongside the real client so every test that needs auth can import it directly without a separate test package.
- `revokedSessions` and `lastAuthCode` arrays on the fake allow tests to assert side effects (`expect(fake.revokedSessions).toContain(sessionId)`).

**Implementation steps**:
1. Define `WorkOSClient` interface with all required method signatures
2. Implement `RoostWorkOSClient` wrapping the SDK
3. Implement `FakeWorkOSClient` with assertion arrays
4. Write tests for the fake: authenticate, revoke, refresh all record state correctly
5. Export both from `packages/auth/src/index.ts` — the fake is a first-class testing export

**Feedback loop**:
- **Playground**: `packages/auth/__tests__/workos-client.test.ts`
- **Check command**: `bun test --filter workos-client`

---

### 2. Session Types and KV Store (`packages/auth/src/session/`)

**Overview**: The session system has two layers. `KVSessionStore` is the raw persistence layer — read/write session records from KV using a random session ID as the key. `SessionManager` is the lifecycle layer — create, read, refresh, and destroy sessions.

Pattern to follow: `packages/cloudflare/src/bindings/kv.ts` for the KV interaction pattern.

```typescript
// packages/auth/src/session/types.ts

/** The data stored in KV for each active session. */
export interface SessionData {
  /** WorkOS user ID — used to hydrate the RoostUser on each request. */
  userId: string;
  /** WorkOS access token — passed to SDK calls on behalf of the user. */
  accessToken: string;
  /** WorkOS refresh token — used to renew an expired access token. */
  refreshToken: string;
  /** WorkOS session ID — used to revoke the session on logout. */
  workosSessionId: string;
  /** Unix timestamp (seconds) when the access token expires. */
  accessTokenExpiresAt: number;
  /** The organization ID active when the session was created (nullable — no org context). */
  organizationId: string | null;
  /** Arbitrary key-value pairs the app can store on the session. */
  data: Record<string, unknown>;
}

/** The typed session object available to application code via session helpers. */
export interface Session {
  /** Returns a typed value from session.data, or undefined if missing. */
  get<T>(key: string): T | undefined;
  /** Stores a value in session.data. Persisted on next flush(). */
  set(key: string, value: unknown): void;
  /** Removes a value from session.data. */
  forget(key: string): void;
  /** True if the session has been modified and needs flushing to KV. */
  readonly isDirty: boolean;
}

// packages/auth/src/session/store.ts

import type { KVStore } from '@roostjs/cloudflare';
import type { SessionData } from './types.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_KEY_PREFIX = 'session:';

/**
 * Low-level KV persistence for session records.
 * Each session is stored as a JSON blob under `session:{sessionId}`.
 *
 * The SessionManager uses this class — application code never calls it directly.
 */
export class KVSessionStore {
  constructor(private kv: KVStore) {}

  /**
   * Reads a session record from KV by session ID.
   * Returns null if the session does not exist or has expired.
   */
  async get(sessionId: string): Promise<SessionData | null> {
    return this.kv.get<SessionData>(SESSION_KEY_PREFIX + sessionId);
  }

  /**
   * Writes a session record to KV with a sliding TTL.
   * Calling put on each request extends the expiry.
   */
  async put(sessionId: string, data: SessionData): Promise<void> {
    await this.kv.putJson(SESSION_KEY_PREFIX + sessionId, data, {
      expirationTtl: SESSION_TTL_SECONDS,
    });
  }

  /**
   * Deletes a session record from KV immediately.
   * Called on logout — does not wait for TTL to expire.
   */
  async delete(sessionId: string): Promise<void> {
    await this.kv.delete(SESSION_KEY_PREFIX + sessionId);
  }
}
```

**Key decisions**:
- `session:` key prefix namespaces session keys within the KV namespace, preventing collisions with other framework-managed KV keys (e.g., cache entries).
- Sliding TTL: calling `put` on each authenticated request resets the 7-day timer. Inactive sessions expire automatically without a cleanup job.
- `SessionData` and `Session` are separate types. `SessionData` is the raw KV record. `Session` is the typed accessor object that application code touches.

---

### 3. Session Manager (`packages/auth/src/session/manager.ts`)

**Overview**: The `SessionManager` is the single point of truth for session state in a request. It reads the session ID from the request cookie, loads the `SessionData` from KV, refreshes the WorkOS token if needed, and provides `currentUser()` resolution.

```typescript
// packages/auth/src/session/manager.ts
import type { H3Event } from 'h3';
import { getCookie, setCookie, deleteCookie } from 'h3';
import { randomUUID } from 'crypto';
import type { WorkOSClient } from '../workos-client.js';
import type { KVSessionStore } from './store.js';
import type { SessionData } from './types.js';
import type { RoostUser } from '../user.js';

const SESSION_COOKIE_NAME = 'roost_session';
const TOKEN_REFRESH_BUFFER_SECONDS = 60; // refresh if < 60s left

export class SessionManager {
  constructor(
    private store: KVSessionStore,
    private workos: WorkOSClient,
    private clientId: string
  ) {}

  /**
   * Loads the session for the current request.
   * Reads the session ID from the HttpOnly cookie, fetches from KV, and
   * refreshes the WorkOS access token if it is about to expire.
   *
   * Returns null if no valid session exists.
   */
  async loadSession(event: H3Event): Promise<SessionData | null> {
    const sessionId = getCookie(event, SESSION_COOKIE_NAME);
    if (!sessionId) return null;

    const sessionData = await this.store.get(sessionId);
    if (!sessionData) return null;

    // Refresh token proactively if it expires within the buffer window
    const now = Math.floor(Date.now() / 1000);
    if (sessionData.accessTokenExpiresAt - now < TOKEN_REFRESH_BUFFER_SECONDS) {
      return this.refreshSession(event, sessionId, sessionData);
    }

    return sessionData;
  }

  /**
   * Creates a new session after successful WorkOS authentication.
   * Writes the session to KV and sets the session ID cookie on the response.
   *
   * @param event - The H3Event to set the cookie on
   * @param authResponse - The token + user data from WorkOS authenticate
   */
  async createSession(
    event: H3Event,
    authResponse: {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
      userId: string;
      organizationId: string | null;
    }
  ): Promise<string> {
    const sessionId = randomUUID();

    const sessionData: SessionData = {
      userId: authResponse.userId,
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken,
      workosSessionId: authResponse.sessionId,
      // Parse expiry from the JWT — access tokens are JWTs with an `exp` claim
      accessTokenExpiresAt: parseJwtExpiry(authResponse.accessToken),
      organizationId: authResponse.organizationId,
      data: {},
    };

    await this.store.put(sessionId, sessionData);

    setCookie(event, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days, matches KV TTL
      path: '/',
    });

    return sessionId;
  }

  /**
   * Destroys the session: removes from KV, revokes on WorkOS, clears the cookie.
   */
  async destroySession(event: H3Event): Promise<void> {
    const sessionId = getCookie(event, SESSION_COOKIE_NAME);
    if (!sessionId) return;

    const sessionData = await this.store.get(sessionId);
    if (sessionData) {
      await Promise.all([
        this.store.delete(sessionId),
        this.workos.revokeSession(sessionData.workosSessionId),
      ]);
    }

    deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });
  }

  /**
   * Resolves the authenticated user from a loaded session.
   * Returns null if no session is active.
   *
   * Prefer currentUser() helper in application code — this is the internal method.
   */
  async resolveUser(event: H3Event): Promise<RoostUser | null> {
    const sessionData = await this.loadSession(event);
    if (!sessionData) return null;

    const workosUser = await this.workos.getUser(sessionData.userId);
    const memberships = await this.workos.listOrganizationMemberships(sessionData.userId);

    return {
      id: workosUser.id,
      email: workosUser.email,
      firstName: workosUser.firstName,
      lastName: workosUser.lastName,
      emailVerified: workosUser.emailVerified,
      organizationId: sessionData.organizationId,
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        role: m.role.slug,
      })),
    };
  }

  private async refreshSession(
    event: H3Event,
    sessionId: string,
    sessionData: SessionData
  ): Promise<SessionData> {
    const refreshed = await this.workos.refreshSession({
      clientId: this.clientId,
      refreshToken: sessionData.refreshToken,
    });

    const updated: SessionData = {
      ...sessionData,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: parseJwtExpiry(refreshed.accessToken),
    };

    await this.store.put(sessionId, updated);
    // Re-set cookie to slide the TTL
    setCookie(event, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return updated;
  }
}

/** Extracts the `exp` claim from a JWT without verifying the signature. */
function parseJwtExpiry(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid JWT: missing payload segment');

  const decoded = JSON.parse(atob(payload)) as { exp?: number };
  if (typeof decoded.exp !== 'number') {
    throw new Error('Invalid JWT: missing exp claim');
  }
  return decoded.exp;
}
```

**Key decisions**:
- `randomUUID()` from the Web Crypto API (available in Workers) generates the session ID. UUIDs are not guessable, making session fixation attacks impractical.
- Token refresh is proactive with a 60-second buffer. This avoids serving a request with a token that expires mid-flight.
- `resolveUser` fetches the user from WorkOS on each request rather than storing the user profile in the session. This ensures the user's roles and permissions are always fresh (important for RBAC). The WorkOS SDK call is fast and can be cached at the response level if needed.
- `destroySession` runs `store.delete` and `workos.revokeSession` in parallel — both must succeed for a complete logout.

**Implementation steps**:
1. Implement `KVSessionStore` with get/put/delete
2. Implement `SessionManager` constructor taking `KVSessionStore`, `WorkOSClient`, `clientId`
3. Implement `loadSession`, `createSession`, `destroySession`, `resolveUser`
4. Test with `FakeWorkOSClient` and a mock KV store
5. Test: load with no cookie → null, load with missing KV → null, load with expired token → refreshes, createSession sets cookie, destroySession clears KV and cookie

**Feedback loop**:
- **Playground**: `packages/auth/__tests__/session-manager.test.ts`
- **Check command**: `bun test --filter session-manager`

---

### 4. RoostUser and `currentUser()` Helper (`packages/auth/src/user.ts`)

**Overview**: The typed user object and the `currentUser()` function available in server functions and loaders.

```typescript
// packages/auth/src/user.ts
import { getRequestEvent } from '@tanstack/start/server';
import type { H3Event } from 'h3';
import { getRoostContext } from '@roostjs/start';
import { SessionManager } from './session/manager.js';

/** The authenticated user available in server functions and loaders. */
export interface RoostUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  /** The currently active organization ID, if any. */
  organizationId: string | null;
  /** All organization memberships for this user. */
  memberships: Array<{
    organizationId: string;
    role: string;
  }>;
}

/**
 * Returns the authenticated user for the current request.
 * Must be called within a server function or loader (SSR context only).
 * Returns null if the user is not authenticated.
 *
 * @example
 * ```typescript
 * const createPost = withRoost(async ({ container }) => {
 *   const user = await currentUser();
 *   if (!user) throw redirect({ to: '/auth/login' });
 *   // ...
 * });
 * ```
 */
export async function currentUser(): Promise<RoostUser | null> {
  const event = getRequestEvent()?.nativeEvent as H3Event | undefined;
  if (!event) {
    throw new Error(
      'currentUser() must be called within a server function or loader. ' +
      'It is not available on the client.'
    );
  }

  const { container } = getRoostContext(event);
  const sessionManager = container.resolve(SessionManager);
  return sessionManager.resolveUser(event);
}

/**
 * Returns the authenticated user or throws a redirect to /auth/login.
 * Use in loaders where the user is required.
 *
 * @example
 * ```typescript
 * export const Route = createFileRoute('/dashboard')({
 *   loader: async () => {
 *     const user = await requireUser();
 *     return { user };
 *   },
 * });
 * ```
 */
export async function requireUser(): Promise<RoostUser> {
  const user = await currentUser();
  if (!user) {
    const { redirect } = await import('@tanstack/react-router');
    throw redirect({ to: '/auth/login' });
  }
  return user;
}
```

**Key decisions**:
- `currentUser()` and `requireUser()` are plain async functions, not hooks. They work in server functions, loaders, and `beforeLoad` — anywhere on the server.
- `requireUser()` throws the redirect rather than returning it. This is TanStack Router's expected pattern for loader redirects — the framework catches the thrown redirect and responds accordingly.
- The `SessionManager` is resolved from the container, so tests can swap it with a fake without touching `currentUser`.

---

### 5. Auth Route Handlers (`packages/auth/src/routes/`)

**Overview**: The three OAuth routes that WorkOS requires. These are registered as TanStack Start server functions or Nitro API routes. They follow the standard AuthKit redirect flow.

```typescript
// packages/auth/src/routes/login.ts
import type { H3Event } from 'h3';
import { sendRedirect } from 'h3';
import { getRoostContext } from '@roostjs/start';
import { RoostWorkOSClientToken } from '../provider.js';
import type { WorkOSClient } from '../workos-client.js';

/**
 * Redirects the user to WorkOS AuthKit to begin the login flow.
 *
 * Registered as a Nitro route at GET /auth/login by AuthServiceProvider.
 *
 * Query params:
 *   - returnTo: URL to redirect to after successful login (stored in state)
 *   - organizationId: WorkOS org ID for SSO (optional)
 */
export async function handleLogin(event: H3Event): Promise<void> {
  const { container, app } = getRoostContext(event);
  const workos = container.resolve<WorkOSClient>(RoostWorkOSClientToken);

  const clientId = app.config.get<string>('auth.workos.clientId');
  const redirectUri = app.config.get<string>('auth.workos.callbackUrl');

  const url = workos.getAuthorizationUrl({ clientId, redirectUri });
  await sendRedirect(event, url, 302);
}

// packages/auth/src/routes/callback.ts
import type { H3Event } from 'h3';
import { getQuery, sendRedirect } from 'h3';
import { getRoostContext } from '@roostjs/start';
import { SessionManager } from '../session/manager.js';
import { RoostWorkOSClientToken } from '../provider.js';
import type { WorkOSClient } from '../workos-client.js';

/**
 * Handles the OAuth callback from WorkOS AuthKit.
 * Exchanges the code for tokens, creates a Roost session, redirects to app.
 *
 * Registered as a Nitro route at GET /auth/callback by AuthServiceProvider.
 */
export async function handleCallback(event: H3Event): Promise<void> {
  const { container, app } = getRoostContext(event);
  const workos = container.resolve<WorkOSClient>(RoostWorkOSClientToken);
  const sessionManager = container.resolve(SessionManager);

  const query = getQuery(event);
  const code = typeof query.code === 'string' ? query.code : null;

  if (!code) {
    await sendRedirect(event, '/auth/login?error=missing_code', 302);
    return;
  }

  const clientId = app.config.get<string>('auth.workos.clientId');
  const authResult = await workos.authenticateWithCode({ clientId, code });

  await sessionManager.createSession(event, {
    accessToken: authResult.accessToken,
    refreshToken: authResult.refreshToken,
    sessionId: authResult.sessionId,
    userId: authResult.user.id,
    organizationId: authResult.organizationId ?? null,
  });

  const returnTo = app.config.get<string>('auth.redirectAfterLogin', '/dashboard');
  await sendRedirect(event, returnTo, 302);
}

// packages/auth/src/routes/logout.ts
import type { H3Event } from 'h3';
import { sendRedirect } from 'h3';
import { getRoostContext } from '@roostjs/start';
import { SessionManager } from '../session/manager.js';

/**
 * Destroys the session and redirects to the login page.
 *
 * Registered as a Nitro route at POST /auth/logout by AuthServiceProvider.
 * POST is required — GET logout is vulnerable to CSRF.
 */
export async function handleLogout(event: H3Event): Promise<void> {
  const { container, app } = getRoostContext(event);
  const sessionManager = container.resolve(SessionManager);

  await sessionManager.destroySession(event);

  const returnTo = app.config.get<string>('auth.redirectAfterLogout', '/auth/login');
  await sendRedirect(event, returnTo, 302);
}
```

**Key decisions**:
- The callback handler normalizes missing `code` by redirecting back to login with an error param rather than throwing a 400. This gives a recoverable user experience.
- Logout uses POST — not GET. GET logout is a CSRF risk. The CSRF middleware from this phase validates the POST.
- Route paths are registered by `AuthServiceProvider` rather than hardcoded in the files — the paths are configurable via `auth.routes.login`, `auth.routes.callback`, `auth.routes.logout`.

---

### 6. Middleware Guards (`packages/auth/src/middleware/`)

**Overview**: Five composable middleware classes that enforce authentication and authorization constraints. Each follows the Phase 1 `Middleware` interface pattern.

Pattern to follow: `packages/core/src/middleware.ts` — the `Middleware` interface and `Pipeline` from Phase 1.

```typescript
// packages/auth/src/middleware/auth.ts
import type { Middleware } from '@roostjs/core';
import type { H3Event } from 'h3';
import { sendRedirect } from 'h3';
import { SessionManager } from '../session/manager.js';

/**
 * Requires an authenticated user. Redirects to /auth/login if not authenticated.
 *
 * Usage in a TanStack Router beforeLoad (preferred):
 *   beforeLoad: requireAuth()
 *
 * Usage in Roost middleware pipeline (API routes):
 *   pipeline.use(AuthMiddleware)
 */
export class AuthMiddleware implements Middleware {
  constructor(private sessionManager: SessionManager) {}

  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>,
    ...args: string[]
  ): Promise<Response> {
    // Reconstruct H3Event from request — the Roost pipeline wraps Workers Request
    // The event is on the request's custom properties set by the Nitro middleware
    const event = (request as Request & { _h3Event?: H3Event })._h3Event;
    if (!event) {
      return new Response('Unauthorized', { status: 401 });
    }

    const session = await this.sessionManager.loadSession(event);
    if (!session) {
      const loginUrl = args[0] ?? '/auth/login';
      return new Response(null, {
        status: 302,
        headers: { Location: loginUrl },
      });
    }

    return next(request);
  }
}

// packages/auth/src/middleware/role.ts
import type { Middleware } from '@roostjs/core';
import type { H3Event } from 'h3';
import { SessionManager } from '../session/manager.js';

/**
 * Requires the authenticated user to have a specific role.
 * Usage: pipeline.use(RoleMiddleware, 'admin')
 * Returns 403 if the user is authenticated but lacks the required role.
 */
export class RoleMiddleware implements Middleware {
  constructor(private sessionManager: SessionManager) {}

  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>,
    requiredRole: string
  ): Promise<Response> {
    const event = (request as Request & { _h3Event?: H3Event })._h3Event;
    if (!event) {
      return new Response('Unauthorized', { status: 401 });
    }

    const session = await this.sessionManager.loadSession(event);
    if (!session) {
      return new Response(null, { status: 302, headers: { Location: '/auth/login' } });
    }

    const workosUser = await this.sessionManager.resolveUser(event);
    const hasRole = workosUser?.memberships.some((m) => m.role === requiredRole) ?? false;

    if (!hasRole) {
      return new Response('Forbidden', { status: 403 });
    }

    return next(request);
  }
}

// packages/auth/src/middleware/permission.ts
// Same pattern as role middleware, but checks WorkOS FGA permissions.
// (Abbreviated here — full implementation follows the same structure)

// packages/auth/src/middleware/guest.ts
// Inverse of auth: redirects to dashboard if user IS authenticated.
// Prevents logged-in users from seeing /auth/login again.

// packages/auth/src/middleware/org.ts
// Checks the session's organizationId matches the required org slug.
```

**Key decisions**:
- Each guard is a separate class rather than a single class with branching logic. This follows single-responsibility and makes each guard independently testable.
- The `...args: string[]` pattern from Phase 1 means guards receive their configuration from the pipeline: `pipeline.use(RoleMiddleware, 'admin')`. No separate config objects.
- Guards that redirect always use the framework's standard login path as a default, but accept an override via args.

---

### 7. `beforeLoad` Guard Factories (`packages/auth/src/before-load.ts`)

**Overview**: TanStack Router's preferred auth integration point is `beforeLoad`, not middleware. These factories produce `beforeLoad` functions for use in route definitions. They are cleaner than middleware for route-level auth because TanStack Router can include the auth context in the route's typed context.

```typescript
// packages/auth/src/before-load.ts
import { redirect } from '@tanstack/react-router';
import { getRequestEvent } from '@tanstack/start/server';
import type { H3Event } from 'h3';
import { getRoostContext } from '@roostjs/start';
import { SessionManager } from './session/manager.js';
import type { RoostUser } from './user.js';

/**
 * Creates a beforeLoad function that requires authentication.
 * Adds { user: RoostUser } to the route context for child routes to read.
 *
 * @example
 * ```typescript
 * // app/routes/_authenticated.tsx
 * export const Route = createFileRoute('/_authenticated')({
 *   beforeLoad: requireAuthBeforeLoad(),
 * });
 *
 * // Child route reads it:
 * const { user } = Route.useRouteContext();
 * ```
 */
export function requireAuthBeforeLoad() {
  return async (): Promise<{ user: RoostUser }> => {
    const event = getRequestEvent()?.nativeEvent as H3Event | undefined;
    if (!event) throw new Error('requireAuthBeforeLoad: no H3Event');

    const { container } = getRoostContext(event);
    const sessionManager = container.resolve(SessionManager);
    const user = await sessionManager.resolveUser(event);

    if (!user) {
      throw redirect({ to: '/auth/login' });
    }

    return { user };
  };
}

/**
 * Creates a beforeLoad function that requires the user to have a specific role.
 * Assumes requireAuthBeforeLoad() is in a parent route's beforeLoad.
 *
 * @param role - The role slug required (e.g., 'admin', 'member')
 */
export function requireRoleBeforeLoad(role: string) {
  return async ({ context }: { context: { user?: RoostUser } }): Promise<void> => {
    const user = context.user;
    if (!user) throw redirect({ to: '/auth/login' });

    const hasRole = user.memberships.some((m) => m.role === role);
    if (!hasRole) throw redirect({ to: '/403' });
  };
}
```

**Key decisions**:
- `beforeLoad` factories return context objects `{ user }` that TypeScript propagates down the route tree. Child routes can read `user` from `Route.useRouteContext()` with full type inference — no redundant null checks.
- The root authenticated layout route (`_authenticated.tsx`) is the standard place to put `requireAuthBeforeLoad()`. All routes nested under it inherit the `user` context.
- Role and permission guards are designed to run after auth — they read `context.user` set by the parent, avoiding an extra `resolveUser` call.

---

### 8. CSRF Middleware (`packages/auth/src/middleware/csrf.ts`)

**Overview**: Double-submit cookie CSRF protection. On GET requests, a signed CSRF token is generated and set in a readable (non-HttpOnly) cookie so JavaScript can read it and include it in subsequent requests as a header. On mutating requests (POST, PUT, PATCH, DELETE), the middleware validates that the header token matches the cookie token.

```typescript
// packages/auth/src/middleware/csrf.ts
import type { Middleware } from '@roostjs/core';
import { getCookie, setCookie, getHeader } from 'h3';
import type { H3Event } from 'h3';

const CSRF_COOKIE_NAME = 'roost_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const MUTABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Double-submit cookie CSRF protection middleware.
 *
 * On every GET/HEAD request: generates a random CSRF token and sets it in a
 * readable cookie (not HttpOnly) so the client JS can read and send it as a header.
 *
 * On POST/PUT/PATCH/DELETE: validates that the x-csrf-token header matches
 * the roost_csrf cookie value. Returns 403 if validation fails.
 *
 * Server functions from TanStack Start are exempt — they use Origin header
 * validation by default, which covers the same attack vector.
 */
export class CsrfMiddleware implements Middleware {
  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    const event = (request as Request & { _h3Event?: H3Event })._h3Event;

    if (MUTABLE_METHODS.has(request.method)) {
      // TanStack Start server functions set this header — exempt them
      const isTanStackFn = request.headers.get('x-tanstack-server-fn') !== null;
      if (!isTanStackFn && event) {
        const cookieToken = getCookie(event, CSRF_COOKIE_NAME);
        const headerToken = getHeader(event, CSRF_HEADER_NAME);

        if (!cookieToken || !headerToken || cookieToken !== headerToken) {
          return new Response('CSRF validation failed', { status: 403 });
        }
      }
    } else if (event) {
      // Issue a new CSRF token on read requests
      const token = generateCsrfToken();
      setCookie(event, CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Must be readable by JS for the double-submit pattern
        secure: true,
        sameSite: 'strict',
        path: '/',
      });
    }

    return next(request);
  }
}

/** Generates a cryptographically random CSRF token. */
function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
```

**Key decisions**:
- Double-submit cookie pattern (not synchronizer token) is appropriate for Workers because there is no server-side state to store the expected token in between requests. The session could store it, but that adds a KV read to every GET.
- TanStack Start server functions are exempt. They enforce `Origin` header validation internally and use a separate mechanism for CSRF. Double-applying would break all mutations.
- `sameSite: 'strict'` on the CSRF cookie. This alone blocks most CSRF vectors, but the double-submit validation is kept as defense-in-depth.

---

### 9. Organization Resolver (`packages/auth/src/org.ts`)

**Overview**: Resolves the current organization from the request. Tries three strategies in order: subdomain, path prefix, custom header.

```typescript
// packages/auth/src/org.ts
import type { H3Event } from 'h3';
import { getHeader, getRequestHost } from 'h3';

export interface RoostOrg {
  id: string;
  slug: string;
  name: string;
}

export type OrgResolutionStrategy = 'subdomain' | 'path' | 'header';

/**
 * Resolves the current organization from the request.
 * Returns null if no organization context is present.
 *
 * Resolution order (first match wins):
 * 1. Subdomain: `acme.myapp.com` → org slug `acme`
 * 2. Path prefix: `/org/acme/dashboard` → org slug `acme`
 * 3. X-Org-Slug header: used for API clients and testing
 *
 * @param event - The H3Event for the current request
 * @param appDomain - The base domain to strip from the subdomain (e.g. 'myapp.com')
 */
export function resolveOrgSlug(event: H3Event, appDomain: string): string | null {
  // Strategy 1: subdomain
  const host = getRequestHost(event, { xForwardedHost: true });
  if (host && host.endsWith('.' + appDomain)) {
    const subdomain = host.slice(0, -(appDomain.length + 1));
    if (subdomain && subdomain !== 'www') return subdomain;
  }

  // Strategy 2: path prefix /org/:slug
  const url = new URL(event.node.req.url ?? '/', 'http://localhost');
  const pathMatch = url.pathname.match(/^\/org\/([^/]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  // Strategy 3: custom header (testing / API clients)
  const headerSlug = getHeader(event, 'x-org-slug');
  if (headerSlug) return headerSlug;

  return null;
}

/**
 * Returns the current organization context available in server functions and loaders.
 * Returns null if no organization is active.
 *
 * @example
 * ```typescript
 * const org = await currentOrg();
 * if (!org) throw redirect({ to: '/org-select' });
 * ```
 */
export async function currentOrg(): Promise<RoostOrg | null> {
  // Phase 4 (ORM) fills this in with a real DB lookup.
  // For now, returns the slug resolved from the request.
  const { getRequestEvent } = await import('@tanstack/start/server');
  const event = getRequestEvent()?.nativeEvent as H3Event | undefined;
  if (!event) return null;

  // Org context is attached to event.context by the Nitro middleware
  return (event.context as Record<string, RoostOrg | null>)['roost.org'] ?? null;
}
```

**Key decisions**:
- Three strategies, first-match-wins, no fallback to a default org. If none match, the request has no org context. Applications decide how to handle that (redirect to org picker, show a "select org" page, etc.).
- Subdomain resolution uses `X-Forwarded-Host` for environments where a proxy strips the original `Host`. This is standard for Cloudflare Workers behind a load balancer.
- Path prefix `/org/:slug` coexists with subdomain strategy. SaaS apps often start with path-based tenancy and graduate to subdomain routing.

---

### 10. WorkOS Widgets (`packages/auth/src/widgets/`)

**Overview**: Thin React wrapper components around WorkOS's JavaScript Widgets SDK. They call the framework's `/auth/widgets/token` endpoint to get a short-lived token, then pass it to the WorkOS Widget.

```typescript
// packages/auth/src/widgets/UserProfile.tsx
'use client';

import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';

interface UserProfileWidgetProps {
  /** Widget container class name for styling via CSS custom properties */
  className?: string;
}

/**
 * Renders the WorkOS UserProfile widget.
 * Fetches a widget token from the Roost-managed endpoint automatically.
 *
 * Style customization via CSS custom properties:
 *   --workos-color-primary, --workos-font-family, etc.
 *
 * @example
 * ```tsx
 * <UserProfileWidget className="my-profile-widget" />
 * ```
 */
export function UserProfileWidget({ className }: UserProfileWidgetProps) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    fetch('/auth/widgets/token')
      .then((r) => r.json() as Promise<{ token: string }>)
      .then((data) => setToken(data.token))
      .catch(console.error);
  }, []);

  if (!token) return null;

  return (
    <div className={className}>
      {/* WorkOS Widgets are rendered via their JS SDK on the client side */}
      {/* The token is passed as a data attribute for the SDK to pick up */}
      <div data-workos-widget="user-profile" data-workos-token={token} />
    </div>
  );
}
```

**Key decisions**:
- Widgets are client components (`'use client'`) — they render in the browser after hydration. WorkOS's Widget JS SDK is browser-only.
- Token fetched from `/auth/widgets/token` on mount. The endpoint is short-lived (15-minute expiry) so it must be fetched fresh on each page load, not cached.
- The `data-workos-widget` pattern is how WorkOS's SDK identifies and hydrates widget containers. Exact implementation depends on the WorkOS Widgets SDK version — match the SDK's documented mounting pattern.

---

### 11. Directory Sync Webhook (`packages/auth/src/routes/webhook.ts`)

**Overview**: A Nitro route handler that receives WorkOS Directory Sync webhook events (user provisioned, deprovisioned, group changes) and dispatches them to user-defined handlers.

```typescript
// packages/auth/src/routes/webhook.ts
import type { H3Event } from 'h3';
import { readBody, getHeader } from 'h3';
import { getRoostContext } from '@roostjs/start';

export type DirectorySyncEventType =
  | 'dsync.user.created'
  | 'dsync.user.updated'
  | 'dsync.user.deleted'
  | 'dsync.group.created'
  | 'dsync.group.updated'
  | 'dsync.group.deleted'
  | 'dsync.group.user.created'
  | 'dsync.group.user.deleted';

export interface DirectorySyncEvent {
  id: string;
  event: DirectorySyncEventType;
  data: Record<string, unknown>;
}

export type DirectorySyncHandler = (event: DirectorySyncEvent) => Promise<void>;

/**
 * Creates the WorkOS Directory Sync webhook handler.
 * Validates the WorkOS webhook signature and dispatches to registered handlers.
 *
 * Register a handler in AuthServiceProvider:
 * @example
 * ```typescript
 * authProvider.onDirectorySync('dsync.user.created', async (event) => {
 *   const { db } = container.resolve(Database);
 *   await db.users.provision(event.data);
 * });
 * ```
 *
 * @param handlers - Map of event type to handler function
 * @param webhookSecret - WorkOS webhook signing secret (from WORKOS_WEBHOOK_SECRET env var)
 */
export function createWebhookHandler(
  handlers: Map<DirectorySyncEventType, DirectorySyncHandler>,
  webhookSecret: string
) {
  return async (event: H3Event): Promise<void> => {
    const signature = getHeader(event, 'workos-signature');
    if (!signature) {
      throw new Error('Missing WorkOS webhook signature');
    }

    const body = await readBody<DirectorySyncEvent>(event);

    // WorkOS signature validation — using the WorkOS SDK's built-in verifier
    // The WorkOS Node SDK handles HMAC-SHA256 verification
    const { container } = getRoostContext(event);
    // container.resolve(WorkOSWebhookVerifier).verify(signature, body, webhookSecret);

    const handler = handlers.get(body.event);
    if (handler) {
      await handler(body);
    }
    // Unknown event types are silently ignored — forward compatibility
  };
}
```

**Key decisions**:
- Webhook signature validation is required before processing. WorkOS sends an HMAC-SHA256 signature — skip validation and a bad actor can trigger provisioning/deprovisioning.
- Unknown event types are silently ignored, not errored. WorkOS may add new event types — forward compatibility means not crashing on unknown events.
- Handlers are registered per-event-type. This makes it easy to handle some events but not others (e.g., only `dsync.user.created` and `dsync.user.deleted`).

---

### 12. `AuthServiceProvider` (`packages/auth/src/provider.ts`)

**Overview**: Ties everything together. Reads env vars, constructs all auth services, registers them in the container, and registers the auth routes with Nitro.

```typescript
// packages/auth/src/provider.ts
import { ServiceProvider } from '@roostjs/core';
import type { Application } from '@roostjs/core';
import { KVStore } from '@roostjs/cloudflare';
import { RoostWorkOSClient } from './workos-client.js';
import { KVSessionStore } from './session/store.js';
import { SessionManager } from './session/manager.js';

// Use a string token for the WorkOS client so apps can swap it in tests
export const RoostWorkOSClientToken = 'roost.auth.workosClient';

/**
 * Registers all authentication services into the Roost container.
 *
 * Required env vars:
 *   WORKOS_API_KEY — WorkOS API key
 *   WORKOS_CLIENT_ID — WorkOS OAuth client ID
 *   WORKOS_WEBHOOK_SECRET — WorkOS webhook signing secret (optional)
 *
 * Required KV binding: configured at auth.session.kvBinding (default: 'SESSION_KV')
 *
 * @example
 * ```typescript
 * // apps/my-app/src/nitro-middleware.ts
 * app.register(AuthServiceProvider);
 * ```
 */
export class AuthServiceProvider extends ServiceProvider {
  register(): void {
    const apiKey = this.app.env['WORKOS_API_KEY'] as string | undefined;
    const clientId = this.app.env['WORKOS_CLIENT_ID'] as string | undefined;

    if (!apiKey || !clientId) {
      throw new Error(
        'AuthServiceProvider: WORKOS_API_KEY and WORKOS_CLIENT_ID are required. ' +
        'Add them to your .dev.vars file and wrangler.toml secrets.'
      );
    }

    this.app.container.singleton(RoostWorkOSClientToken, () =>
      new RoostWorkOSClient(apiKey)
    );

    this.app.container.singleton(KVSessionStore, (c) => {
      const kvBindingName = this.app.config.get<string>('auth.session.kvBinding', 'SESSION_KV');
      const kv = c.resolve(KVStore);
      return new KVSessionStore(kv);
    });

    this.app.container.singleton(SessionManager, (c) => {
      const store = c.resolve(KVSessionStore);
      const workosClient = c.resolve<RoostWorkOSClient>(RoostWorkOSClientToken);
      return new SessionManager(store, workosClient, clientId);
    });
  }
}
```

**Key decisions**:
- Fail-fast on missing env vars during `register()`. Better to crash at cold start with a clear message than to receive a 500 on the first auth request.
- `RoostWorkOSClientToken` is a string constant. String tokens are swappable in tests: `container.singleton(RoostWorkOSClientToken, () => new FakeWorkOSClient(...))`.
- The provider reads `auth.session.kvBinding` from config with a default of `'SESSION_KV'`. Apps override this in `config/auth.ts` if their KV namespace has a different binding name.

---

## Data Model

### KV Session Record

```
Key:   session:{uuid}
Value: {
  userId: string,
  accessToken: string,
  refreshToken: string,
  workosSessionId: string,
  accessTokenExpiresAt: number,  // Unix timestamp (seconds)
  organizationId: string | null,
  data: Record<string, unknown>
}
TTL:   604800 seconds (7 days), sliding on each authenticated request
```

### Cookie

```
Name:     roost_session
Value:    {uuid}           (session ID only — no data in cookie)
HttpOnly: true
Secure:   true
SameSite: Lax
MaxAge:   604800 (7 days)
Path:     /
```

### CSRF Cookie

```
Name:     roost_csrf
Value:    {64-char hex string}
HttpOnly: false            (must be readable by client JS)
Secure:   true
SameSite: Strict
Path:     /
```

## API Design

### `@roostjs/auth` Public API

```typescript
// packages/auth/src/index.ts

// Service provider — register in Application
export { AuthServiceProvider, RoostWorkOSClientToken } from './provider.js';

// User access
export { currentUser, requireUser } from './user.js';
export type { RoostUser } from './user.js';

// Organization access
export { currentOrg, resolveOrgSlug } from './org.js';
export type { RoostOrg } from './org.js';

// Middleware guards (for Roost middleware pipeline / API routes)
export { AuthMiddleware } from './middleware/auth.js';
export { GuestMiddleware } from './middleware/guest.js';
export { RoleMiddleware } from './middleware/role.js';
export { OrgMiddleware } from './middleware/org.js';
export { PermissionMiddleware } from './middleware/permission.js';
export { CsrfMiddleware } from './middleware/csrf.js';

// TanStack Router beforeLoad factories (for route-level auth)
export { requireAuthBeforeLoad, requireRoleBeforeLoad } from './before-load.js';

// WorkOS client (real + fake)
export type { WorkOSClient } from './workos-client.js';
export { RoostWorkOSClient, FakeWorkOSClient } from './workos-client.js';

// Session types
export type { Session, SessionData } from './session/types.js';

// Webhook
export { createWebhookHandler } from './routes/webhook.js';
export type { DirectorySyncEvent, DirectorySyncEventType } from './routes/webhook.js';

// React components (client-only)
export { UserProfileWidget } from './widgets/UserProfile.js';
export { OrganizationSwitcherWidget } from './widgets/OrganizationSwitcher.js';
```

### Auth Config Schema (`config/auth.ts`)

```typescript
// Convention: apps define this file to configure auth behavior
export default {
  workos: {
    clientId: process.env.WORKOS_CLIENT_ID,
    callbackUrl: 'https://myapp.com/auth/callback',
  },
  session: {
    kvBinding: 'SESSION_KV',    // wrangler.toml KV namespace binding name
    ttl: 604800,                // seconds
  },
  routes: {
    login: '/auth/login',
    callback: '/auth/callback',
    logout: '/auth/logout',
    widgetsToken: '/auth/widgets/token',
    webhook: '/webhooks/workos',
  },
  redirectAfterLogin: '/dashboard',
  redirectAfterLogout: '/auth/login',
  org: {
    appDomain: 'myapp.com',     // base domain for subdomain resolution
    strategies: ['subdomain', 'path', 'header'] as const,
  },
};
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/auth/__tests__/workos-client.test.ts` | FakeWorkOSClient records calls, returns expected shapes |
| `packages/auth/__tests__/session-store.test.ts` | KV read/write/delete with mock KVStore |
| `packages/auth/__tests__/session-manager.test.ts` | loadSession (no cookie, missing KV, expired token), createSession sets cookie, destroySession clears KV + cookie |
| `packages/auth/__tests__/auth-guard.test.ts` | AuthMiddleware: unauthenticated → 302, authenticated → next, GuestMiddleware: authenticated → redirect |
| `packages/auth/__tests__/role-guard.test.ts` | RoleMiddleware: missing role → 403, correct role → next |
| `packages/auth/__tests__/org-resolver.test.ts` | Subdomain, path, header strategies; null when no strategy matches |
| `packages/auth/__tests__/csrf.test.ts` | GET sets cookie, POST with valid header → next, POST without header → 403 |

**Key test patterns**:

```typescript
// All auth tests use FakeWorkOSClient and a mock KV store
import { describe, test, expect, beforeEach } from 'bun:test';
import { FakeWorkOSClient } from '../src/workos-client.js';
import { KVSessionStore } from '../src/session/store.js';
import { SessionManager } from '../src/session/manager.js';

describe('SessionManager', () => {
  let fake: FakeWorkOSClient;
  let store: KVSessionStore;
  let manager: SessionManager;

  beforeEach(() => {
    fake = new FakeWorkOSClient({
      user: {
        id: 'user_01',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        emailVerified: true,
      },
    });
    // Use the mock KVStore from @roostjs/cloudflare test utilities
    const mockKv = createMockKVStore();
    store = new KVSessionStore(mockKv);
    manager = new SessionManager(store, fake, 'client_test_123');
  });

  test('loadSession returns null when no cookie', async () => {
    const mockEvent = createMockH3Event({ cookies: {} });
    expect(await manager.loadSession(mockEvent)).toBeNull();
  });

  test('destroySession revokes WorkOS session', async () => {
    // ... setup session, then destroy, assert fake.revokedSessions contains sessionId
  });
});
```

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| Missing `WORKOS_API_KEY` or `WORKOS_CLIENT_ID` | `AuthServiceProvider.register()` throws immediately at boot — loud failure |
| OAuth callback with missing `code` param | Redirect to `/auth/login?error=missing_code` — recoverable |
| WorkOS `authenticateWithCode` fails (expired code) | Redirect to `/auth/login?error=auth_failed` — log error server-side |
| WorkOS `refreshSession` fails (revoked refresh token) | Destroy session locally, redirect to login — effectively logs user out |
| KV session store unavailable | Propagate error — session not loadable, middleware redirects to login |
| CSRF validation fails | Return 403 immediately, do not call next |
| Webhook signature invalid | Return 400, log warning — do not process event |
| `currentUser()` called on client | Throw with "SSR only" message — caught by error boundary |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| KV session store | KV write fails on session create | KV transient error | User stuck on callback, cannot log in | Retry once, then return 500 with "login failed, try again" message |
| Token refresh | WorkOS refresh token revoked | Admin revokes session, password change | User gets logged out on next request | Expected behavior — session is invalidated, redirect to login |
| CSRF token | Cookie not set on first load | Browser blocks cookies | All mutations fail with 403 | Document: app must not disable cookies. No mitigation — cookie-based auth requires cookies |
| Subdomain org resolution | Localhost in development | `getRequestHost` returns `localhost:3000` | Org resolution fails | Config flag to disable subdomain strategy in dev; use header strategy instead |
| WorkOS Widgets | Token endpoint returns 401 | Session expired between page load and widget mount | Widget fails to load | Widget catches error, renders fallback or re-triggers auth |
| Directory sync webhook | Handler throws | Bug in app-defined handler | Event is not processed | Wrap in try/catch, log error, return 200 to WorkOS (prevents retry storms) |
| Session TTL mismatch | KV TTL and cookie MaxAge differ | Config error | Cookie outlives KV record | `KVSessionStore.put` TTL must always equal cookie MaxAge — enforced by single config value |

## Validation Commands

```bash
# Type checking
bun run --filter '@roostjs/*' tsc --noEmit

# Auth package tests only
bun test --filter packages/auth

# All unit tests
bun test

# Full integration: dev server with auth routes
cd apps/playground && bun run dev

# Build and verify Cloudflare output
cd apps/playground && bun run build

# Verify no secrets in client bundle (critical for auth)
cd apps/playground && bun run build && grep -r 'WORKOS_API_KEY' .output/
# Expected: no matches (API key must not appear in client bundle)
```
