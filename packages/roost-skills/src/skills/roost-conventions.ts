#!/usr/bin/env node

const CONVENTIONS = `# Roost Conventions

## File Structure
src/
  models/       → ORM models (extend Model from @roost/orm)
  controllers/  → Route handler classes
  middleware/   → Request/response middleware
  jobs/         → Background job classes (extend Job from @roost/queue)
  agents/       → AI agent definitions (extend Agent from @roost/ai)
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
- Core:    import { Application, RoostContainer, ServiceProvider, ConfigManager, Pipeline } from '@roost/core'
- ORM:     import { Model, QueryBuilder, Factory } from '@roost/orm'
- Auth:    import { AuthMiddleware, SessionManager } from '@roost/auth'
- Queue:   import { Job, Dispatcher } from '@roost/queue'
- AI:      import { Agent, agent } from '@roost/ai'
- Schema:  import { schema, SchemaBuilder } from '@roost/schema'
- Start:   import { createRoostMiddleware, bootApp, roostFn } from '@roost/start'
- Billing: import { StripeProvider, BillingServiceProvider } from '@roost/billing'
- CF:      import { KVStore, R2Storage, D1Database } from '@roost/cloudflare'
- MCP:     import { McpServer, McpTool } from '@roost/mcp'
- Testing: import { TestClient, setupTestSuite } from '@roost/testing'
- CLI:     import { run } from '@roost/cli' (binary, not typically imported)

## Key Patterns
- Service providers register bindings in register() and run boot logic in boot()
- Models use Drizzle ORM sqlite tables; migrations are schema pushes via drizzle-kit
- Middleware applied via Application.useMiddleware(), not per-route
- Jobs dispatched via static dispatch() method: await SendEmail.dispatch(payload)
- Agents use decorators: @Model('@cf/meta/llama-3.1-70b-instruct')
- Server functions: import { createServerFn } from '@tanstack/react-start'
- Auth: WorkOS-based via @roost/auth; routes at /auth/login, /auth/callback, /auth/logout
- Billing: Stripe via @roost/billing; webhook verification with verifyStripeWebhook()
`

console.log(CONVENTIONS)
