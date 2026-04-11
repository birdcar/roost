# Audit: @roost/mcp

## Status: FIXED

## Exports verified
- `McpServer` (from `./server.js`)
- `McpTool` (from `./tool.js`)
- `McpResource` (from `./resource.js`)
- `McpPrompt` (from `./prompt.js`)
- `PromptArgument` (type, from `./prompt.js`)
- `McpResponse` (from `./response.js`)
- `createMcpRequest` (from `./request.js`)
- `McpRequest`, `McpResponseContent`, `McpToolDefinition`, `McpResourceDefinition`, `McpPromptDefinition` (types from `./types.js`)

## Discrepancies found and fixed
| File | Issue | Fix applied |
|------|-------|-------------|
| `apps/site/content/docs/reference/mcp.mdx` | `createMcpRequest` is exported but not documented at all | Added `createMcpRequest` section |
| `apps/site/content/docs/reference/mcp.mdx` | `PromptArgument` type is exported but not mentioned | Added to Types section |
| `apps/site/content/docs/reference/mcp.mdx` | Types section lists `ToolDefinition`, `ResourceDefinition`, `PromptDefinition` but actual exported type names are `McpToolDefinition`, `McpResourceDefinition`, `McpPromptDefinition` | Updated type names in the Types section |

## Files modified
- `apps/site/content/docs/reference/mcp.mdx`

## Items requiring human review
- None
