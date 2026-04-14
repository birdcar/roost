# Audit: @roostjs/auth

## Status: FIXED

## Exports verified
- `AuthServiceProvider`
- `WorkOSClientToken`, `RoostWorkOSClient`, `FakeWorkOSClient`
- `WorkOSClient`, `WorkOSUser`, `AuthorizationUrlOptions`, `AuthenticateResponse`, `OrganizationMembership` (types)
- `SessionManager`, `parseCookie`, `buildSetCookie`, `parseJwtExpiry`
- `KVSessionStore`
- `SessionData` (type)
- `RoostUser` (type)
- `OrgResolver`
- `ResolvedOrg`, `OrgResolutionStrategy` (types)
- `AuthMiddleware`, `GuestMiddleware`, `RoleMiddleware`, `CsrfMiddleware`
- `handleCallback`, `handleLogout`, `createLoginHandler`

## Discrepancies found and fixed
| File | Issue | Fix applied |
|------|-------|-------------|
| `apps/site/content/docs/reference/auth.mdx` | Docs only mention `handleCallback` under routes section. `handleLogout` and `createLoginHandler` are also exported but undocumented. | Added documentation for `handleLogout` and `createLoginHandler` to the Built-in Auth Routes section |
| `apps/site/content/docs/reference/auth.mdx` | `parseCookie`, `buildSetCookie`, `parseJwtExpiry` are exported utility functions not mentioned anywhere in the docs | Added as a Utilities section in the reference |
| `apps/site/content/docs/reference/auth.mdx` | `WorkOSClientToken`, `RoostWorkOSClient`, `FakeWorkOSClient` are exported but not documented | Added a WorkOS Clients section |
| `apps/site/content/docs/reference/auth.mdx` | `KVSessionStore` is exported but not documented | Added to Session Storage section |

## Files modified
- `apps/site/content/docs/reference/auth.mdx`

## Items requiring human review
- None
