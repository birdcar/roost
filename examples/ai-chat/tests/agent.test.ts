import { describe, test, expect, beforeEach } from 'bun:test';
import { ChatAssistant } from '../app/agents/chat-assistant';

describe('ChatAssistant', () => {
  beforeEach(() => {
    ChatAssistant.restore();
    ChatAssistant.clearProvider();
  });

  test('has correct instructions', () => {
    const agent = new ChatAssistant();
    expect(agent.instructions()).toContain('helpful assistant');
  });

  test('has calculator and current time tools', () => {
    const agent = new ChatAssistant();
    const tools = (agent as any).tools();
    expect(tools).toHaveLength(2);
  });

  test('fake intercepts prompts', async () => {
    ChatAssistant.fake(['The answer is 42.']);

    const agent = new ChatAssistant();
    const response = await agent.prompt('What is 6 * 7?');

    expect(response.text).toBe('The answer is 42.');
    ChatAssistant.assertPrompted('6 * 7');
  });
});
