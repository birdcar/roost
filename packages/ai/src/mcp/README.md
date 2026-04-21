# `@roostjs/ai/mcp`

Model Context Protocol client, agent, handler, and portal composition.

## Consume a remote MCP server

```ts
import { McpClient } from '@roostjs/ai/mcp';

const github = await McpClient.connect({
  url: 'https://mcp.github.com/mcp',
  transport: 'streamable-http',
  auth: { token: env.GITHUB_MCP_TOKEN },
});

const tools = await github.tools();
class Bug extends Agent {
  async tools() { return [...tools, new CustomTool()]; }
}
```

## Expose an agent as an MCP server

```ts
import { createMcpHandler } from '@roostjs/ai/mcp';

export default createMcpHandler(Bug, {
  transport: 'streamable-http',
  path: '/mcp',
  authorize: (req) => req.headers.get('Authorization') === `Bearer ${env.MCP_TOKEN}`,
});
```

The handler speaks `initialize`, `tools/list`, `tools/call`, `resources/list`,
`resources/read`, `prompts/list`, `prompts/get`.

## Compose portals

```ts
import { McpPortal } from '@roostjs/ai/mcp';

const portal = new McpPortal([
  { prefix: 'gh', client: github },
  { prefix: 'local', client: new McpAgent(Bug) },
]);

const aggregated = await portal.aggregatedTools();
const result = await portal.callTool('gh.search_code', { query: 'README' });
```

Prefixes are reserved; upstream tool names cannot contain `.`.

## Transports

- `streamable-http` (default, Workers-friendly)
- `sse` (degrades to streamable-http in Workers)
- `stdio` (dev/CLI only — throws in Workers)

## Tool adapter

```ts
import { toolFromMcp, mcpToolFromRoost } from '@roostjs/ai/mcp';

const roostTool = toolFromMcp(github, discovered);
const mcpDescriptor = mcpToolFromRoost(new LookupTool());
```

JSON Schema ↔ `SchemaBuilder` round-trips for `string`, `integer`, `number`,
`boolean`, `array`, and nested `object` shapes.
