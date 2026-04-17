# Implementation Spec: Roost AI Redesign - Phase 7 (Workflows + Sub-agents + MCP)

**Contract**: ./contract.md
**Depends on**: Phase 1 (Foundation), Phase 2 (Stateful)
**Estimated Effort**: L

## Technical Approach

Phase 7 wires `StatefulAgent` into Cloudflare Workflows, ships typed sub-agent RPC, and delivers the MCP integration — both directions (consume remote servers via `McpClient`, expose agents as MCP servers via `createMcpHandler` + `McpAgent` + MCP portals).

**Workflows**: `@Workflow` method decorator transforms an agent method into a `WorkflowEntrypoint`-backed execution. Steps within the method use CF SDK's `step.do()`. The decorator generates a companion `WorkflowClient` the agent uses to trigger, monitor, and terminate runs. Compensation via `Compensable` from `@roostjs/workflow` is available.

**Sub-agents**: The CF Agents SDK exposes `subAgent()`, `abortSubAgent()`, `deleteSubAgent()` on the agent runtime. We wrap these with typed RPC — `this.subAgent(SummarizerAgent, { input })` returns a typed handle whose methods are proxied through the DO-to-DO RPC. The typing is critical: without it, sub-agents become stringly-typed and fragile.

**MCP client**: `McpClient` connects to a remote MCP server (stdio, HTTP, SSE, streamable HTTP). Auto-discovers tools, resources, prompts. Discovered tools adapt to `Tool` interface, injected into agents that opt-in. `McpAgent` reverses the flow: wraps an Agent as an MCP server, mapping its `tools()` to MCP tools, `messages()` to MCP prompts, `sessions` to MCP resources. `createMcpHandler(agent)` returns a fetch handler compatible with CF's MCP transport. MCP portals compose multiple remote servers behind a single endpoint — useful for aggregation.

## Feedback Strategy

**Inner-loop command**: `bun test packages/ai/__tests__/{workflows,sub-agents,mcp}/`

**Playground**: Test suite with mocked WorkflowEntrypoint + sub-agent DO stubs. For MCP, a fixture server using the reference `@modelcontextprotocol/sdk`.

**Why this approach**: Workflows + sub-agents are orchestration logic — pure unit testable with mocks. MCP needs a real server fixture for end-to-end, but the adapter code is unit-testable.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/src/workflows/workflow-method.ts` | `@Workflow()` decorator + entrypoint generation |
| `packages/ai/src/workflows/workflow-client.ts` | `AgentWorkflowClient` — typed wrapper over `@roostjs/workflow`'s `WorkflowClient` |
| `packages/ai/src/workflows/step-utils.ts` | Helpers for common agent-in-workflow patterns (multi-step reasoning, retry, branching) |
| `packages/ai/src/sub-agents/sub-agent.ts` | `subAgent()`, `abortSubAgent()`, `deleteSubAgent()` typed wrappers |
| `packages/ai/src/sub-agents/typed-rpc.ts` | Type-safe proxy for sub-agent RPC |
| `packages/ai/src/mcp/client.ts` | `McpClient` — consumes remote MCP servers |
| `packages/ai/src/mcp/transports/stdio.ts` | Stdio transport (dev/CLI; no-op in Workers) |
| `packages/ai/src/mcp/transports/streamable-http.ts` | Streamable HTTP transport (preferred for Workers) |
| `packages/ai/src/mcp/transports/sse.ts` | SSE transport |
| `packages/ai/src/mcp/tool-adapter.ts` | Adapts discovered MCP tools to Roost `Tool` interface |
| `packages/ai/src/mcp/agent.ts` | `McpAgent` — wraps an Agent as MCP server |
| `packages/ai/src/mcp/handler.ts` | `createMcpHandler(agent)` — returns fetch-compatible handler |
| `packages/ai/src/mcp/portal.ts` | `McpPortal` — composes multiple remote servers |
| `packages/ai/src/mcp/index.ts` | Subpath export |
| `packages/ai/__tests__/workflows/workflow-method.test.ts` | Decorator behavior + workflow entrypoint generation |
| `packages/ai/__tests__/workflows/workflow-client.test.ts` | Typed wrapper |
| `packages/ai/__tests__/sub-agents/sub-agent.test.ts` | Spawn, abort, delete, typed RPC |
| `packages/ai/__tests__/mcp/client.test.ts` | Connect, discover, call tool |
| `packages/ai/__tests__/mcp/tool-adapter.test.ts` | MCP → Roost Tool shape translation |
| `packages/ai/__tests__/mcp/agent.test.ts` | McpAgent exposes tools/prompts/resources correctly |
| `packages/ai/__tests__/mcp/handler.test.ts` | `createMcpHandler` responds to MCP protocol requests |
| `packages/ai/__tests__/mcp/portal.test.ts` | Multi-server aggregation |
| `packages/ai/__tests__/integration/workflows.miniflare.test.ts` | Real Workflow execution |
| `packages/ai/__tests__/integration/mcp.miniflare.test.ts` | MCP client ↔ server round-trip |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/src/stateful/agent.ts` | Add `this.subAgent()`, `this.workflow` (client instance), `this.mcpClient(url)` |
| `packages/ai/src/decorators.ts` | Add `@Workflow()`, `@WorkflowStep()`, `@SubAgentCapable()` |
| `packages/ai/src/provider.ts` | `AiServiceProvider` registers WorkflowClient factory + MCP portals config |
| `packages/ai/src/stateful/context.ts` | `getCurrentAgent()` also accessible inside workflow steps |
| `packages/ai/src/tool.ts` | `Tool.fromMcp(mcpTool)` factory for adapters |
| `packages/ai/package.json` | Add `@modelcontextprotocol/sdk` dep; add `./mcp` subpath |

## Implementation Details

### 1. @Workflow Method Decorator

**Pattern to follow**: `packages/workflow/src/` class patterns; CF Workflows `WorkflowEntrypoint` abstract.

**Overview**: Method decorator turns an agent method into a durable workflow. The runtime generates a companion `WorkflowEntrypoint` class + binding, and the decorated method delegates to the workflow client.

```typescript
// packages/ai/src/workflows/workflow-method.ts
export function Workflow(opts?: { binding?: string; name?: string }) {
  return function (target: StatefulAgent, key: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    const bindingName = opts?.binding ?? `${target.constructor.name.toUpperCase()}_${key.toUpperCase()}`;

    descriptor.value = async function (this: StatefulAgent, ...args: unknown[]) {
      const client = this.workflows.get(bindingName);
      const handle = await client.create({ params: { method: key, args } });
      return { workflowId: handle.id, status: () => handle.status() };
    };

    // Register entrypoint class with the agent registry so wrangler.toml can be generated
    workflowEntrypointRegistry.register(target.constructor, key, bindingName, original);
  };
}
```

Companion `AgentMethodWorkflow` class: when CF invokes the workflow, it looks up the original method and calls it with `step` as an injected first arg so the method can do `step.do('embed', ...)`.

**Key decisions**:
- Decorator rewrites the method so callers don't know it's async-durable.
- Workflow binding name auto-derived; overridable.
- Workflow entrypoint class generated dynamically at module load.
- `step` injected as the first arg when called inside workflow context; invisible from caller's perspective.

**Implementation steps**:
1. Implement decorator registering entrypoint metadata.
2. Implement `AgentMethodWorkflow` extending `WorkflowEntrypoint`; its `run(event, step)` looks up original method + invokes with step injected via symbol.
3. Implement `AgentWorkflowClient` exposing `create`, `get`, `terminate`, `list`.
4. Document wrangler.toml pattern: one workflow binding per `@Workflow()` method (CLI support deferred).

**Feedback loop**: `bun test packages/ai/__tests__/workflows/`

### 2. Typed Sub-Agent RPC

**Pattern to follow**: CF SDK `subAgent` + TypeScript proxy tricks.

**Overview**: `this.subAgent(SummarizerAgent, init)` returns a handle whose surface mirrors `SummarizerAgent`'s public methods. All calls are forwarded via DO-to-DO RPC.

```typescript
// packages/ai/src/sub-agents/sub-agent.ts
export type SubAgentHandle<A extends StatefulAgent> = {
  readonly id: string;
  abort(): Promise<void>;
  delete(): Promise<void>;
} & {
  [K in PublicMethodsOf<A>]: A[K] extends (...args: infer P) => infer R
    ? (...args: P) => R extends Promise<any> ? R : Promise<R>
    : never;
};

export function subAgent<A extends StatefulAgent>(
  parent: StatefulAgent,
  AgentClass: new (...args: any[]) => A,
  init?: { namespace?: string; args?: ConstructorParameters<typeof AgentClass> },
): SubAgentHandle<A> {
  const handle = parent.sdk.subAgent(AgentClass.name, init);  // CF SDK primitive
  return new Proxy(handle, {
    get(target, prop) {
      if (prop === 'id' || prop === 'abort' || prop === 'delete') return target[prop];
      if (typeof prop !== 'string') return undefined;
      return (...args: unknown[]) => target.call(prop, args);
    },
  }) as SubAgentHandle<A>;
}
```

**Key decisions**:
- Proxy-based forwarding; no code-gen.
- Public-method type extraction via mapped types.
- `init.namespace` supports multiple sub-agents of the same type per parent.

**Implementation steps**:
1. Implement Proxy wrapper.
2. Implement `abort()` / `delete()` forwarding to CF SDK primitives.
3. Add `this.subAgent()` on `StatefulAgent` as convenience.
4. Type-test file exercising `SubAgentHandle<A>` with various agent shapes.

**Feedback loop**: `bun test packages/ai/__tests__/sub-agents/`

### 3. MCP Client

**Pattern to follow**: `@modelcontextprotocol/sdk`'s `Client` class.

**Overview**: `McpClient` connects to a remote server, discovers capabilities, and exposes them as Roost-shaped primitives.

```typescript
// packages/ai/src/mcp/client.ts
export class McpClient {
  static async connect(opts: { url: string; transport?: 'http' | 'sse' | 'streamable-http'; auth?: { token: string } }): Promise<McpClient> { /* ... */ }

  async tools(): Promise<Tool[]> { /* maps discovered tools via tool-adapter */ }
  async prompts(): Promise<McpDiscoveredPrompt[]> { /* ... */ }
  async resources(): Promise<McpDiscoveredResource[]> { /* ... */ }
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> { /* ... */ }
  async readResource(uri: string): Promise<McpResourceContent> { /* ... */ }
  async close(): Promise<void> { /* ... */ }
}
```

Adapted tools can be injected into any Agent:

```typescript
const github = await McpClient.connect({ url: 'https://mcp.github.com' });
class BugAgent extends Agent {
  async tools() { return [...await github.tools(), new CustomTool()]; }
}
```

**Implementation steps**:
1. Implement transport layer (streamable-http preferred in Workers).
2. Implement client bootstrapping (capability exchange).
3. Implement tool adapter converting MCP tool schema → Roost `Tool` interface.
4. Implement prompt/resource discovery methods.

**Feedback loop**: `bun test packages/ai/__tests__/mcp/client.test.ts`

### 4. MCP Tool Adapter

**Overview**: Bidirectional adapter between MCP tool format and Roost `Tool`.

```typescript
// packages/ai/src/mcp/tool-adapter.ts
export function toolFromMcp(client: McpClient, mcpTool: McpToolDescriptor): Tool {
  return {
    name() { return mcpTool.name; },
    description() { return mcpTool.description ?? ''; },
    schema(s) {
      return jsonSchemaToBuilder(mcpTool.inputSchema);
    },
    async handle(request) {
      const result = await client.callTool(mcpTool.name, request as unknown as Record<string, unknown>);
      return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    },
  };
}

export function mcpToolFromRoost(tool: Tool): McpToolDescriptor {
  return {
    name: tool.name?.() ?? tool.constructor.name,
    description: tool.description(),
    inputSchema: toolToProviderTool(tool).parameters,  // already JSON Schema
  };
}
```

**Implementation steps**:
1. Implement JSON Schema → SchemaBuilder converter (lightweight; handle the subset Roost uses).
2. Implement Tool → MCP descriptor conversion using existing `toolToProviderTool`.

### 5. McpAgent

**Overview**: Wraps an Agent class as an MCP server. Its tools become MCP tools; its Sessions become MCP resources; its prompts become MCP prompts.

```typescript
// packages/ai/src/mcp/agent.ts
export class McpAgent<A extends Agent> {
  constructor(private AgentClass: new (...args: any[]) => A) {}

  exposedTools(): McpToolDescriptor[] {
    const instance = new this.AgentClass();
    const tools = (instance as unknown as HasTools).tools?.() ?? [];
    return tools.map(mcpToolFromRoost);
  }

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<McpToolResult> { /* ... */ }

  async handleListResources(): Promise<McpResourceDescriptor[]> { /* if StatefulAgent with Sessions, enumerate convs */ }
}
```

**Implementation steps**:
1. Implement exposed-tools discovery.
2. Implement resource exposure (Sessions / RAG data).
3. Implement prompt exposure (predefined prompts from agent).

### 6. createMcpHandler

**Overview**: Returns a fetch handler implementing MCP protocol that can be registered at any route.

```typescript
// packages/ai/src/mcp/handler.ts
export function createMcpHandler<A extends Agent>(
  AgentClass: new (...args: any[]) => A,
  opts?: { transport?: 'streamable-http' | 'sse' | 'http'; path?: string },
): ExportedHandler<Env> {
  const mcpAgent = new McpAgent(AgentClass);
  return {
    async fetch(req, env, ctx) {
      // Decode MCP request, route to mcpAgent methods
      // Encode MCP response with the configured transport
    },
  };
}
```

Usage:
```typescript
export default createMcpHandler(BugAgent, { transport: 'streamable-http', path: '/mcp' });
```

**Implementation steps**:
1. Implement MCP request decoder (JSON-RPC over HTTP/SSE).
2. Implement method router: `tools/list`, `tools/call`, `resources/list`, etc.
3. Implement response encoder per transport.

### 7. McpPortal (Server Composition)

**Overview**: Combines multiple remote MCP servers (or McpAgents) behind a single endpoint. Useful for aggregating tools across vendors.

```typescript
// packages/ai/src/mcp/portal.ts
export class McpPortal {
  constructor(private servers: Array<{ prefix: string; client: McpClient | McpAgent }>) {}

  createHandler(): ExportedHandler<Env> { /* ... */ }

  async aggregatedTools(): Promise<Tool[]> {
    const all: Tool[] = [];
    for (const { prefix, client } of this.servers) {
      const tools = client instanceof McpClient ? await client.tools() : client.exposedTools().map(/* ... */);
      all.push(...tools.map(t => renameTool(t, `${prefix}.${t.name?.() ?? ''}`)));
    }
    return all;
  }
}
```

**Implementation steps**:
1. Implement portal with prefix-namespaced routing.
2. Implement tool name prefixing to prevent collisions.
3. Document config: `ai.mcp.portals` array in user's `config/ai.ts`.

**Feedback loop**: `bun test packages/ai/__tests__/mcp/portal.test.ts`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `workflows/workflow-method.test.ts` | `@Workflow()` rewrites method; entrypoint class generated; step injection |
| `workflows/workflow-client.test.ts` | create/get/terminate; handle.status() |
| `sub-agents/sub-agent.test.ts` | Proxy forwards method calls; abort+delete invoke SDK primitives; typed RPC |
| `mcp/client.test.ts` | Connect/close; tools/list; tool call; error propagation |
| `mcp/tool-adapter.test.ts` | JSON Schema ↔ SchemaBuilder round-trip for common shapes |
| `mcp/agent.test.ts` | Exposed tools match agent.tools(); Sessions as resources |
| `mcp/handler.test.ts` | Full MCP request/response cycle for each method |
| `mcp/portal.test.ts` | Multi-server aggregation; prefix namespacing |

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `integration/workflows.miniflare.test.ts` | Real workflow: `@Workflow` method runs with 3 steps, one retry, final result |
| `integration/mcp.miniflare.test.ts` | Fixture MCP server; client connects, calls tool, retrieves resource |
| `integration/sub-agents.miniflare.test.ts` | Parent spawns 2 sub-agents, collects responses via typed RPC |

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| `@Workflow` on a non-StatefulAgent | Compile-time error via type constraint |
| Sub-agent spawn fails | Surface `SubAgentSpawnError`; parent can retry or abort |
| Sub-agent method not on target class | Type error where possible; runtime `MethodNotFoundError` |
| MCP server unreachable | Retry with backoff; after N, throw `McpConnectionError` |
| MCP tool call returns error content | Surface to agent with `isError: true` flag in tool result |
| MCP schema malformed | Log + skip discovery for that tool |
| Portal prefix collision with tool name containing dot | Reserve `.` for prefix; warn on user-defined names with dot |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Workflow | Step compensation partial fail | Rollback step throws | Inconsistent state | Log + continue compensation; final error aggregates |
| Workflow | Re-execution determinism | Method uses `Math.random`/`Date.now` | Non-determinism breaks resume | Document: use `step.do()` for all non-deterministic ops |
| Sub-agent | Circular spawn | Agent A spawns B, B spawns A | Resource exhaustion | Cap depth (default 5); configurable |
| Sub-agent | Zombie sub-agents | Parent dies without cleanup | Storage leak | Sub-agents auto-expire after parent's DO eviction window |
| McpClient | Stale session | Server restarted | Tool calls fail | Auto-reconnect on 401/404 session errors |
| McpAgent | Exposed Sessions leak PII | Resources contain user data | Privacy risk | Explicit opt-in per resource type; default hide Sessions |
| McpHandler | Request smuggling | Untrusted transport | Possible impersonation | Require token auth unless explicitly disabled |
| Portal | Latency multiplier | Aggregation serial | Slow tool list | Parallel fetch; cache discovery for TTL (default 5m) |

## Validation Commands

```bash
bun run --filter @roostjs/ai typecheck
bun test packages/ai/__tests__/workflows/
bun test packages/ai/__tests__/sub-agents/
bun test packages/ai/__tests__/mcp/
bun test packages/ai/__tests__/integration/workflows.miniflare.test.ts
bun test packages/ai/__tests__/integration/mcp.miniflare.test.ts
```

## Rollout Considerations

- **Deps**: `@modelcontextprotocol/sdk` added as dependency (pinned).
- **wrangler.toml**: Users need to declare Workflow bindings for each `@Workflow()` method. CLI generator is future work; documented manually here.
- **Rollback**: Opt-in; non-workflow agents unaffected.

## Open Items

- [ ] Confirm CF SDK's sub-agent API shape — if not exactly `subAgent/abortSubAgent/deleteSubAgent`, adapt names.
- [ ] Workflow binding auto-generation CLI — defer or stub a README with manual steps.
- [ ] MCP transport default — lean toward streamable-http for Workers.
