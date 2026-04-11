# Audit: @roost/ai

## Status: CLEAN

## Exports verified
- `Agent`, `agent` (from `./agent.js`)
- `AgentInterface`, `HasTools`, `HasStructuredOutput` (types)
- `Provider`, `Model`, `MaxSteps`, `MaxTokens`, `Temperature`, `Timeout`, `getAgentConfig` (from `./decorators.js`)
- `Tool`, `ToolRequest` (types), `createToolRequest` (from `./tool.js`)
- `CloudflareAIProvider` (from `./providers/cloudflare.js`)
- `AIProvider` (type, from `./providers/interface.js`)
- `AiServiceProvider` (from `./provider.js`)
- `AgentConfig`, `AgentMessage`, `AgentResponse`, `ToolCall`, `ToolResult`, `StreamEvent` (types)

## Discrepancies found and fixed
None.

## Files modified
None

## Items requiring human review
- The reference doc documents a `ToolResult` type and `StreamEvent` type that are exported from `./types.js` but not mentioned in the docs. These are type-only exports and likely fine to omit from docs.
- The reference doc does not mention `createToolRequest` (the function export from `./tool.js`) or `getAgentConfig` (from `./decorators.js`). These are utility/internal exports and may be intentionally omitted.
- The concepts doc links to `/docs/packages/ai` but other cross-links use `/docs/reference/ai`. Consistency should be reviewed globally.
