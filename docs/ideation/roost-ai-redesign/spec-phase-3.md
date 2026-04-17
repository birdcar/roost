# Implementation Spec: Roost AI Redesign - Phase 3 (Streaming + Realtime + React Client)

**Contract**: ./contract.md
**Depends on**: Phase 1 (Foundation), Phase 2 (Stateful)
**Estimated Effort**: L

## Technical Approach

Phase 3 replaces the stub streaming implementation with real provider-backed streaming, adds the Vercel AI SDK protocol, layers WebSocket transport on top of `@roostjs/broadcast`'s Durable Object infrastructure (which already handles hibernation + auth), bridges `@roostjs/broadcast`'s event channels to agent responses, and ships the `@roostjs/ai/client` React SDK with `useAgent`, `useAgentState`, `useAgentStream` hooks.

The streaming surface has three protocols: (1) native SSE emitting `text-delta` / `tool-call` / `tool-result` / `done` events, (2) Vercel AI SDK stream protocol via `.usingVercelDataProtocol()` so consumers can drop in `@ai-sdk/react`'s `useChat`, (3) binary-frame WebSocket for bidirectional streaming from browsers (required for realtime voice in P8 but shipped here).

WebSocket transport reuses `@roostjs/broadcast`'s `ChannelDO` — each `StatefulAgent` gets its own `AgentChannel` scoped to the agent's ID. The React client SDK mirrors CF's React hooks (`useAgent`, `useAgentState`) but wraps them in Roost-shaped providers and ensures SSR compatibility with TanStack Start. State sync flows through `ChannelDO` presence events.

Broadcasting integration: `broadcast(event)`, `broadcastNow(event)`, and `broadcastOnQueue(queueName)` on `AgentResponse` push updates via `@roostjs/broadcast`'s `BroadcastManager`. `StreamableAgentResponse` can be returned from a TanStack Start server function and auto-adapts to SSE.

## Feedback Strategy

**Inner-loop command**: `bun test packages/ai/__tests__/streaming/`

**Playground**: Test suite for pure streaming logic + a miniflare harness for WS. For React hooks, set up a Vitest + React Testing Library suite with mocked EventSource/WebSocket.

**Why this approach**: Stream parsing and protocol translation are pure logic (fast unit tests). WS lifecycle needs miniflare. React hooks need jsdom + RTL.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/src/streaming/sse.ts` | SSE encoder/decoder; native `StreamEvent` format |
| `packages/ai/src/streaming/vercel.ts` | Vercel AI SDK data protocol encoder |
| `packages/ai/src/streaming/websocket.ts` | WS frame encoder (binary + JSON) |
| `packages/ai/src/streaming/streamable-response.ts` | `StreamableAgentResponse` full implementation (replaces P1 stub) |
| `packages/ai/src/streaming/agent-channel.ts` | DO extending `ChannelDO` for agent-scoped WS |
| `packages/ai/src/streaming/broadcast-bridge.ts` | `broadcast()`, `broadcastNow()`, `broadcastOnQueue()` on response |
| `packages/ai/src/client/index.ts` | React SDK subpath entrypoint |
| `packages/ai/src/client/use-agent.tsx` | `useAgent(agentName, opts?)` hook |
| `packages/ai/src/client/use-agent-state.tsx` | `useAgentState()` hook with bidirectional sync |
| `packages/ai/src/client/use-agent-stream.tsx` | `useAgentStream(agentName, input)` hook |
| `packages/ai/src/client/provider.tsx` | `<RoostAgentProvider>` top-level provider (endpoint, auth) |
| `packages/ai/src/client/transport.ts` | Transport abstraction (EventSource for SSE, WebSocket for realtime) |
| `packages/ai/src/client/ssr.ts` | SSR shims for TanStack Start |
| `packages/ai/__tests__/streaming/sse.test.ts` | SSE encode/decode round-trip |
| `packages/ai/__tests__/streaming/vercel.test.ts` | Vercel protocol frames |
| `packages/ai/__tests__/streaming/streamable-response.test.ts` | then() hook timing, iteration |
| `packages/ai/__tests__/streaming/agent-channel.test.ts` | DO lifecycle, hibernation |
| `packages/ai/__tests__/streaming/broadcast-bridge.test.ts` | broadcast* methods invoke BroadcastManager correctly |
| `packages/ai/__tests__/client/use-agent.test.tsx` | React hook behavior |
| `packages/ai/__tests__/client/use-agent-stream.test.tsx` | Stream consumption hook |
| `packages/ai/__tests__/integration/streaming.miniflare.test.ts` | Integration: SSE end-to-end, WS reconnect, hibernation |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/src/agent.ts` | `stream()` delegates to new `StreamableAgentResponse`, supports providers' native streaming |
| `packages/ai/src/stateful/agent.ts` | `onConnect`/`onMessage` route through `AgentChannel` |
| `packages/ai/src/providers/workers-ai.ts` | Implement `stream()` against Workers AI streaming response |
| `packages/ai/src/providers/anthropic.ts` | Implement `stream()` against Anthropic SSE |
| `packages/ai/src/providers/openai.ts` | Implement `stream()` against OpenAI SSE |
| `packages/ai/src/providers/gemini.ts` | Implement `stream()` against Gemini streaming |
| `packages/ai/src/events.ts` | Add `StreamingAgent`, `AgentStreamed` events |
| `packages/ai/package.json` | Add `react` + `@types/react` peer deps for `/client` subpath |

## Implementation Details

### 1. SSE Encoder + Native StreamEvent

**Pattern to follow**: `packages/ai/src/agent.ts` current stream method (replaces stub).

**Overview**: Native protocol — `data: {JSON}\n\n` lines where JSON has `type` field.

```typescript
// packages/ai/src/streaming/sse.ts
export type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; content: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done' };

export function encodeSSE(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function* decodeSSE(stream: ReadableStream<Uint8Array>): AsyncIterable<StreamEvent> {
  // Parse SSE frames incrementally, yield decoded events
}
```

**Feedback loop**: `bun test packages/ai/__tests__/streaming/sse.test.ts`

### 2. Vercel AI SDK Protocol

**Overview**: Translates native `StreamEvent` to Vercel's data-stream-protocol so Vercel's `useChat` hook works out of the box.

Protocol frames: `0:"text delta"`, `9:{"toolCallId","toolName","args"}`, `a:{"toolCallId","result"}`, `d:{"finishReason","usage"}`, etc.

```typescript
// packages/ai/src/streaming/vercel.ts
export function toVercelProtocol(event: StreamEvent): Uint8Array {
  switch (event.type) {
    case 'text-delta': return encode(`0:${JSON.stringify(event.text)}\n`);
    case 'tool-call': return encode(`9:${JSON.stringify({ toolCallId: event.id, toolName: event.name, args: event.arguments })}\n`);
    // ...
  }
}
```

**Feedback loop**: `bun test packages/ai/__tests__/streaming/vercel.test.ts`

### 3. StreamableAgentResponse

**Overview**: Return type of `Agent.stream()`. Implements `Response` (for TanStack Start), `AsyncIterable<StreamEvent>`, and chainable `.then(callback)`, `.usingVercelDataProtocol()`, `.withHeaders()`.

```typescript
// packages/ai/src/streaming/streamable-response.ts
export class StreamableAgentResponse {
  constructor(
    private events: AsyncIterable<StreamEvent>,
    private protocol: 'native' | 'vercel' = 'native',
  ) {}

  usingVercelDataProtocol(): this {
    this.protocol = 'vercel';
    return this;
  }

  then(fn: (response: StreamedAgentResponse) => void | Promise<void>): this {
    this.thenHooks.push(fn);
    return this;
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> { return this.events[Symbol.asyncIterator](); }

  async toResponse(): Promise<Response> {
    const encoder = this.protocol === 'vercel' ? toVercelProtocol : encodeSSE;
    const collected: StreamEvent[] = [];
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        for await (const evt of this.events) {
          collected.push(evt);
          controller.enqueue(encoder(evt));
        }
        controller.close();
        // invoke `then` hooks with the collected `StreamedAgentResponse`
        const final = buildStreamedResponse(collected);
        for (const hook of this.thenHooks) await hook(final);
      },
    });
    return new Response(stream, { headers: this.streamHeaders() });
  }
}
```

**Implementation steps**:
1. Implement native + Vercel encoders.
2. Implement `then()` deferred hook.
3. Implement `toResponse()` for TanStack Start compatibility.
4. Collect stream for `StreamedAgentResponse` (text, events, usage) passed to `then()` callbacks.

**Feedback loop**: `bun test packages/ai/__tests__/streaming/streamable-response.test.ts`

### 4. Provider Streaming Implementations

**Overview**: Each provider implements `stream()` returning `AsyncIterable<StreamEvent>`.

**Pattern to follow**: Provider's own streaming API docs.

```typescript
// packages/ai/src/providers/anthropic.ts (partial)
async *stream(request: ProviderRequest): AsyncIterable<StreamEvent> {
  const response = await fetch(this.url, { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ ...toAnthropic(request), stream: true }) });
  for await (const line of iterateSSE(response.body!)) {
    const evt = parseAnthropicEvent(line);
    if (evt) yield translate(evt);  // translate to our StreamEvent
  }
}
```

**Implementation steps**:
1. Workers AI: call AIClient.run with `stream: true`; binding returns ReadableStream.
2. Anthropic: parse Anthropic's SSE event types (`message_start`, `content_block_delta`, `message_delta`, `message_stop`).
3. OpenAI: parse `data: {chunk}` with OpenAI's delta shape.
4. Gemini: parse Gemini's streaming JSON chunks.

**Feedback loop**: `bun test packages/ai/__tests__/providers/*streaming*.test.ts`

### 5. WebSocket Transport via AgentChannel

**Pattern to follow**: `packages/broadcast/src/channel-do.ts`

**Overview**: Each `StatefulAgent` optionally has a companion `AgentChannel` DO that manages WS clients. Agent push updates; clients send prompts back.

```typescript
// packages/ai/src/streaming/agent-channel.ts
import { ChannelDO } from '@roostjs/broadcast';

export class AgentChannel extends ChannelDO {
  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    if (typeof message === 'string') {
      const parsed = JSON.parse(message);
      if (parsed.type === 'prompt') {
        // Forward to the associated StatefulAgent
        const agent = await this.getAgent(parsed.agentId);
        for await (const evt of agent.stream(parsed.input)) {
          connection.send(JSON.stringify(evt));
        }
      }
    }
  }
}
```

**Key decisions**:
- Reuse `@roostjs/broadcast`'s hibernation — zero idle cost.
- Authorize via `authorize()` override (private channel for `user:{id}`).

**Implementation steps**:
1. Subclass `ChannelDO`.
2. Route prompts from WS into agent.stream().
3. Handle disconnect: no cleanup needed (hibernation handles it).

**Feedback loop**: `bun test packages/ai/__tests__/streaming/agent-channel.test.ts`

### 6. Broadcast Bridge

**Pattern to follow**: Laravel `$event->broadcast($channel)`.

**Overview**: Adds `.broadcast(channel)`, `.broadcastNow(channel)`, `.broadcastOnQueue(queueName, channel)` to `StreamEvent` or `AgentResponse`.

```typescript
// packages/ai/src/streaming/broadcast-bridge.ts
export function withBroadcast<T extends StreamEvent>(event: T): T & {
  broadcast(channel: Channel): Promise<void>;
  broadcastNow(channel: Channel): Promise<void>;
  broadcastOnQueue(queue: string, channel: Channel): Promise<void>;
} {
  return Object.assign(event, {
    broadcast: (c: Channel) => BroadcastManager.get().broadcast(c, 'ai.stream', event),
    broadcastNow: (c: Channel) => BroadcastManager.get().broadcastNow(c, 'ai.stream', event),
    broadcastOnQueue: (q: string, c: Channel) => Dispatcher.dispatch(q, { channel: c, event }),
  });
}

// On StreamableAgentResponse:
export function streamingBroadcast(resp: StreamableAgentResponse, channel: Channel): Promise<void> {
  for await (const evt of resp) await BroadcastManager.get().broadcast(channel, 'ai.stream', evt);
}
```

Also `Agent.broadcastOnQueue(input, channel)` queues the full prompt + streams to channel from the background worker.

**Implementation steps**:
1. Wire `BroadcastManager` + `Dispatcher` resolution from container.
2. Ship integration tests with `BroadcastFake`.

**Feedback loop**: `bun test packages/ai/__tests__/streaming/broadcast-bridge.test.ts`

### 7. React Client SDK

**Pattern to follow**: CF Agents SDK React hooks; keep API similar for mindshare.

**Overview**: Four exports — `<RoostAgentProvider>`, `useAgent`, `useAgentState`, `useAgentStream`.

```typescript
// packages/ai/src/client/use-agent.tsx
export function useAgent<TAgent extends AgentShape = AgentShape>(
  agentName: string,
  opts?: { transport?: 'sse' | 'websocket'; auth?: { token: string } }
) {
  const ctx = useContext(RoostAgentContext);
  const [state, setState] = useState<AgentStateSnapshot>({ status: 'idle' });
  const prompt = useCallback(async (input: string) => { /* ... */ }, [agentName, ctx]);
  return { prompt, state, connected: state.status === 'connected' };
}

// useAgentState — bidirectional sync of a JSON slice from the agent DO
export function useAgentState<T>(agentName: string, key: string): [T | undefined, (value: T) => void];

// useAgentStream — iterate stream events as they arrive
export function useAgentStream(agentName: string, input: string | null): {
  events: StreamEvent[];
  isStreaming: boolean;
  error: Error | null;
};
```

**Key decisions**:
- SSR-safe: hooks return initial state matching server snapshot; resubscribe on hydration.
- Transport chosen automatically: SSE for one-shot, WS for long-lived state sync.
- Auth via `RoostAgentProvider` token or per-hook override.

**Implementation steps**:
1. Provider context.
2. Transport abstraction (SSE + WS classes).
3. Three hooks.
4. SSR shim for TanStack Start.

**Feedback loop**:
- Playground: Vitest + jsdom + React Testing Library.
- Experiment: render with mocked `EventSource`, dispatch events, assert state transitions.
- Check: `bun test packages/ai/__tests__/client/`

## API Design

### Server-side streaming endpoint (example pattern)

```typescript
// User code
app.route('/agents/:name/stream', async (req) => {
  const agent = new SupportAgent();
  return agent.stream(req.body.input).toResponse();  // auto-SSE
});
```

### Client consumption

```tsx
function Chat() {
  const { events, isStreaming } = useAgentStream('support', input);
  return <>{events.map(e => e.type === 'text-delta' && <span>{e.text}</span>)}</>;
}
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `streaming/sse.test.ts` | Encode/decode round-trip for all event types |
| `streaming/vercel.test.ts` | All Vercel protocol frame types |
| `streaming/streamable-response.test.ts` | `.then()` timing, iteration, toResponse |
| `streaming/agent-channel.test.ts` | WS lifecycle, prompt routing, disconnect |
| `streaming/broadcast-bridge.test.ts` | broadcast/broadcastNow/broadcastOnQueue invocations |
| `client/use-agent.test.tsx` | SSE/WS hook state transitions |
| `client/use-agent-stream.test.tsx` | Event accumulation, isStreaming flag, error path |
| `providers/*streaming*.test.ts` | Per-provider stream parsing |

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `integration/streaming.miniflare.test.ts` | SSE end-to-end with real provider mock; WS reconnect after DO eviction; hibernation wake |

**Key scenarios**:
- Stream 100 `text-delta` events → `StreamedAgentResponse.text` equals concatenation
- Vercel protocol: send raw stream to `@ai-sdk/react`'s decoder → frames parse correctly
- WS reconnect: kill connection mid-stream → client reconnects, resumes from last event seq
- `.then()` fires after all events and before `toResponse()` stream closes

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Provider stream interrupted | Emit `error` event; client-side transport retries per exponential backoff |
| Client disconnect mid-stream | Agent continues; events drop-on-floor unless RemembersConversations persists |
| Vercel protocol version mismatch | Emit native events; expose `.protocolVersion()` for inspection |
| SSR hydration mismatch | Use `useSyncExternalStore` for hook state |
| WS origin blocked | Surface as typed `OriginNotAllowedError` with hint to configure |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| StreamableAgentResponse | `then()` fires before stream closes | User reads `response.text` before it's done | Empty text | Document: `then()` receives fully-collected response |
| AgentChannel | WS flood | Malicious client | DO CPU saturation | Rate-limit per connection using existing `ChannelDO` guards |
| useAgent | Stale auth token | Token expiry mid-session | 401 on prompt | Provider auto-refreshes via `auth.refresh` callback |
| useAgentStream | Events buffer unbounded | Long session | Browser memory bloat | Cap buffer at 10k events; caller can slice |
| Provider streaming | Upstream SSE with bad JSON | Malformed chunk | Event dropped silently | Log + emit `error` event; continue |
| Broadcast bridge | BroadcastManager not registered | Missing `BroadcastServiceProvider` | Throw at call | AiServiceProvider boot checks + warns |

## Validation Commands

```bash
bun run --filter @roostjs/ai typecheck
bun test packages/ai/__tests__/streaming/
bun test packages/ai/__tests__/client/
bun test packages/ai/__tests__/integration/streaming.miniflare.test.ts
```

## Rollout Considerations

- **Peer deps**: React becomes a peer dep; document installation if `@roostjs/ai/client` is used.
- **Bundle size**: Client SDK separate subpath — server code never pulls React.
- **Feature flag**: None.
- **Rollback**: Streaming opt-in; non-streaming `prompt()` unaffected.

## Open Items

- [ ] Decide whether to ship a compat adapter for `@ai-sdk/react`'s `useChat` or only recommend Vercel protocol + their hook.
- [ ] Confirm CF SDK's WS hibernation plays nicely with `@roostjs/broadcast`'s `ChannelDO` — if not, invert: broadcast consumes CF Agents WS.
