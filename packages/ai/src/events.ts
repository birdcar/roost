import { Event } from '@roostjs/events';
import type { AgentPrompt } from './prompt.js';
import type { AgentResponse } from './responses/agent-response.js';
import type { ToolCall, ToolResult } from './types.js';
import type { Tool } from './tool.js';
import type { AIProvider } from './providers/interface.js';

/**
 * Dispatch helper that sidesteps the generic `EventClass<T>` constraint
 * (which requires `new (...args: unknown[]) => T`). Our event subclasses
 * have typed constructors, so calling `Event.dispatch.call(Class, instance)`
 * fails strict typecheck without a cast. This helper wraps that cast in one
 * place and preserves fake/restore/assertDispatched semantics because it
 * still calls the class's own `dispatch` static.
 */
export function dispatchEvent<E extends Event>(
  EventCtor: { dispatch(e: E): Promise<void> },
  instance: E,
): Promise<void> {
  return EventCtor.dispatch(instance);
}

/**
 * Dispatched immediately before the provider is called. Listeners can
 * inspect the prompt but cannot modify it (use middleware for that).
 */
export class PromptingAgent extends Event {
  constructor(
    public readonly agentName: string,
    public readonly prompt: AgentPrompt,
  ) {
    super();
  }
}

/** Dispatched after the provider returns a final response. */
export class AgentPrompted extends Event {
  constructor(
    public readonly agentName: string,
    public readonly prompt: AgentPrompt,
    public readonly response: AgentResponse,
  ) {
    super();
  }
}

/** Dispatched before a tool's `handle()` is invoked. */
export class InvokingTool extends Event {
  constructor(
    public readonly tool: Tool,
    public readonly call: ToolCall,
  ) {
    super();
  }
}

/** Dispatched after a tool returns a result. */
export class ToolInvoked extends Event {
  constructor(
    public readonly tool: Tool,
    public readonly call: ToolCall,
    public readonly result: ToolResult,
  ) {
    super();
  }
}

/** Dispatched when a provider in a failover chain fails and execution moves on. */
export class ProviderFailoverTriggered extends Event {
  constructor(
    public readonly failed: AIProvider,
    public readonly fallback: AIProvider,
    public readonly cause: unknown,
  ) {
    super();
  }
}

/** Dispatched when every provider in a failover chain has failed. */
export class AllProvidersFailed extends Event {
  constructor(public readonly causes: unknown[]) {
    super();
  }
}

/** Dispatched when the agent hit `maxSteps` without the model emitting a final answer. */
export class MaxStepsExhausted extends Event {
  constructor(
    public readonly agentName: string,
    public readonly steps: number,
  ) {
    super();
  }
}

/* ---------------------------- Phase 3: Streaming events --------------------------- */

/** Dispatched immediately before `Agent.stream()` begins producing events. */
export class StreamingAgent extends Event {
  constructor(
    public readonly agentName: string,
    public readonly prompt: AgentPrompt,
  ) {
    super();
  }
}

/** Dispatched after a stream closes and the `.then()` hooks have received the collected response. */
export class AgentStreamed extends Event {
  constructor(
    public readonly agentName: string,
    public readonly prompt: AgentPrompt,
    public readonly response: import('./responses/streamed-response.js').StreamedAgentResponse,
  ) {
    super();
  }
}

/* ---------------------------- Phase 2: Stateful events ---------------------------- */

/** Dispatched when `RemembersConversations` creates a new conversation for a user. */
export class ConversationStarted extends Event {
  constructor(
    public readonly agentName: string,
    public readonly conversationId: string,
    public readonly userId?: string,
  ) {
    super();
  }
}

/** Dispatched when `RemembersConversations.continue(id)` resumes an existing conversation. */
export class ConversationContinued extends Event {
  constructor(
    public readonly agentName: string,
    public readonly conversationId: string,
    public readonly userId?: string,
  ) {
    super();
  }
}

/**
 * Dispatched when a conversation has been compacted. `droppedCount` is the
 * number of nodes removed (or summarized away); `strategy` matches the strategy
 * name passed to `Sessions.compact()`.
 */
export class ConversationCompacted extends Event {
  constructor(
    public readonly conversationId: string,
    public readonly strategy: 'summarize' | 'drop-oldest' | 'llm',
    public readonly droppedCount: number,
  ) {
    super();
  }
}

/**
 * Dispatched when a scheduled method fires but the callback no longer exists
 * on the agent class (e.g. the method was renamed after the schedule was
 * created). The schedule is dropped; emitting the event gives applications a
 * chance to observe/alert.
 */
export class ScheduledMethodMissing extends Event {
  constructor(
    public readonly agentName: string,
    public readonly scheduleId: string,
    public readonly method: string,
  ) {
    super();
  }
}

/* ---------------------------- Phase 5: RAG events ---------------------------- */

export {
  GeneratingEmbeddings,
  EmbeddingsGenerated,
  FileStored,
  FileDeleted,
  CreatingStore,
  StoreCreated,
  AddingFileToStore,
  FileAddedToStore,
  RemovingFileFromStore,
  FileRemovedFromStore,
  RerankingStarted,
  Reranked,
} from './rag/events.js';

/* ---------------------------- Phase 6: Media events --------------------------- */

export { GeneratingImage, ImageGenerated } from './media/image/events.js';
export { GeneratingAudio, AudioGenerated } from './media/audio/events.js';
export { GeneratingTranscription, TranscriptionGenerated } from './media/transcription/events.js';
export { UnsupportedOptionDropped } from './media/shared/events.js';
