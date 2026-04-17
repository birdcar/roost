import type { AgentPrompt } from './prompt.js';
import type { AgentResponse } from './responses/agent-response.js';

/** The terminal (or next-stage) function in the middleware pipeline. */
export type NextFn = (prompt: AgentPrompt) => Promise<AgentResponse>;

export interface AgentMiddleware {
  handle(prompt: AgentPrompt, next: NextFn): Promise<AgentResponse>;
}

type ThenHook = (response: AgentResponse) => void | Promise<void>;

const thenHooks = new WeakMap<AgentResponse, ThenHook[]>();

/**
 * Attach an on-complete callback to an agent response. Hooks fire after the
 * pipeline resolves but before `prompt()` returns.
 *
 * Note: we deliberately do NOT install a `.then()` method on the response —
 * that would make the response a thenable and confuse `await`. The hook is
 * tracked in a side-channel `WeakMap` and invoked by `runPipeline`.
 */
export function addThenHook(response: AgentResponse, hook: ThenHook): AgentResponse {
  const existing = thenHooks.get(response) ?? [];
  thenHooks.set(response, [...existing, hook]);
  return response;
}

async function runThenHooks(response: AgentResponse): Promise<void> {
  const hooks = thenHooks.get(response);
  if (!hooks) return;
  for (const hook of hooks) {
    try {
      await hook(response);
    } catch (err) {
      console.error('[@roostjs/ai] middleware .then() hook threw:', err);
    }
  }
}

/**
 * Compose middleware right-to-left into a single function, run it with the
 * given prompt, and fire any `.then()` hooks on the resulting response.
 *
 * Middleware may short-circuit by not calling `next(prompt)` and returning
 * a synthetic response directly.
 */
export async function runPipeline(
  middleware: AgentMiddleware[],
  prompt: AgentPrompt,
  terminal: NextFn,
): Promise<AgentResponse> {
  const pipeline = middleware.reduceRight<NextFn>(
    (next, mw) => (p) => mw.handle(p, next),
    terminal,
  );
  const response = await pipeline(prompt);
  await runThenHooks(response);
  return response;
}
