# Roost

A Laravel-inspired TypeScript framework for building full-stack applications on Cloudflare Workers.

[![CI](https://img.shields.io/github/actions/workflow/status/birdcar/roost/ci.yml?branch=main)](https://github.com/birdcar/roost/actions)
[![npm](https://img.shields.io/npm/v/@roostjs/core)](https://www.npmjs.com/package/@roostjs/core)
[![License](https://img.shields.io/github/license/birdcar/roost)](./LICENSE)

---

If you've built anything non-trivial on Cloudflare Workers, you know the pattern: wire up D1 manually, roll your own auth session logic on KV, figure out how to structure middleware, scatter queue handlers across files, and write the same boilerplate for every new project. There's no service container, no convention for where things go, no ORM that feels like an ORM. You end up building half a framework before you build your actual app.

Roost is the framework I wanted to exist. It brings Laravel's convention-over-configuration philosophy to the Cloudflare edge -- a service container with scoped resolution, an ActiveRecord-style ORM on D1, WorkOS-backed auth with KV sessions, typed wrappers for all eight Cloudflare bindings, AI agent classes, job queues, and a TanStack Start frontend. All of it TypeScript, all of it strict mode, all of it designed to run on Workers.

## Quick start

```bash
bun add -g @roostjs/cli
roost new my-app
cd my-app && bun install && bun run dev
```

The scaffolded project includes a working TanStack Start frontend, D1 database with migrations, WorkOS authentication, and a dev server -- ready to deploy to Cloudflare with `wrangler deploy`.

## What it looks like

Here's a raw Cloudflare Worker handling a request with D1:

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/posts') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM posts WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).bind('published', 10, 0).all();

      return new Response(JSON.stringify(results), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
```

Here's Roost:

```typescript
class Post extends Model {
  static tableName = 'posts';
}

const posts = await Post.where('status', 'published')
  .orderBy('created_at', 'desc')
  .paginate(1, 10);
```

The ORM handles query building, pagination math, timestamps, soft deletes, and lifecycle hooks. You define a model class, and it works the way you'd expect if you've used Eloquent.

## Core concepts

### Application and service container

Every Roost app starts with an `Application` instance that owns a dependency injection container, config manager, and middleware pipeline. Service providers register bindings, middleware runs per-request in scoped containers, and the whole thing boots lazily on the first request.

```typescript
const app = Application.create(env, {
  app: { name: 'My App', env: 'production' },
});

app.register(AuthServiceProvider);
app.register(OrmServiceProvider);
app.useMiddleware(CsrfMiddleware);

export default { fetch: (req: Request) => app.handle(req) };
```

The container supports singletons, transient bindings, scoped resolution (each request gets its own child container), and circular dependency detection.

### Models

The ORM wraps Drizzle with an ActiveRecord layer that maps to D1. Models support `find`, `findOrFail`, `create`, `save`, `delete`, chainable queries with `where`/`orWhere`/`whereIn`/`whereNull`, ordering, pagination, eager loading, soft deletes, timestamps, and lifecycle hooks (`creating`, `created`, `updating`, `updated`, `deleting`, `deleted`).

```typescript
class Post extends Model {
  static tableName = 'posts';
  static softDeletes = true;
}

// Fluent query builder
const recent = await Post.where('status', 'published')
  .whereNotNull('published_at')
  .orderBy('created_at', 'desc')
  .limit(20)
  .all();

// Lifecycle hooks
Post.on('creating', async (post) => {
  post.attributes.slug = slugify(post.attributes.title as string);
});

// Pagination with totals
const page = await Post.where('author_id', userId)
  .paginate(2, 15);
// => { data: Post[], total: number, perPage: 15, currentPage: 2, lastPage: number }
```

### Authentication

Auth is backed by WorkOS, which means SSO, directory sync, RBAC, and organization management come out of the box. Sessions are stored in KV with a sliding 7-day TTL. Four middleware guards ship by default: `auth`, `guest`, `role`, and `csrf`.

```typescript
app.register(AuthServiceProvider);

// Protect routes
app.useMiddleware(AuthMiddleware);       // redirects unauthenticated users
app.useMiddleware(RoleMiddleware, 'admin'); // requires specific role
```

Multi-tenancy through WorkOS organizations is supported natively -- users belong to orgs, and auth context flows through the request lifecycle.

### AI agents

Agents are class-based with typed tools, multi-step reasoning, conversation memory, and streaming. The default provider is Cloudflare AI, but the provider interface is swappable.

```typescript
class ResearchAssistant extends Agent {
  instructions() {
    return 'You are a research assistant. Use tools to find and summarize information.';
  }

  tools() {
    return [new SearchTool(), new SummarizeTool()];
  }
}

const assistant = new ResearchAssistant();
const response = await assistant.prompt('Summarize recent posts about TypeScript');
// Multi-step: the agent calls tools, processes results, and responds

// Streaming
const stream = await assistant.stream('What are the latest trends?');
return new Response(stream, {
  headers: { 'content-type': 'text/event-stream' },
});
```

There's also a functional API for quick one-off agents:

```typescript
import { agent } from '@roostjs/ai';

const helper = agent({
  instructions: 'You answer questions about our docs.',
  tools: [new DocSearchTool()],
});

const result = await helper.prompt('How do I set up auth?');
```

### Job queues

Jobs run on Cloudflare Queues with typed payloads, automatic retries, delayed dispatch, chaining, and batching.

```typescript
class SendWelcomeEmail extends Job<{ userId: string }> {
  async handle() {
    const user = await User.findOrFail(this.payload.userId);
    // send email
  }

  async onFailure(error: Error) {
    console.error(`Failed to send welcome email: ${error.message}`);
  }
}

// Dispatch immediately
await SendWelcomeEmail.dispatch({ userId: 'user_123' });

// Dispatch with delay
await SendWelcomeEmail.dispatchAfter(60, { userId: 'user_123' });

// Chain jobs (sequential)
await Job.chain([
  { jobClass: CreateAccount, payload: { email } },
  { jobClass: SendWelcomeEmail, payload: { email } },
  { jobClass: NotifyAdmin, payload: { email } },
]);

// Batch jobs (parallel)
await Job.batch([
  { jobClass: SyncUser, payload: { id: '1' } },
  { jobClass: SyncUser, payload: { id: '2' } },
]);
```

### MCP server

Build Model Context Protocol servers with typed tools, resources, and prompts. Each component is a class with a clear interface, and the server handles discovery and dispatch.

```typescript
class AppMcpServer extends McpServer {
  tools = [SearchDocsTool, CreateIssueTool];
  resources = [ProjectConfigResource, SchemaResource];
  prompts = [CodeReviewPrompt, ExplainCodePrompt];
}

const server = new AppMcpServer();
const tools = server.listTools();         // tool definitions for discovery
const result = await server.callTool('search_docs', { query: 'auth setup' });
```

### Billing

An abstract billing interface with a Stripe adapter that uses the REST API directly (no heavy SDK). Includes subscription middleware, webhook handling, and a fake for testing.

```typescript
app.register(BillingServiceProvider);

// Subscription gating in middleware
app.useMiddleware(BillingMiddleware, 'pro');
```

### Cloudflare bindings

Typed wrappers for all eight Cloudflare bindings: D1, KV, R2, Queues, Durable Objects, AI, Vectorize, and Hyperdrive. These integrate with the service container so you resolve them by type rather than pulling from `env` directly.

## Packages

Roost is a Bun monorepo with 16 packages, all published under `@roostjs/*`:

| Package | What it does |
|---------|-------------|
| `@roostjs/core` | Service container, config manager, middleware pipeline, Application class |
| `@roostjs/cloudflare` | Typed wrappers for D1, KV, R2, Queues, Durable Objects, AI, Vectorize, Hyperdrive |
| `@roostjs/start` | TanStack Start integration, context bridge, server functions |
| `@roostjs/auth` | WorkOS authentication, KV sessions, auth/guest/role/csrf middleware guards |
| `@roostjs/orm` | Drizzle-backed ORM with ActiveRecord models, query builder, relations, hooks, factories |
| `@roostjs/ai` | Agent classes, typed tools, streaming, conversation memory, Cloudflare AI provider |
| `@roostjs/mcp` | MCP server with tools, resources, and prompts |
| `@roostjs/schema` | Fluent JSON Schema builder |
| `@roostjs/billing` | Abstract billing interface with Stripe REST adapter and webhook handling |
| `@roostjs/queue` | Job classes with dispatch, retry, chain, batch on Cloudflare Queues |
| `@roostjs/events` | In-process event dispatching with listeners, subscribers, and optional queue deferral |
| `@roostjs/feature-flags` | Feature flag evaluation via WorkOS with KV edge caching, Pennant-style API |
| `@roostjs/broadcast` | Real-time WebSocket broadcasting via Durable Objects with channel authorization |
| `@roostjs/workflow` | Durable multi-step workflows on Cloudflare Workflows with saga/compensate support |
| `@roostjs/cli` | Project scaffolding (`roost new`) and code generators (`roost make:model`, `roost make:agent`) |
| `@roostjs/testing` | HTTP test client, unified fakes for agents, jobs, and billing |

## Testing

Every major subsystem ships with a `.fake()` / `.restore()` pattern inspired by Laravel's testing utilities. Fakes record interactions so you can assert against them without hitting real services.

```typescript
import { test, expect } from 'bun:test';

// Fake the agent -- no AI calls made
ResearchAssistant.fake(['Here are the results...']);

const assistant = new ResearchAssistant();
await assistant.prompt('Find recent posts');

ResearchAssistant.assertPrompted('recent posts');
ResearchAssistant.restore();

// Fake job dispatch -- no queue calls made
SendWelcomeEmail.fake();

await SendWelcomeEmail.dispatch({ userId: 'user_123' });

SendWelcomeEmail.assertDispatched();
SendWelcomeEmail.restore();
```

The `@roostjs/testing` package also includes an HTTP test client for integration tests and a `setupTestSuite` helper that wires up a test application with fakes pre-configured.

## CLI

The CLI scaffolds new projects and generates code:

```bash
roost new my-app          # scaffold a full project
roost make:model Post     # generate a model class
roost make:agent Assistant # generate an agent class
```

Generated code follows the project's conventions and lands in the right directories.

## AI coding skills

Roost ships [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code, Cursor, and others. Install them with:

```bash
npx skills add birdcar/roost
```

Available skills:

| Skill | What it does |
|-------|-------------|
| `roost-new` | Scaffold a new Roost project via `roost new` |
| `roost-make` | Generate models, agents, jobs, middleware, tools, controllers, MCP servers |
| `roost-docs` | Fetch Roost documentation from the docs site |
| `roost-conventions` | File structure, naming conventions, and import patterns |

## Requirements

- [Bun](https://bun.sh) (package manager and runtime for development)
- [Cloudflare Workers](https://workers.cloudflare.com) account (for deployment)
- [WorkOS](https://workos.com) account (for authentication -- free tier available)
- TypeScript 5.8+

## Contributing

Roost is open source and contributions are welcome. The repo is a Bun workspace -- `bun install` at the root sets up all packages.

```bash
git clone https://github.com/birdcar/roost.git
cd roost && bun install

bun test           # run tests
bun run typecheck  # type-check all packages
bun run build      # build all packages
```

If you find a bug or have a feature request, please [open an issue](https://github.com/birdcar/roost/issues).

## License

See [LICENSE](./LICENSE) for details.
