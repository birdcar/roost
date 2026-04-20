/**
 * @roostjs/ai public API surface.
 *
 * RAG primitives have moved to the `@roostjs/ai/rag` subpath.
 * Media (Image/Audio/Transcription) — `@roostjs/ai/media`.
 * MCP client/server — `@roostjs/ai/mcp`.
 * Testing helpers — `@roostjs/ai/testing`.
 * React client hooks — `@roostjs/ai/client`.
 */

// Agents — class + anonymous factory + contract interfaces.
export { Agent, agent, NoProviderRegisteredError } from './agent.js';
export type { AgentInterface } from './agent.js';
export type {
  Conversational,
  HasTools,
  HasStructuredOutput,
  HasMiddleware,
  HasProviderOptions,
} from './contracts.js';
export {
  isConversational,
  hasTools,
  hasStructuredOutput,
  hasMiddleware,
  hasProviderOptions,
} from './contracts.js';

// Prompt + middleware pipeline.
export { AgentPrompt } from './prompt.js';
export { runPipeline, addThenHook } from './middleware.js';
export type { AgentMiddleware, NextFn } from './middleware.js';

// Responses.
export {
  StructuredAgentResponse,
  StructuredOutputValidationError,
} from './responses/agent-response.js';
export type { AgentResponse } from './responses/agent-response.js';
export type { StreamedAgentResponse } from './responses/streamed-response.js';

// Streaming (Phase 3).
export {
  StreamableAgentResponse,
  StreamAlreadyConsumedError,
  StreamNotAwaitableError,
} from './streaming/streamable-response.js';
export type { StreamProtocol } from './streaming/streamable-response.js';
export { StreamingUnsupportedError } from './streaming/agent-stream.js';
export { encodeSSE, decodeSSE, toSSEStream } from './streaming/sse.js';
export { toVercelProtocol, toVercelStream } from './streaming/vercel.js';

// Decorators.
export {
  Provider,
  Model,
  MaxSteps,
  MaxTokens,
  Temperature,
  Timeout,
  UseCheapestModel,
  UseSmartestModel,
  Stateful,
  Scheduled,
  Queue,
  Delay,
  MaxRetries,
  RetryAfter,
  Backoff,
  JobTimeout,
  getAgentConfig,
  getStatefulConfig,
  getJobConfig,
} from './decorators.js';
export type { StatefulConfig } from './decorators.js';

// Tools.
export type { Tool, ToolRequest, ProviderTool } from './tool.js';
export {
  createToolRequest,
  toolToProviderTool,
  resolveToolName,
  isProviderTool,
  partitionTools,
  UnsupportedProviderToolError,
  ProviderToolNameCollisionError,
} from './tool.js';

// Provider-native tools (web search, web fetch, file search).
export { WebSearch, WebFetch, FileSearch, FileSearchQuery } from './tools/provider-tools/index.js';
export type {
  WebSearchLocation,
  FileSearchFilter,
  FileSearchOptions,
} from './tools/provider-tools/index.js';

// Semantic search tool (Phase 5).
export { SimilaritySearch } from './tools/similarity-search.js';
export type { SimilaritySearchOptions, ModelLike } from './tools/similarity-search.js';

// Attachments.
export {
  StorableFile,
  Files,
  Image,
  Document,
  AttachmentTooLargeError,
  FileNotFoundError,
  setStorageResolver,
  getStorageResolver,
  detectMimeType,
} from './attachments/index.js';
export type { FileRecord, StorageResolver, ImageDimensions } from './attachments/index.js';

// Queueing bridge.
export {
  AgentRegistry,
  AgentClassNotRegisteredError,
  InMemoryCallbackRegistry,
  setCallbackRegistry,
  getCallbackRegistry,
  resetCallbackRegistry,
  PromptAgentJob,
  QueuedPromptHandle,
  generatePromptId,
} from './queueing/index.js';
export type {
  CallbackRegistry,
  PromptCallback,
  RejectCallback,
  PromptAgentJobPayload,
  QueueOptions,
} from './queueing/index.js';

// Providers.
export { WorkersAIProvider, CloudflareAIProvider } from './providers/workers-ai.js';
export { GatewayAIProvider } from './providers/gateway.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export { GeminiProvider } from './providers/gemini.js';
export { FailoverProvider, AllProvidersFailedError } from './providers/failover.js';
export { ProviderRegistry } from './providers/registry.js';
export type {
  AIProvider,
  ProviderCapabilities,
  ProviderCapability,
  EmbedRequest,
  EmbedResponse,
} from './providers/interface.js';

// Enums + capability resolution.
export { Lab, isLab } from './enums.js';
export {
  resolveModel,
  getCapabilityTable,
} from './capability-table.js';
export type { ModelHints, ModelResolver, ModelResolverStrategy } from './capability-table.js';

// Events (so consumers can register listeners or fake them in tests).
export {
  PromptingAgent,
  AgentPrompted,
  InvokingTool,
  ToolInvoked,
  ProviderFailoverTriggered,
  AllProvidersFailed,
  MaxStepsExhausted,
  ConversationStarted,
  ConversationContinued,
  ConversationCompacted,
  ScheduledMethodMissing,
  StreamingAgent,
  AgentStreamed,
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
  GeneratingImage,
  ImageGenerated,
  GeneratingAudio,
  AudioGenerated,
  GeneratingTranscription,
  TranscriptionGenerated,
  UnsupportedOptionDropped,
  dispatchEvent,
} from './events.js';

// Service provider wiring.
export { AiServiceProvider } from './provider.js';

// Types re-exported at root for convenience (large surfaces live in their subpaths).
export type {
  AgentConfig,
  AgentMessage,
  AgentPromptOptions,
  PromptResult,
  ProviderOptions,
  ProviderRequest,
  ProviderResponse,
  ProviderToolConfig,
  StorableFileLike,
  StreamEvent,
  ToolCall,
  ToolResult,
  Usage,
} from './types.js';
