# PRD: Roost Framework - Phase 5

**Contract**: ./contract.md
**Phase**: 5 of 11
**Focus**: AI SDK with agent classes, tool definitions, and MCP server support

## Phase Overview

Phase 5 is the heart of Roost's AI-native story. It implements two packages: @roostjs/ai (agent classes, tools, structured output, streaming, conversation memory) and @roostjs/mcp (MCP server with tools, resources, and prompts). Both are modeled directly after Laravel 13's AI SDK and MCP implementations, adapted for TypeScript decorators and Cloudflare Workers.

This phase depends on Phase 2 (routing, for MCP HTTP transport and streaming SSE routes) and Phase 1 (Cloudflare AI binding). It can run in parallel with Auth (Phase 3) and ORM (Phase 4), though conversation persistence will initially use raw D1 until the ORM is available.

After this phase, a developer can define an AI agent as a class with typed tools, get structured output, stream responses via SSE, persist conversations, and expose an MCP server — all backed by Cloudflare AI on the edge.

## User Stories

1. As a Roost app developer, I want to define AI agents as decorated classes so that agent configuration is declarative and type-safe.
2. As a Roost app developer, I want to define tools with typed schemas so that the LLM gets precise function signatures and my handler gets validated input.
3. As a Roost app developer, I want structured output so that agent responses conform to a defined schema I can use in my app.
4. As a Roost app developer, I want streaming responses so that my UI can show tokens as they arrive.
5. As a Roost app developer, I want conversation memory so that agents maintain context across multiple turns.
6. As a Roost app developer, I want to expose my app as an MCP server so that AI clients (Claude, Cursor, etc.) can use my app's capabilities as tools.
7. As a Roost app developer, I want to test my agents without hitting real AI providers.

## Functional Requirements

### Agent Classes (@roostjs/ai)

- **FR-5.1**: `Agent` interface with `instructions()` method returning system prompt
- **FR-5.2**: `Promptable` mixin providing `prompt()`, `stream()`, and `queue()` methods
- **FR-5.3**: Decorator-driven configuration: `@Provider`, `@Model`, `@MaxSteps`, `@MaxTokens`, `@Temperature`, `@Timeout`
- **FR-5.4**: `HasTools` interface with `tools()` method returning tool instances
- **FR-5.5**: `HasStructuredOutput` interface with `schema()` method defining output shape
- **FR-5.6**: `HasMiddleware` interface with `middleware()` method for agent middleware pipeline
- **FR-5.7**: Constructor injection — agents accept dependencies via constructor (e.g., `new SalesCoach(user)`)
- **FR-5.8**: Anonymous agent function for one-off prompts: `agent({ instructions, tools, schema }).prompt('...')`

### Tool Definitions (@roostjs/ai)

- **FR-5.9**: `Tool` interface with `description()`, `schema()`, and `handle(request)` methods
- **FR-5.10**: Schema builder matching Laravel's JsonSchema pattern: `schema.string()`, `schema.integer().min(0)`, `schema.object()`, `schema.array()`, `schema.enum([])`, `.required()`, `.default()`
- **FR-5.11**: Tool `handle()` receives typed request object with validated parameters
- **FR-5.12**: Tools resolved via service container for dependency injection

### Structured Output

- **FR-5.13**: Schema defined via the same JsonSchema builder used by tools
- **FR-5.14**: Response is typed and property-accessible: `response.score`, `response.feedback`
- **FR-5.15**: Schema validation at runtime — malformed responses throw typed errors

### Streaming

- **FR-5.16**: `agent.stream('prompt')` returns an async iterable of events
- **FR-5.17**: Stream can be returned directly from a route handler as SSE response
- **FR-5.18**: Stream events include: text delta, tool call, tool result, completion
- **FR-5.19**: Vercel AI SDK data protocol support for frontend `useChat()` integration

### Conversation Memory

- **FR-5.20**: `RemembersConversations` mixin for automatic D1-backed persistence
- **FR-5.21**: `agent.forUser(user).prompt('...')` starts a new conversation
- **FR-5.22**: `agent.continue(conversationId).prompt('...')` continues an existing conversation
- **FR-5.23**: Conversation messages table with role, content, metadata columns
- **FR-5.24**: Manual conversation interface for custom storage backends

### Agent Middleware

- **FR-5.25**: Middleware classes with `handle(prompt, next)` pattern
- **FR-5.26**: Post-response hooks via `next(prompt).then(response => ...)`
- **FR-5.27**: Use cases: logging, rate limiting, caching, token counting

### Provider Abstraction

- **FR-5.28**: Cloudflare AI as first-class provider (runs on edge, no external API call)
- **FR-5.29**: Extensible provider interface for future providers (OpenAI, Anthropic direct)
- **FR-5.30**: Provider failover: `agent.prompt('...', { provider: [Provider.CloudflareAI, Provider.OpenAI] })`

### MCP Server (@roostjs/mcp)

- **FR-5.31**: `Server` base class with `@Name`, `@Version`, `@Instructions` decorators
- **FR-5.32**: `tools`, `resources`, `prompts` arrays on server class for registration
- **FR-5.33**: MCP `Tool` base class with `description()`, `schema()`, `outputSchema()`, `handle(request)` — mirroring @roostjs/ai tools but producing MCP Response objects
- **FR-5.34**: MCP `Resource` base class with `@Uri`, `@MimeType`, `@Description` decorators
- **FR-5.35**: Dynamic resources via `HasUriTemplate` interface with `{variable}` placeholders
- **FR-5.36**: MCP `Prompt` base class with typed arguments and message returns
- **FR-5.37**: `Response` factory: `Response.text()`, `Response.error()`, `Response.image()`, `Response.structured()`, `Response.notification()`
- **FR-5.38**: HTTP transport — server exposed at a route via `Mcp.web('/mcp/server', MyServer)`
- **FR-5.39**: SSE streaming for generator-based tool handlers
- **FR-5.40**: Tool annotations: `@IsReadOnly`, `@IsDestructive`, `@IsIdempotent`, `@IsOpenWorld`
- **FR-5.41**: `shouldRegister(request)` for dynamic capability gating
- **FR-5.42**: Request validation via Laravel-style `request.validate()` rules

### Shared Schema Builder

- **FR-5.43**: Single `JsonSchema` interface shared between @roostjs/ai tools, @roostjs/ai structured output, and @roostjs/mcp tools
- **FR-5.44**: Schema builder methods: `string()`, `integer()`, `number()`, `boolean()`, `object()`, `array()`, `enum()`, with `.required()`, `.default()`, `.description()`, `.min()`, `.max()` modifiers

### Testing (@roostjs/ai and @roostjs/mcp)

- **FR-5.45**: `Agent.fake()` prevents real API calls, returns canned responses
- **FR-5.46**: `Agent.fake(['response1', 'response2'])` queues multiple responses
- **FR-5.47**: `Agent.assertPrompted(text)` / `Agent.assertNeverPrompted()` assertions
- **FR-5.48**: Structured output fakes auto-generate valid data matching schema
- **FR-5.49**: `Server.tool(ToolClass, args)` invokes tool directly without HTTP for unit testing
- **FR-5.50**: Tool response assertions: `assertOk()`, `assertSee()`, `assertHasErrors()`

## Non-Functional Requirements

- **NFR-5.1**: Agent prompt-to-first-token latency determined by provider, not framework — framework overhead < 5ms
- **NFR-5.2**: Streaming SSE has no buffering delay — tokens forward immediately
- **NFR-5.3**: Conversation memory reads/writes add < 10ms overhead per turn
- **NFR-5.4**: MCP server responds to tool/list within 50ms
- **NFR-5.5**: Schema builder produces valid JSON Schema spec output

## Dependencies

### Prerequisites

- Phase 1 complete (Cloudflare AI binding, service container)
- Phase 2 complete (routing for MCP HTTP endpoints, SSE response support)

### Outputs for Next Phase

- Agent testing fakes/assertions pattern for Phase 9 testing utilities
- MCP server infrastructure for Phase 10 example apps
- Conversation memory for Phase 10 AI chat example
- Schema builder shared with Phase 7 Billing's subscription schema validation

## Acceptance Criteria

- [ ] An agent class with `@Model` and `@Provider` decorators prompts Cloudflare AI and returns a response
- [ ] A tool with typed schema receives validated input in its `handle()` method
- [ ] Structured output agent returns typed, property-accessible response matching schema
- [ ] `agent.stream()` returns SSE-compatible async iterable that can be returned from a route
- [ ] Conversation memory persists and continues across multiple `prompt()` calls
- [ ] Agent middleware intercepts prompts and post-processes responses
- [ ] Anonymous `agent()` function works for one-off prompts
- [ ] MCP server exposed at `/mcp/endpoint` responds to MCP protocol requests
- [ ] MCP tool receives validated input and returns structured response
- [ ] MCP resource returns content at its URI
- [ ] MCP prompt returns message array with correct roles
- [ ] Generator-based MCP tool streams via SSE
- [ ] `Agent.fake()` prevents real API calls in tests
- [ ] `Server.tool(MyTool, args)` tests a tool without HTTP
- [ ] Schema builder produces identical output whether used in @roostjs/ai or @roostjs/mcp
