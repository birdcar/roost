export interface BroadcastClientOptions {
  /** Initial reconnect delay in ms. Default: 1000. */
  initialDelay?: number;
  /** Max reconnect delay in ms (exponential backoff cap). Default: 30000. */
  maxDelay?: number;
  /** Called when the connection is established or re-established. */
  onConnect?: () => void;
  /** Called when the connection is closed unexpectedly. */
  onDisconnect?: (code: number, reason: string) => void;
}

export interface BroadcastClient {
  subscribe(channel: string, handler: (event: string, data: unknown) => void): () => void;
  unsubscribe(channel: string): void;
  whisper(channel: string, event: string, data?: unknown): void;
  close(): void;
}

export function createBroadcastClient(
  urlOrFactory: string | (() => string),
  options: BroadcastClientOptions = {}
): BroadcastClient {
  const {
    initialDelay = 1000,
    maxDelay = 30000,
    onConnect,
    onDisconnect,
  } = options;

  type Handler = (event: string, data: unknown) => void;
  const channelHandlers = new Map<string, Handler[]>();
  let ws: WebSocket | null = null;
  let reconnectDelay = initialDelay;
  let closed = false;

  function getUrl(): string {
    return typeof urlOrFactory === 'function' ? urlOrFactory() : urlOrFactory;
  }

  function connect(): void {
    if (closed) return;
    ws = new WebSocket(getUrl());

    ws.addEventListener('open', () => {
      reconnectDelay = initialDelay;
      onConnect?.();
    });

    ws.addEventListener('message', (ev) => {
      let parsed: { event: string; data: unknown } | null = null;
      try {
        parsed = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (!parsed?.event) return;

      const handlers = channelHandlers.get('*') ?? [];
      for (const h of handlers) h(parsed.event, parsed.data);
    });

    ws.addEventListener('close', (ev) => {
      onDisconnect?.(ev.code, ev.reason);
      if (closed) return;
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
        connect();
      }, reconnectDelay);
    });

    ws.addEventListener('error', () => {
      // 'error' always precedes 'close'; let 'close' handle reconnect
    });
  }

  connect();

  return {
    subscribe(channel, handler) {
      const wrapper: Handler = (event, data) => {
        handler(event, data);
      };
      const existing = channelHandlers.get(channel) ?? [];
      channelHandlers.set(channel, [...existing, wrapper]);

      return () => {
        const handlers = channelHandlers.get(channel) ?? [];
        channelHandlers.set(
          channel,
          handlers.filter((h) => h !== wrapper)
        );
      };
    },

    unsubscribe(channel) {
      channelHandlers.delete(channel);
    },

    whisper(channel, event, data) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'whisper', channel, data: { event, data } }));
      }
    },

    close() {
      closed = true;
      ws?.close(1000, 'Client closed');
    },
  };
}
