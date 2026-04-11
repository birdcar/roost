import { describe, test, expect } from 'bun:test';
import { ChatHistoryServer } from '../app/mcp/chat-server';

describe('ChatHistoryServer', () => {
  test('lists resources', () => {
    const server = new ChatHistoryServer();
    const resources = server.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe('chat://conversations');
  });

  test('lists prompts', () => {
    const server = new ChatHistoryServer();
    const prompts = server.listPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].arguments[0].name).toBe('conversationId');
  });

  test('reads conversation list resource', async () => {
    const server = new ChatHistoryServer();
    const response = await server.readResource('chat://conversations');
    const json = response.toJSON();
    expect(json.content[0].text).toContain('First conversation');
  });
});
