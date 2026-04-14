# PRD: Roost Framework - Phase 8

**Contract**: ./contract.md
**Phase**: 8 of 11
**Focus**: CLI for project scaffolding and code generation

## Phase Overview

Phase 8 gives Roost its command-line interface — the `roost` command that makes the framework feel like Laravel's `artisan`. This is where convention-over-configuration pays off: the CLI knows the project structure, knows the package APIs, and generates code that fits.

This phase is sequenced after Phases 2-7 because the CLI needs to know what it's generating. You can't scaffold an agent class until @roostjs/ai exists, can't generate a model until @roostjs/orm exists. The CLI is a capstone that ties all packages together into a coherent developer experience.

After this phase, a developer types `roost new my-app` and gets a fully configured project. They type `roost make:model User` and get a model class, migration, and factory. The CLI is also the primary interface for migrations, dev server, and deployment.

## User Stories

1. As a developer, I want `roost new my-app` to scaffold a complete project so that I'm productive in minutes, not hours.
2. As a developer, I want `roost make:model` to generate a model, migration, and optional factory so that I follow framework conventions automatically.
3. As a developer, I want `roost make:agent` to generate an AI agent class with tool stubs so that I can build AI features quickly.
4. As a developer, I want `roost dev` to start the dev server so that I don't need to remember Vinxi/Wrangler flags.
5. As a developer, I want `roost migrate` to run my D1 migrations so that database changes are a single command.
6. As an AI agent, I want the CLI to generate convention-following code so that I can invoke it programmatically and get correct results.

## Functional Requirements

### Project Scaffolding

- **FR-8.1**: `roost new <name>` creates a new project directory with full structure
- **FR-8.2**: Project scaffold includes: `app/routes/`, `app/models/`, `app/agents/`, `config/`, `database/migrations/`, `database/seeders/`, `tests/`
- **FR-8.3**: Setup wizard prompts for WorkOS API key and client ID (or detects from env)
- **FR-8.4**: Generated project includes: TanStack Start config, Vinxi config, Wrangler config, TypeScript config, package.json with all @roostjs/* dependencies
- **FR-8.5**: `bun install && bun run dev` works immediately after scaffolding
- **FR-8.6**: Optional flags: `--with-billing`, `--with-ai`, `--with-queue` to include/exclude packages

### Code Generators

- **FR-8.7**: `roost make:model <Name>` — generates model class in `app/models/`, migration in `database/migrations/`, optional factory in `database/factories/`
- **FR-8.8**: `roost make:controller <Name>` — generates route handler/controller in `app/controllers/`
- **FR-8.9**: `roost make:agent <Name>` — generates agent class in `app/agents/` with `instructions()` and optional `tools()` stubs
- **FR-8.10**: `roost make:tool <Name>` — generates tool class in `app/tools/` with `schema()` and `handle()` stubs
- **FR-8.11**: `roost make:mcp-server <Name>` — generates MCP server in `app/mcp/` with a tool stub
- **FR-8.12**: `roost make:job <Name>` — generates job class in `app/jobs/` with typed payload
- **FR-8.13**: `roost make:middleware <Name>` — generates middleware in `app/middleware/`
- **FR-8.14**: All generators respect existing code — append to registrations, don't overwrite

### Database Commands

- **FR-8.15**: `roost migrate` — runs pending D1 migrations via Drizzle Kit
- **FR-8.16**: `roost migrate:rollback` — rolls back last migration batch
- **FR-8.17**: `roost migrate:status` — shows migration state
- **FR-8.18**: `roost db:seed` — runs database seeders
- **FR-8.19**: `roost migrate:fresh` — drops all tables and re-runs all migrations (dev only)

### Dev & Deploy

- **FR-8.20**: `roost dev` — starts Vinxi dev server with Wrangler bindings
- **FR-8.21**: `roost build` — production build via Vinxi
- **FR-8.22**: `roost deploy` — deploys to Cloudflare Workers via Wrangler
- **FR-8.23**: `roost deploy --preview` — deploys to preview environment

### CLI Infrastructure

- **FR-8.24**: CLI built as standalone bun executable (@roostjs/cli package)
- **FR-8.25**: Template engine for code generation — Handlebars or similar with Roost conventions baked in
- **FR-8.26**: CLI self-updates via npm/bun
- **FR-8.27**: `roost help` and `roost <command> --help` for discoverability

## Non-Functional Requirements

- **NFR-8.1**: `roost new` completes in < 30 seconds (excluding `bun install`)
- **NFR-8.2**: Code generators complete in < 2 seconds
- **NFR-8.3**: Generated code passes TypeScript strict mode without edits
- **NFR-8.4**: Generated code follows all Roost conventions (file location, naming, imports)

## Dependencies

### Prerequisites

- Phase 1 complete (core framework structure to scaffold into)
- Phase 2 complete (TanStack Start config for project template)
- Phase 3 complete (WorkOS auth for scaffolding setup wizard)
- Phase 4 complete (ORM for model/migration generators)
- Phase 5 complete (AI/MCP for agent/tool/mcp-server generators)
- Phase 6 complete (Queue for job generator)
- Phase 7 complete (Billing for `--with-billing` flag)

### Outputs for Next Phase

- Project scaffolding for Phase 10 example apps
- Code generators for Phase 10 example development workflow
- Dev/deploy commands for Phase 11 docs/marketing site

## Acceptance Criteria

- [ ] `roost new my-app` creates a directory with correct structure
- [ ] Scaffolded project runs with `bun install && bun run dev`
- [ ] `roost make:model Post` generates model, migration, and factory
- [ ] `roost make:agent Assistant` generates agent class with correct imports
- [ ] `roost make:tool Search` generates tool with schema and handle stubs
- [ ] `roost make:job SendEmail` generates job with typed payload
- [ ] `roost migrate` applies pending migrations to D1
- [ ] `roost dev` starts a working dev server
- [ ] `roost deploy` deploys to Cloudflare Workers
- [ ] All generated code compiles with zero TypeScript errors
- [ ] CLI is installable globally via `bun add -g @roostjs/cli`
- [ ] `roost help` lists all available commands
