import type { StreamEvent } from '../types.js';
import { decodeSSE } from '../streaming/sse.js';

/**
 * Client-side transport abstraction. `open(input)` returns an
 * `AsyncIterable<StreamEvent>` regardless of whether the underlying wire is
 * SSE or WebSocket. Implementations own transport-level concerns (buffering,
 * heartbeats, abort).
 */
export interface AgentTransport {
  open(agentName: string, input: string, opts?: AgentTransportOptions): AsyncIterable<StreamEvent>;
  close(): void;
}

export interface AgentTransportOptions {
  signal?: AbortSignal;
  auth?: { token: string };
  headers?: Record<string, string>;
}

export class SSETransport implements AgentTransport {
  private controller?: AbortController;
  constructor(private endpoint: string) {}

  async *open(
    agentName: string,
    input: string,
    opts: AgentTransportOptions = {},
  ): AsyncIterable<StreamEvent> {
    this.controller = new AbortController();
    const signal = mergeSignals(opts.signal, this.controller.signal);
    const url = `${this.endpoint.replace(/\/$/, '')}/${encodeURIComponent(agentName)}/stream`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(opts.headers ?? {}),
    };
    if (opts.auth?.token) headers.Authorization = `Bearer ${opts.auth.token}`;

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ input }),
      headers,
      signal,
    });

    if (!response.ok || !response.body) {
      yield { type: 'error', message: `SSE ${response.status}: ${await response.text().catch(() => '')}` };
      return;
    }

    for await (const event of decodeSSE(response.body)) yield event;
  }

  close(): void {
    this.controller?.abort();
  }
}

export class WebSocketTransport implements AgentTransport {
  private ws?: WebSocket;
  constructor(private endpoint: string) {}

  async *open(
    agentName: string,
    input: string,
    opts: AgentTransportOptions = {},
  ): AsyncIterable<StreamEvent> {
    const url = `${this.endpoint.replace(/\/$/, '')}/${encodeURIComponent(agentName)}/ws`;
    const ws = new WebSocket(opts.auth?.token ? `${url}?token=${encodeURIComponent(opts.auth.token)}` : url);
    this.ws = ws;
    const queue: StreamEvent[] = [];
    let done = false;
    let error: Error | undefined;
    const wake: Array<() => void> = [];

    ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as StreamEvent;
        queue.push(event);
        wake.shift()?.();
      } catch {
        // drop malformed
      }
    };
    ws.onerror = () => {
      error = new Error('WebSocket error');
      done = true;
      while (wake.length) wake.shift()?.();
    };
    ws.onclose = () => {
      done = true;
      while (wake.length) wake.shift()?.();
    };

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      opts.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });

    ws.send(JSON.stringify({ type: 'prompt', input }));

    while (!done || queue.length > 0) {
      if (queue.length === 0) await new Promise<void>((r) => wake.push(r));
      while (queue.length > 0) yield queue.shift()!;
    }
    if (error) yield { type: 'error', message: error.message };
  }

  close(): void {
    this.ws?.close();
  }
}

function mergeSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  const controller = new AbortController();
  const handler = () => controller.abort();
  a.addEventListener('abort', handler);
  b.addEventListener('abort', handler);
  return controller.signal;
}