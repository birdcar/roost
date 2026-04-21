# `@roostjs/ai/client`

React hooks + transports for talking to Roost agents from the browser.

## Setup

```tsx
import { RoostAgentProvider } from '@roostjs/ai/client';

function App() {
  return (
    <RoostAgentProvider endpoint="/api/agents" auth={{ token: userToken }}>
      <Chat />
    </RoostAgentProvider>
  );
}
```

## `useAgent(name, options?)`

```tsx
import { useAgent } from '@roostjs/ai/client';

function Chat() {
  const { state, prompt, reset, connected } = useAgent('support');

  return (
    <>
      <textarea value={state.text} readOnly />
      <button disabled={state.status === 'streaming'} onClick={() => prompt('hi')}>
        Send
      </button>
      <button onClick={reset}>Reset</button>
    </>
  );
}
```

State transitions: `idle → streaming → done | error`.

## `useAgentStream(name, input, options?)`

One-shot streaming hook — re-fires when `input` changes.

```tsx
const { events, isStreaming, text, error } = useAgentStream('support', currentInput);
```

Handles abort on unmount and event-buffer cap (`maxEvents`, default 10000).

## `useAgentState(name)`

Read-only agent-state snapshot (synced via the transport) — useful for
bidirectional state observers.

## Transports

- `SSETransport` (default) — HTTP + Server-Sent Events.
- `WebSocketTransport` — bidirectional, supports `@roostjs/broadcast`
  hibernation for durable connections.

Opt into the WebSocket transport per hook:

```tsx
const { state, prompt } = useAgent('support', { transport: 'websocket' });
```

## SSR

```ts
import { serverSnapshot, SSR_AGENT_STATE } from '@roostjs/ai/client';

// Server-side — embed the initial snapshot in your HTML
const initial = await serverSnapshot('support', { auth });
html += `<script>window.${SSR_AGENT_STATE} = ${JSON.stringify(initial)}</script>`;
```

Client hooks hydrate from the embedded snapshot when present, eliminating the
flash of empty state.

## Testing

React hook tests live in `__tests__/client/` and run via a separate bun
invocation with `@happy-dom/global-registrator` preloaded (see Phase 9
learning #2). Run `bun run test:client` from `packages/ai/`.
