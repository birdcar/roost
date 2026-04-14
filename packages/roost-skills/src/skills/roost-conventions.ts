#!/usr/bin/env node

const CONVENTIONS = `# Roost Conventions

## File Structure
src/
  models/       → ORM models (extend Model from @roostjs/orm)
  controllers/  → Route handler classes
  middleware/   → Request/response middleware
  jobs/         → Background job classes (extend Job from @roostjs/queue)
  agents/       → AI agent definitions (extend Agent from @roostjs/ai)
    tools/      → Agent tool definitions
  mcp/          → MCP server definitions
  routes/       → TanStack Start file-based routes
  providers/    → Service providers

## Naming Conventions
- Models: PascalCase, singular noun (User, BlogPost, OrderItem)
- Controllers: PascalCase + Controller suffix (UserController)
- Jobs: PascalCase (SendWelcomeEmail, ProcessPayment)
- Middleware: PascalCase + Middleware suffix (AuthMiddleware, CorsMiddleware)
- Agents: PascalCase (ChatAssistant, ResearchAgent)
- Tools: PascalCase + Tool suffix (SummarizeTool, SearchWebTool)
- File names: kebab-case (chat-assistant.ts, send-welcome-email.ts)
- Database tables: snake_case, plural (users, blog_posts, order_items)

## Import Paths
- Core:    import { Application, RoostContainer, ServiceProvider, ConfigManager, Pipeline } from '@roostjs/core'
- ORM:     import { Model, QueryBuilder, Factory } from '@roostjs/orm'
- Auth:    import { AuthMiddleware, SessionManager } from '@roostjs/auth'
- Queue:   import { Job, Dispatcher } from '@roostjs/queue'
- AI:      import { Agent, agent } from '@roostjs/ai'
- Schema:  import { schema, SchemaBuilder } from '@roostjs/schema'
- Start:   import { createRoostMiddleware, bootApp, roostFn } from '@roostjs/start'
- Billing: import { StripeProvider, BillingServiceProvider } from '@roostjs/billing'
- CF:      import { KVStore, R2Storage, D1Database } from '@roostjs/cloudflare'
- MCP:     import { McpServer, McpTool } from '@roostjs/mcp'
- Testing: import { TestClient, setupTestSuite } from '@roostjs/testing'
- CLI:     import { run } from '@roostjs/cli' (binary, not typically imported)

## Key Patterns
- Service providers register bindings in register() and run boot logic in boot()
- Models use Drizzle ORM sqlite tables; migrations are schema pushes via drizzle-kit
- Middleware applied via Application.useMiddleware(), not per-route
- Jobs dispatched via static dispatch() method: await SendEmail.dispatch(payload)
- Agents use decorators: @Model('@cf/meta/llama-3.1-70b-instruct')
- Server functions: import { createServerFn } from '@tanstack/react-start'
- Auth: WorkOS-based via @roostjs/auth; routes at /auth/login, /auth/callback, /auth/logout
- Billing: Stripe via @roostjs/billing; webhook verification with verifyStripeWebhook()
`

console.log(CONVENTIONS)
