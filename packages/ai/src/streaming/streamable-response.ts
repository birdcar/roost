import type { AgentMessage, StreamEvent, ToolCall, Usage } from '../types.js';
import type { StreamedAgentResponse } from '../responses/streamed-response.js';
import { toSSEStream } from './sse.js';
import { toVercelStream } from './vercel.js';

export type StreamProtocol = 'native' | 'vercel';
type DoneHook = (response: StreamedAgentResponse) => void | Promise<void>;

/**
 * Return value of `Agent.stream()`. Implements:
 *   - `AsyncIterable<StreamEvent>` — iterate events as they arrive
 *   - builder-style `.usingVercelDataProtocol()`, `.withHeaders()`, `.then(fn)`
 *   - `.toResponse()` — returns a `Response` suitable for TanStack Start
 *
 * **Not awaitable.** The `.then(fn)` builder method is a fluent API, not a
 * Promise thenable. Consumers must either iterate with `for await (const e of
 * response)` or call `await response.toResponse()`.
 */
export class StreamableAgentResponse implements AsyncIterable<StreamEvent> {
  private protocol: StreamProtocol = 'native';
  private doneHooks: DoneHook[] = [];
  private headers: Record<string, string> = {};
  private consumed = false;

  constructor(
    private readonly source: AsyncIterable<StreamEvent>,
    private readonly agentName: string,
    private readonly initialMessages: AgentMessage[] = [],
  ) {}

  usingVercelDataProtocol(): this {
    this.protocol = 'vercel';
    return this;
  }

  /**
   * Attach a hook fired once with the fully-collected response.
   *
   * Deliberately NOT a Promise thenable — calling `await response` would
   * otherwise invoke this method with `(resolve, reject)` and hang the
   * request forever because the hook only fires when iteration completes.
   * Detect that 2-arg call and throw instead of silently wiring a callback.
   */
  then(fn: DoneHook, _maybeReject?: unknown): this {
    if (arguments.length > 1) {
      throw new StreamNotAwaitableError(this.agentName);
    }
    this.doneHooks.push(fn);
    return this;
  }

  withHeaders(headers: Record<string, string>): this {
    this.headers = { ...this.headers, ...headers };
    return this;
  }

  protocolVersion(): StreamProtocol {
    return this.protocol;
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    return this.wrappedEvents()[Symbol.asyncIterator]();
  }

  async toResponse(): Promise<Response> {
    const encoder = this.protocol === 'vercel' ? toVercelStream : toSSEStream;
    const wrapped = this.wrappedEvents();
    const stream = encoder(wrapped);
    return new Response(stream, { headers: this.responseHeaders() });
  }

  /**
   * Collect the whole stream into a `StreamedAgentResponse` without returning
   * a `Response`. Useful for server-side logic that wants the aggregated text
   * (and fires `.then()` hooks along the way).
   */
  async collect(): Promise<StreamedAgentResponse> {
    const collected = await collectInternal(this.source, this.initialMessages);
    for (const hook of this.doneHooks) await runHookSafely(hook, collected);
    return collected;
  }

  /** Wrap the source iterable so collection + `.then()` hooks happen exactly once. */
  private async *wrappedEvents(): AsyncIterable<StreamEvent> {
    if (this.consumed) {
      throw new StreamAlreadyConsumedError(this.agentName);
    }
    this.consumed = true;
    const collected: StreamEvent[] = [];
    let text = '';
    let usage: Usage | undefined;
    const toolCalls: ToolCall[] = [];
    const messages: AgentMessage[] = [...this.initialMessages];

    for await (const event of this.source) {
      collected.push(event);
      switch (event.type) {
        case 'text-delta':
          text += event.text;
          break;
        case 'tool-call':
          toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
          break;
        case 'usage':
          usage = { promptTokens: event.promptTokens, completionTokens: event.completionTokens };
          break;
        default:
          break;
      }
      yield event;
    }

    if (text.length > 0) messages.push({ role: 'assistant', content: text });

    const final: StreamedAgentResponse = { text, events: collected, messages, toolCalls, usage };
    for (const hook of this.doneHooks) await runHookSafely(hook, final);
  }

  private responseHeaders(): Record<string, string> {
    const base: Record<string, string> =
      this.protocol === 'vercel'
        ? { 'Content-Type': 'text/plain; charset=utf-8', 'x-vercel-ai-data-stream': 'v1' }
        : { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' };
    return { ...base, ...this.headers };
  }
}

export class StreamAlreadyConsumedError extends Error {
  override readonly name = 'StreamAlreadyConsumedError';
  constructor(agentName: string) {
    super(
      `Stream from '${agentName}' has already been consumed. A StreamableAgentResponse can only be iterated or converted once; call Agent.stream() again for a fresh stream.`,
    );
  }
}

export class StreamNotAwaitableError extends Error {
  override readonly name = 'StreamNotAwaitableError';
  constructor(agentName: string) {
    super(
      `StreamableAgentResponse from '${agentName}' is not awaitable. Use \`for await (const event of response)\` or \`await response.toResponse()\` / \`await response.collect()\` instead.`,
    );
  }
}

async function collectInternal(
  source: AsyncIterable<StreamEvent>,
  initialMessages: AgentMessage[],
): Promise<StreamedAgentResponse> {
  const events: StreamEvent[] = [];
  let text = '';
  let usage: Usage | undefined;
  const toolCalls: ToolCall[] = [];
  const messages: AgentMessage[] = [...initialMessages];
  for await (const event of source) {
    events.push(event);
    if (event.type === 'text-delta') text += event.text;
    else if (event.type === 'tool-call')
      toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
    else if (event.type === 'usage')
      usage = { promptTokens: event.promptTokens, completionTokens: event.completionTokens };
  }
  if (text.length > 0) messages.push({ role: 'assistant', content: text });
  return { text, events, messages, toolCalls, usage };
}

async function runHookSafely(hook: DoneHook, response: StreamedAgentResponse): Promise<void> {
  try {
    await hook(response);
  } catch (err) {
    console.error('[@roostjs/ai] StreamableAgentResponse.then() hook threw:', err);
  }
}