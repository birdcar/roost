# @roostjs/cli

Command-line tool for scaffolding and managing Roost projects.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Usage

```bash
bunx @roostjs/cli <command>
# or
npx @roostjs/cli <command>
```

Install globally if you prefer a shorter command:

```bash
bun add -g @roostjs/cli
roost <command>
```

## Quick Start

```bash
# Create a new project
bunx @roostjs/cli new my-app

# With optional feature flags
bunx @roostjs/cli new my-app --with-ai --with-queue

cd my-app && bun install && bun run dev
```

## Commands

**Project scaffolding**

```bash
roost new <name>               # Scaffold a new Roost project
  --with-ai                    # Add @roostjs/ai, @roostjs/mcp, @roostjs/schema
  --with-billing               # Add @roostjs/billing
  --with-queue                 # Add @roostjs/queue
  --force                      # Overwrite existing directory
```

**Code generation**

```bash
roost make:model <Name>        # src/models/<name>.ts
roost make:controller <Name>   # src/controllers/<name>.ts
roost make:middleware <Name>   # src/middleware/<name>.ts
roost make:job <Name>          # src/jobs/<name>.ts
roost make:agent <Name>        # src/agents/<name>.ts
roost make:tool <Name>         # src/tools/<name>.ts
roost make:mcp-server <Name>   # src/mcp/<name>.ts
roost make:workflow <Name>     # src/workflows/<name>.ts
roost make:rate-limiter <Name> # KV-backed rate limiter (add --do for Durable Object variant)
roost make:event <Name>        # src/events/<name>.ts (add --broadcast for WebSocket events)
roost make:listener <Name>     # src/listeners/<name>.ts
  --event <EventName>          # Import and type against a specific event class
  --queued                     # Generate a Job-based queued listener
roost make:channel <Name>      # src/channels/<name>.ts (add --presence for presence data)
```

**Development and deployment**

```bash
roost dev              # Start Vite dev server
roost build            # Build for production
roost deploy           # Build then deploy via wrangler
roost migrate          # Push schema changes (drizzle-kit push)
roost migrate:generate # Generate migration files (drizzle-kit generate)
roost db:seed          # Run database/seeders/index.ts
```

## What `roost new` generates

A full TanStack Start + Cloudflare Workers project with:

- `src/routes/` — file-based routing via TanStack Router
- `src/models/`, `src/agents/` — starter directories
- `config/` — app, database, and auth configuration
- `database/migrations/` and `database/seeders/`
- `wrangler.jsonc` pre-configured for Workers + smart placement
- `.dev.vars` with WorkOS environment variable placeholders
- `vite.config.ts` with the tested TanStack Start + Vite stack shipped by the
  current CLI version

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/cli](https://roost.birdcar.dev/docs/reference/cli)

## License

MIT
