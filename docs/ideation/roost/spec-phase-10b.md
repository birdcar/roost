# Spec: AI Chat App (examples/ai-chat)

**Template**: ./spec-template-example-app.md
**Contract**: ./contract.md
**PRD**: ./prd-phase-10.md
**Estimated Effort**: M

## Inputs

- App name: `ai-chat`
- Scaffold flags: `--with-ai`
- Primary packages: @roost/core, @roost/auth, @roost/orm, @roost/ai, @roost/mcp, @roost/cloudflare

## Models

| Model | Columns | Relationships |
|---|---|---|
| `Conversation` | id, title, userId, createdAt, updatedAt | hasMany(Message) |
| `Message` | id, conversationId, role (user/assistant), content, metadata (JSON), createdAt | belongsTo(Conversation) |

## Agent Definition

```typescript
// app/agents/chat-assistant.ts
@Provider(Provider.CloudflareAI)
@Model('@cf/meta/llama-3.1-70b-instruct')
@MaxSteps(5)
class ChatAssistant implements Agent, HasTools, Conversational {
  use Promptable, RemembersConversations;

  instructions() {
    return 'You are a helpful assistant. Use available tools when the user asks for calculations or current information.';
  }

  tools() {
    return [new Calculator(), new CurrentTime()];
  }
}
```

## Tools

| Tool | Description | Schema |
|---|---|---|
| `Calculator` | Evaluates math expressions | `{ expression: string }` → `{ result: number }` |
| `CurrentTime` | Returns current UTC time | `{}` → `{ time: string, timezone: string }` |

## MCP Server

```typescript
// app/mcp/chat-server.ts
@Name('Chat History Server')
@Version('1.0.0')
@Instructions('Provides access to user chat history')
class ChatServer extends Server {
  tools = [];
  resources = [ConversationListResource, ConversationResource];
  prompts = [SummarizeChatPrompt];
}
```

- `ConversationListResource` — lists all conversations for the authenticated user
- `ConversationResource` — dynamic URI template `chat://conversations/{conversationId}` returns full message history
- `SummarizeChatPrompt` — returns a prompt asking the AI to summarize a conversation

## Routes

| Route File | Path | Purpose |
|---|---|---|
| `app/routes/index.tsx` | `/` | Redirect to /chat |
| `app/routes/chat.tsx` | `/chat` | New conversation + conversation list sidebar |
| `app/routes/chat.$conversationId.tsx` | `/chat/:id` | Existing conversation with streaming messages |
| `app/routes/api/chat.ts` | `/api/chat` | POST endpoint for sending messages (returns SSE stream) |

## Key Implementation Details

- **Streaming**: POST to `/api/chat` returns SSE stream. Frontend uses event source or fetch+reader to display tokens in real-time.
- **Conversation persistence**: `RemembersConversations` mixin stores messages in D1 automatically.
- **Tool calls**: Agent decides when to use Calculator or CurrentTime. Tool results appear in the chat UI.
- **Structured output example**: A "summarize" endpoint uses HasStructuredOutput to return `{ summary: string, topics: string[], sentiment: string }`.
- **MCP server**: Exposed at `/mcp/chat` via `Mcp.web()`. Allows external AI clients to access chat history.

## Deviations from Template

- SSE streaming requires special route handling — the `/api/chat` route returns `agent.stream()` directly.
- MCP server adds a second "server" within the app (the app itself AND the MCP endpoint).
- Frontend needs a chat UI component with message bubbles, typing indicator, and tool call display.

## Tests

| Test | What it covers |
|---|---|
| Send message and get response | Agent.fake() returns canned response |
| Conversation persists across reloads | D1 storage, loader fetches history |
| Tool call appears in response | Agent.fake with tool call events |
| MCP server lists conversations | Server.tool() direct invocation |
| MCP resource returns conversation | Dynamic URI template resolution |
| Structured output summary | HasStructuredOutput schema validation |
| Unauthenticated user cannot access chat | Auth middleware |
