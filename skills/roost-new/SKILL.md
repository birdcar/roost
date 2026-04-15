---
name: roost-new
description: Scaffold a new Roost project on Cloudflare Workers. Use when the user asks to create a new project, start a new app, or set up Roost from scratch.
---

# Scaffold a New Roost Project

## Prerequisites

The `@roostjs/cli` package must be installed globally:

```bash
bun add -g @roostjs/cli
```

## Usage

```bash
roost new <name> [flags]
```

### Flags

| Flag | Description |
|---|---|
| `--with-ai` | Include AI agent scaffolding (`@roostjs/ai`, example agent + tool) |
| `--with-billing` | Include billing scaffolding (`@roostjs/billing`, Stripe provider setup) |
| `--with-queue` | Include queue/jobs scaffolding (`@roostjs/queue`, example job class) |

Flags can be combined: `roost new my-app --with-ai --with-billing --with-queue`

## What Gets Created

```
<name>/
  src/
    routes/          → TanStack Start file-based routes
    middleware/       → Request/response middleware
    providers/       → Service providers
    app.ts           → Application bootstrap (createApp, providers, middleware)
  drizzle/           → Drizzle ORM config and migrations
  public/            → Static assets
  wrangler.jsonc     → Cloudflare Workers config (D1, KV bindings)
  package.json       → Dependencies and scripts
  tsconfig.json      → TypeScript config (strict, ES2022)
  app.config.ts      → TanStack Start app config
```

With `--with-ai`: adds `src/agents/`, `src/agents/tools/`, and an example agent.

With `--with-billing`: adds `src/providers/billing-service-provider.ts` and Stripe webhook route.

With `--with-queue`: adds `src/jobs/` and an example job class.

## Post-Scaffold Steps

After the CLI finishes:

1. `cd <name>`
2. `bun install`
3. Configure `wrangler.jsonc` with your Cloudflare account ID and D1 database
4. Set environment variables (WorkOS keys for auth, Stripe keys for billing)
5. `bun run dev` to start the development server
