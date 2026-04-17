import type { schema, SchemaBuilder } from '@roostjs/schema';
import type { Tool } from './tool.js';
import type { AgentMessage } from './types.js';
import type { AgentMiddleware } from './middleware.js';
import type { Lab } from './enums.js';

/**
 * Agent opt-in contracts. Each is an optional interface the `Agent` base
 * class detects at runtime via type predicates. Implementing a contract
 * unlocks the corresponding capability without bloating the base class.
 */

export interface Conversational {
  messages(): Iterable<AgentMessage> | Promise<Iterable<AgentMessage>>;
}

export interface HasTools {
  tools(): Tool[];
}

export interface HasStructuredOutput<_T = unknown> {
  schema(s: typeof schema): Record<string, SchemaBuilder>;
}

export interface HasMiddleware {
  middleware(): AgentMiddleware[];
}

export interface HasProviderOptions {
  providerOptions(provider: Lab | string): Record<string, unknown>;
}

/* ------------------------------- predicates ------------------------------ */

function hasCallable(x: unknown, key: string): boolean {
  return !!x && typeof x === 'object' && typeof (x as Record<string, unknown>)[key] === 'function';
}

export function isConversational(x: unknown): x is Conversational {
  return hasCallable(x, 'messages');
}

export function hasTools(x: unknown): x is HasTools {
  return hasCallable(x, 'tools');
}

export function hasStructuredOutput(x: unknown): x is HasStructuredOutput {
  return hasCallable(x, 'schema');
}

export function hasMiddleware(x: unknown): x is HasMiddleware {
  return hasCallable(x, 'middleware');
}

export function hasProviderOptions(x: unknown): x is HasProviderOptions {
  return hasCallable(x, 'providerOptions');
}
