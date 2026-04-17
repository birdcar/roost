import { describe, it, expect, afterEach } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { RemembersConversations } from '../../src/stateful/remembers-conversations.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';
import type { AIProvider, ProviderCapabilities } from '../../src/providers/interface.js';
import { ConversationStarted, ConversationContinued } from '../../src/events.js';

class EchoProvider implements AIProvider {
  readonly name = 'echo';
  capabilities(): ProviderCapabilities { return { smartestChat: 'echo', cheapestChat: 'echo' }; }
  async chat(req: { messages: Array<{ role: string; content: string }> }) {
    const last = req.messages[req.messages.length - 1]?.content ?? '';
    return { text: `echo:${last}`, toolCalls: [] };
  }
}

class ChatAgent extends RemembersConversations(StatefulAgent) {
  instructions(): string { return 'You are a chat agent.'; }
}

afterEach(() => {
  ChatAgent.clearProvider();
});

describe('RemembersConversations.forUser', () => {
  it('creates a new conversation on first prompt and returns its id on the response', async () => {
    ChatAgent.setProvider(new EchoProvider());
    const { agent, cleanup } = TestStatefulAgentHarness.for(ChatAgent).build();
    try {
      const response = await agent.forUser({ id: 'u1' }).prompt('hello');
      expect(response.conversationId).toBeDefined();
      const history = await agent.sessions.history(response.conversationId!);
      expect(history.map((n) => n.content)).toEqual(['hello', 'echo:hello']);
    } finally {
      cleanup();
    }
  });

  it('dispatches ConversationStarted on first prompt only', async () => {
    ChatAgent.setProvider(new EchoProvider());
    ConversationStarted.fake();
    ConversationContinued.fake();
    const { agent, cleanup } = TestStatefulAgentHarness.for(ChatAgent).build();
    try {
      await agent.forUser({ id: 'u1' }).prompt('hi');
      ConversationStarted.assertDispatched();
      ConversationContinued.assertNotDispatched();
    } finally {
      cleanup();
      ConversationStarted.restore();
      ConversationContinued.restore();
    }
  });
});

describe('RemembersConversations.continue', () => {
  it('appends to an existing conversation id and emits ConversationContinued', async () => {
    ChatAgent.setProvider(new EchoProvider());
    const { agent, cleanup } = TestStatefulAgentHarness.for(ChatAgent).build();
    try {
      const first = await agent.forUser({ id: 'u1' }).prompt('hi');
      const convId = first.conversationId!;

      ConversationContinued.fake();
      try {
        agent.continue(convId, { as: { id: 'u1' } });
        ConversationContinued.assertNotDispatched();
        await agent.prompt('follow-up');
        ConversationContinued.assertDispatched((ev) => ev.conversationId === convId);
      } finally {
        ConversationContinued.restore();
      }
    } finally {
      cleanup();
    }
  });
});

describe('RemembersConversations.messages', () => {
  it('returns the history of the active conversation in AgentMessage shape', async () => {
    ChatAgent.setProvider(new EchoProvider());
    const { agent, cleanup } = TestStatefulAgentHarness.for(ChatAgent).build();
    try {
      const first = await agent.forUser({ id: 'u1' }).prompt('hi');
      const messages = await agent.messages();
      expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(first.conversationId).toBe(agent.conversationId);
    } finally {
      cleanup();
    }
  });
});