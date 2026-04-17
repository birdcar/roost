import { ChannelDO } from '@roostjs/broadcast';
import type { StreamEvent } from '../types.js';

/**
 * Callback registered for a concrete `AgentChannel` subclass. Returns any
 * iterable of `StreamEvent`. `StreamableAgentResponse` implements this
 * interface so `agent.stream(input)` can be returned directly.
 */
export type PromptHandler = (input: string) =>
  | AsyncIterable<StreamEvent>
  | Promise<AsyncIterable<StreamEvent>>;

// Module-scoped registry keyed by subclass constructor.
const promptHandlers = new WeakMap<Function, PromptHandler>();

/**
 * Agent-scoped WebSocket DO. One `AgentChannel` per agent, identified by
 * the agent's DO id. Inbound client messages of the form
 * `{"type":"prompt","input":"..."}` are dispatched to a registered
 * streaming callback; every resulting `StreamEvent` is fanned out over the
 * requesting WebSocket.
 *
 * Subclass override points:
 *   - `authorize(request)` — same as `ChannelDO` (bearer token by default).
 *   - Register a prompt handler via `AgentChannel.registerPromptHandler(MySub, fn)`.
 */
export abstract class AgentChannel extends ChannelDO {
  /**
   * Register the streaming callback for a concrete `AgentChannel` subclass.
   * Call this once at module init; the handler is invoked on every inbound
   * prompt message.
   */
  static registerPromptHandler(
    subclass: typeof AgentChannel,
    handler: PromptHandler,
  ): void {
    promptHandlers.set(subclass, handler);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let parsed: { type?: string; input?: string } | null = null;
    try {
      parsed = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      await super.webSocketMessage(ws, message);
      return;
    }

    if (parsed?.type !== 'prompt' || typeof parsed.input !== 'string') {
      await super.webSocketMessage(ws, message);
      return;
    }

    const handler = resolveHandler(this.constructor);
    if (!handler) {
      ws.send(
        JSON.stringify({ type: 'error', message: 'AgentChannel has no registered prompt handler.' }),
      );
      return;
    }

    try {
      const source: AsyncIterable<StreamEvent> = await handler(parsed.input);
      for await (const event of source) {
        if ((ws as { readyState?: number }).readyState !== undefined && ws.readyState !== WS_OPEN) {
          break;
        }
        try {
          ws.send(JSON.stringify(event));
        } catch {
          // Socket closed between `readyState` check and `send` — stop pumping events.
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try { ws.send(JSON.stringify({ type: 'error', message: msg })); } catch { /* socket gone */ }
    }
  }
}

const WS_OPEN = 1;

function resolveHandler(ctor: Function): PromptHandler | undefined {
  let current: Function | null = ctor;
  while (current) {
    const found = promptHandlers.get(current);
    if (found) return found;
    current = Object.getPrototypeOf(current);
    if (!current || current === Function.prototype) break;
  }
  return undefined;
}