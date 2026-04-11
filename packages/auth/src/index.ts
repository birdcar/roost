export { AuthServiceProvider } from './provider.js';

export {
  WorkOSClientToken,
  RoostWorkOSClient,
  FakeWorkOSClient,
} from './workos-client.js';
export type {
  WorkOSClient,
  WorkOSUser,
  AuthorizationUrlOptions,
  AuthenticateResponse,
  OrganizationMembership,
} from './workos-client.js';

export { SessionManager, parseCookie, buildSetCookie, parseJwtExpiry } from './session/manager.js';
export { KVSessionStore } from './session/store.js';
export type { SessionData } from './session/types.js';

export type { RoostUser } from './user.js';

export { OrgResolver } from './org.js';
export type { ResolvedOrg, OrgResolutionStrategy } from './org.js';

export { AuthMiddleware } from './middleware/auth.js';
export { GuestMiddleware } from './middleware/guest.js';
export { RoleMiddleware } from './middleware/role.js';
export { CsrfMiddleware } from './middleware/csrf.js';

export { handleCallback } from './routes/callback.js';
export { handleLogout } from './routes/logout.js';
export { createLoginHandler } from './routes/login.js';
