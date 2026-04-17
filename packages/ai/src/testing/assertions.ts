import type { AgentPrompt } from '../prompt.js';
import type { AgentFake } from './fakes.js';

type PromptMatcher = string | ((prompt: AgentPrompt) => boolean);

function matches(prompt: AgentPrompt, matcher: PromptMatcher): boolean {
  if (typeof matcher === 'string') return prompt.prompt.includes(matcher);
  return matcher(prompt);
}

export function assertPrompted(fake: AgentFake, agentName: string, matcher?: PromptMatcher): void {
  if (fake.prompts.length === 0) {
    throw new Error(`Expected ${agentName} to be prompted, but it was not`);
  }
  if (matcher !== undefined && !fake.prompts.some((p) => matches(p, matcher))) {
    const summary = fake.prompts.map((p) => p.prompt).join(', ');
    throw new Error(
      `Expected ${agentName} to be prompted matching ${JSON.stringify(matcher)}, but received: [${summary}]`,
    );
  }
}

export function assertNotPrompted(fake: AgentFake, agentName: string, matcher?: PromptMatcher): void {
  if (matcher === undefined) {
    if (fake.prompts.length > 0) {
      throw new Error(`Expected ${agentName} not to be prompted, but it was prompted ${fake.prompts.length} time(s)`);
    }
    return;
  }
  const matched = fake.prompts.filter((p) => matches(p, matcher));
  if (matched.length > 0) {
    throw new Error(
      `Expected ${agentName} not to be prompted matching ${JSON.stringify(matcher)}, but ${matched.length} prompt(s) matched`,
    );
  }
}

export function assertNeverPrompted(fake: AgentFake, agentName: string): void {
  if (fake.prompts.length > 0) {
    throw new Error(`Expected ${agentName} to never be prompted, but it was prompted ${fake.prompts.length} time(s)`);
  }
}

export function assertQueued(fake: AgentFake, agentName: string, matcher?: PromptMatcher): void {
  if (fake.queuedPrompts.length === 0) {
    throw new Error(`Expected ${agentName} to be queued, but it was not`);
  }
  if (matcher !== undefined && !fake.queuedPrompts.some((p) => matches(p, matcher))) {
    const summary = fake.queuedPrompts.map((p) => p.prompt).join(', ');
    throw new Error(
      `Expected ${agentName} to be queued matching ${JSON.stringify(matcher)}, but received: [${summary}]`,
    );
  }
}

export function assertNotQueued(fake: AgentFake, agentName: string, matcher?: PromptMatcher): void {
  if (matcher === undefined) {
    if (fake.queuedPrompts.length > 0) {
      throw new Error(
        `Expected ${agentName} not to be queued, but ${fake.queuedPrompts.length} queued prompt(s) were recorded`,
      );
    }
    return;
  }
  const matched = fake.queuedPrompts.filter((p) => matches(p, matcher));
  if (matched.length > 0) {
    throw new Error(
      `Expected ${agentName} not to be queued matching ${JSON.stringify(matcher)}, but ${matched.length} matched`,
    );
  }
}

export function assertNeverQueued(fake: AgentFake, agentName: string): void {
  if (fake.queuedPrompts.length > 0) {
    throw new Error(`Expected ${agentName} to never be queued, but it was queued ${fake.queuedPrompts.length} time(s)`);
  }
}
