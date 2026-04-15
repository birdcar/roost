---
name: roost-make
description: Generate Roost code artifacts (model, agent, job, middleware, tool, controller, mcp-server). Use when the user asks to create, generate, or scaffold a new component.
---

# Generate Roost Code Artifacts

## Prerequisites

The `@roostjs/cli` package must be installed globally:

```bash
bun add -g @roostjs/cli
```

## Usage

```bash
roost make:<type> <Name>
```

`<Name>` must be PascalCase. The CLI generates a kebab-case filename automatically.

## Artifact Types

| Type | Command | Output Directory | Example |
|---|---|---|---|
| model | `roost make:model User` | `src/models/user.ts` | ORM model extending `Model` |
| controller | `roost make:controller UserController` | `src/controllers/user-controller.ts` | Route handler class |
| middleware | `roost make:middleware AuthMiddleware` | `src/middleware/auth-middleware.ts` | Request/response middleware |
| job | `roost make:job SendWelcomeEmail` | `src/jobs/send-welcome-email.ts` | Background job extending `Job` |
| agent | `roost make:agent ResearchAgent` | `src/agents/research-agent.ts` | AI agent extending `Agent` |
| tool | `roost make:tool SearchWebTool` | `src/agents/tools/search-web-tool.ts` | Agent tool definition |
| mcp-server | `roost make:mcp-server ApiServer` | `src/mcp/api-server.ts` | MCP server with tools/resources |

## Naming Rules

- **Input**: PascalCase class name (`SendWelcomeEmail`, `UserController`)
- **Output filename**: kebab-case (`send-welcome-email.ts`, `user-controller.ts`)
- **Conversion**: Insert hyphens before uppercase letters, then lowercase everything
- **Suffixes**: Controllers use `Controller`, Middleware uses `Middleware`, Tools use `Tool`. Models, Jobs, and Agents have no required suffix.

## Examples

```bash
# Create a User model at src/models/user.ts
roost make:model User

# Create an agent at src/agents/chat-assistant.ts
roost make:agent ChatAssistant

# Create a job at src/jobs/process-payment.ts
roost make:job ProcessPayment

# Create a tool at src/agents/tools/summarize-tool.ts
roost make:tool SummarizeTool

# Create an MCP server at src/mcp/api-server.ts
roost make:mcp-server ApiServer
```
