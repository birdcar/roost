# PRD: Roost Framework - Phase 2

**Contract**: ./contract.md
**Phase**: 2 of 11
**Focus**: TanStack Start integration, type-safe file-based routing, and server-side rendering on Workers

## Phase Overview

Phase 2 wires up the frontend story. Roost apps should feel like Next.js to develop — file-based routing, server rendering, server functions — but run on Cloudflare Workers via TanStack Start (built on Vinxi/Nitro, which has a Cloudflare Workers preset).

TanStack Start was chosen over React Router 7 because: (1) TanStack Router has the best type safety in the React ecosystem — route params, search params, and loader data are all fully inferred, which directly serves the "typed everything" and AI-native goals; (2) React is moving toward RSC, and TanStack Start's architecture is designed to evolve with it, while RR7 has no RSC plans; (3) Vinxi/Nitro's composable architecture lets Roost extend the server layer without fighting the framework.

This phase is sequenced after Foundation because it depends on the core middleware pipeline and application class. It's sequenced before Auth because auth needs routes to protect and login pages to render.

After this phase, a developer can create a Roost app with React pages, fully type-safe routing, server-side data loading, nested layouts, and error boundaries — all running on Cloudflare Workers.

## User Stories

1. As a Roost app developer, I want file-based routing so that creating a file at `app/routes/users.tsx` automatically creates the `/users` route.
2. As a Roost app developer, I want server functions so that my pages load data on the server before sending HTML to the client.
3. As a Roost app developer, I want fully type-safe routes so that route params, search params, and loader data are all inferred by TypeScript without manual annotation.
4. As a Roost app developer, I want nested layouts so that I can share UI chrome across route groups.
5. As a Roost app developer, I want error boundaries so that route-level errors don't crash the entire app.
6. As a Roost app developer, I want the framework to handle static assets so that I can import CSS, images, and fonts without manual configuration.
7. As an AI agent writing Roost code, I want route type errors to surface at compile time so that I can self-correct without running the app.

## Functional Requirements

### TanStack Start Integration

- **FR-2.1**: TanStack Start configured with Vinxi and Nitro's Cloudflare Workers preset
- **FR-2.2**: Convention-based route file discovery from `app/routes/` directory following TanStack Router file-based routing conventions
- **FR-2.3**: Route tree auto-generated with full type inference (params, search params, loader data)
- **FR-2.4**: Roost Application class integrates with Vinxi/Nitro's server handler, bridging into TanStack Start's entry point

### Server-Side Rendering & Server Functions

- **FR-2.5**: All routes server-rendered by default on Workers via Vinxi's SSR support
- **FR-2.6**: Server functions (createServerFn) have access to Roost's service container and Cloudflare bindings
- **FR-2.7**: Loader functions receive Roost context with typed access to all CF bindings
- **FR-2.8**: Context bridge: Roost's Application/container injected into TanStack Start's server context so loaders/server functions can resolve services

### Type-Safe Routing

- **FR-2.9**: Route params fully typed — `useParams()` returns `{ userId: string }` for `/users/$userId`
- **FR-2.10**: Search params validated and typed via TanStack Router's search schema
- **FR-2.11**: Loader data typed — component receives `loaderData` with full inference from the loader return type
- **FR-2.12**: Link component type-checks route paths and required params at compile time

### Layout System

- **FR-2.13**: Root layout at `app/routes/__root.tsx` with HTML shell, meta, links
- **FR-2.14**: Nested layouts via route hierarchy (parent routes with `<Outlet />`)
- **FR-2.15**: Pathless layout routes for grouping without URL segments (`_layout` prefix)
- **FR-2.16**: Layout-level error boundaries via `errorComponent`

### Developer Experience

- **FR-2.17**: `bun run dev` starts Vinxi dev server with HMR via Vite
- **FR-2.18**: Route tree codegen runs on file changes for instant type updates
- **FR-2.19**: TanStack DevTools integration for route inspection during development
- **FR-2.20**: Static asset handling via Vinxi/Nitro's asset pipeline

### Middleware Integration

- **FR-2.21**: Roost middleware pipeline executes via Nitro server middleware before TanStack Start handles the request
- **FR-2.22**: Route-level middleware via TanStack Router's `beforeLoad` hooks
- **FR-2.23**: Middleware can short-circuit (redirect, 401) before loader runs

## Non-Functional Requirements

- **NFR-2.1**: Time to First Byte (TTFB) < 100ms for server-rendered pages on Workers
- **NFR-2.2**: Client-side hydration completes without layout shift
- **NFR-2.3**: Dev server HMR reflects changes in < 2 seconds
- **NFR-2.4**: Bundle size impact of framework layer < 10KB gzipped on client
- **NFR-2.5**: Route type generation completes in < 1 second on file save

## Dependencies

### Prerequisites

- Phase 1 complete (core framework, middleware pipeline, binding abstractions)

### Outputs for Next Phase

- File-based routing with server rendering and full type safety
- Server function context with access to Roost container and CF bindings
- Middleware integration points for auth guards (Phase 3)
- Page rendering pipeline for login/signup pages (Phase 3)
- Route/server handler for MCP HTTP endpoints (Phase 5)
- Nitro server middleware layer for API routes

## Acceptance Criteria

- [ ] A route file at `app/routes/index.tsx` renders at `/` with server-side HTML
- [ ] A loader function fetches data and it's accessible in the component with full type inference
- [ ] A server function handles form mutation and returns typed response
- [ ] Route params are fully typed — accessing a nonexistent param is a compile error
- [ ] Search params are validated and typed via route search schema
- [ ] Link component rejects invalid route paths at compile time
- [ ] Nested layouts render correctly with shared chrome
- [ ] Error boundaries catch and display route-level errors
- [ ] Server functions can access Cloudflare bindings (e.g., KV.get) via Roost context
- [ ] Roost middleware runs before route handling and can redirect/block
- [ ] `bun run dev` starts a working dev server with HMR
- [ ] Static assets (CSS, images) load correctly in dev and production
- [ ] Production build deploys to Cloudflare Workers via Nitro preset
