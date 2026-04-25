## ADDED Requirements

### Requirement: Configured Roost Start Helpers

`@roostjs/start` SHALL provide a configured helper factory that binds a Roost application factory once and returns route and server-function helpers.

#### Scenario: Creating configured helpers

Given an app defines `createApp`
When it calls `createRoostStart({ app: createApp })`
Then the result SHALL include `middleware`, `fn`, `loader`, and `beforeLoad` helpers.

#### Scenario: Using configured route helpers

Given an app exports `loader` from `createRoostStart`
When a route calls `loader(async ({ resolve }) => ...)`
Then the route SHALL NOT need to pass `roostMiddleware` at the route call site.

#### Scenario: Preserving existing low-level helpers

Given existing code uses `createRoostMiddleware`, `roostFn`, or `roostFnWithInput`
When this change is adopted
Then those existing APIs SHALL remain available.

### Requirement: Roost Route Loaders

`@roostjs/start` SHALL provide a `roostLoader` helper for TanStack Start route loaders that executes Roost-specific handler logic on the server with a request-scoped Roost context.

#### Scenario: Loading route data with a Roost service

Given a route uses `roostLoader`
When the loader resolves `PostService`
Then `PostService` SHALL be resolved from the request-scoped Roost container
And the loader SHALL return data compatible with TanStack Router loader data.

#### Scenario: Client navigation invokes a Roost loader

Given a route uses `roostLoader`
When TanStack Start invokes the loader during client-side navigation
Then the Roost handler SHALL execute on the server
And Roost server-only objects SHALL NOT be bundled into or executed in the browser.

#### Scenario: Loader receives route params

Given a route has params
When `roostLoader` executes
Then the handler SHALL receive the route params in its context
And the handler SHALL be able to use those params when resolving route data.

### Requirement: Roost Route Guards

`@roostjs/start` SHALL provide a `roostBeforeLoad` helper for TanStack Router `beforeLoad` hooks that executes Roost-specific guard logic on the server with a request-scoped Roost context.

#### Scenario: Guarding a route with a Roost service

Given a route uses `roostBeforeLoad`
When the handler resolves `AuthService`
Then `AuthService` SHALL be resolved from the request-scoped Roost container.

#### Scenario: Returning public route context

Given a `roostBeforeLoad` handler returns serializable context
When TanStack Router processes the route
Then the returned context SHALL be available to descendant route context according to TanStack Router semantics.

#### Scenario: Client navigation invokes a Roost beforeLoad

Given a route uses `roostBeforeLoad`
When TanStack Start invokes `beforeLoad` during client-side navigation
Then the Roost handler SHALL execute on the server
And raw Roost server objects SHALL NOT be exposed to the browser.

### Requirement: Unified Server Function Helper

`@roostjs/start` SHALL provide a configured `fn` helper that supports server functions with and without validated input.

#### Scenario: Creating a no-input server function

Given an app has configured Roost Start helpers
When it calls `fn(handler)`
Then the handler SHALL execute on the server with request-scoped Roost helper context.

#### Scenario: Creating a validated-input server function

Given an app has configured Roost Start helpers
When it calls `fn({ input: validator }, handler)`
Then the input validator SHALL run before the handler
And the handler SHALL receive the validated input.

#### Scenario: Preserving compatibility helpers

Given existing code uses `roostFnWithInput`
When this change is adopted
Then `roostFnWithInput` SHALL continue to work.

### Requirement: Roost Handler Ergonomics

Roost route helpers SHALL pass a concise handler context that includes `resolve`, `roost`, and `app`.

#### Scenario: Resolving a service through the resolve shortcut

Given a `roostLoader` or `roostBeforeLoad` handler receives `resolve`
When the handler calls `resolve(PostService)`
Then the helper SHALL resolve the service from the request-scoped Roost container.

#### Scenario: Accessing the full Roost context

Given a handler needs lower-level access
When the handler reads `roost`
Then the handler SHALL receive the current `RoostServerContext`.

#### Scenario: Accessing the application

Given a handler needs the booted Roost application
When the handler reads `app`
Then the handler SHALL receive the current Roost `Application`.

### Requirement: Server-Only Boundary

Roost route helpers SHALL preserve the boundary between isomorphic TanStack route APIs and server-only Roost application logic.

#### Scenario: Passing serializable route args

Given TanStack provides route args to a loader or `beforeLoad`
When those args cross the server function boundary
Then only serializable values SHALL be passed to the Roost handler.

#### Scenario: Avoiding raw server object exposure

Given a Roost handler executes
When the result is returned to TanStack Router
Then the result SHALL NOT contain raw `Application`, `Container`, `RoostServerContext`, DB client, service instance, `Request`, or `Response` objects unless the user explicitly returns such a value and serialization fails normally.

### Requirement: TanStack Control Flow Preservation

Roost route helpers SHALL preserve TanStack Router control-flow behavior for redirects, not-found responses, and route errors.

#### Scenario: Handler throws redirect

Given a `roostBeforeLoad` or `roostLoader` handler throws a TanStack `redirect`
When TanStack Router handles the route
Then the navigation SHALL redirect as if the redirect was thrown from a normal TanStack hook.

#### Scenario: Handler throws not found

Given a handler throws a TanStack not-found error
When TanStack Router handles the route
Then the route SHALL use TanStack's not-found handling.

#### Scenario: Handler throws unexpected error

Given a handler throws an unexpected error
When TanStack Router handles the route
Then the error SHALL surface to TanStack error handling
And the helper SHALL NOT replace it with an unrelated generic wrapper error.

### Requirement: Optional Public Context Projection

Roost route helpers SHALL NOT require public route context projection for services to access request-scoped server context.

#### Scenario: Loader uses current user internally

Given `PostService` depends on current user or organization
When a route uses `roostLoader` without `roostBeforeLoad`
Then `PostService` SHALL still be able to resolve current user or organization through server-side Roost context.

#### Scenario: App exposes cache-relevant context

Given an app wants TanStack Router to see cache-relevant values such as `userId` or `orgId`
When the app uses `roostBeforeLoad` to return those values
Then descendant routes SHALL be able to use those values in route context, loader dependencies, UI, or invalidation logic.

### Requirement: Documentation Guidance

`@roostjs/start` documentation SHALL explain when to use normal TanStack route primitives and when to use Roost route helpers.

#### Scenario: Local or isomorphic data

Given route data does not need Roost services or server-only resources
When a developer reads the docs
Then the docs SHALL recommend a normal TanStack loader.

#### Scenario: Server-backed Roost data

Given route data needs Roost services or server-only resources
When a developer reads the docs
Then the docs SHALL recommend `roostLoader`.

#### Scenario: Route guards or public context

Given a route needs auth guards, tenant guards, or public route context projection
When a developer reads the docs
Then the docs SHALL recommend `roostBeforeLoad`.
