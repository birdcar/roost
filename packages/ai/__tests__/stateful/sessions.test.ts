import { describe, it, expect, beforeEach } from 'bun:test';
import { Sessions, ConversationNotFoundError } from '../../src/stateful/sessions.js';
import { MockDurableObjectState } from '../../src/testing/mock-do-state.js';

function setup() {
  const state = new MockDurableObjectState();
  const sessions = new Sessions(state);
  return { state, sessions };
}

describe('Sessions.create', () => {
  it('returns a fresh conversation id and persists a record', async () => {
    const { state, sessions } = setup();
    const id = await sessions.create({ userId: 'u1' });
    const record = await state.storage.get<{ userId: string }>(`conv:${id}`);
    expect(record?.userId).toBe('u1');
  });

  it('indexes the conversation under the user key', async () => {
    const { state, sessions } = setup();
    const id = await sessions.create({ userId: 'u1' });
    const convs = await state.storage.get<string[]>(`user:u1:convs`);
    expect(convs).toEqual([id]);
  });
});

describe('Sessions.append + history', () => {
  it('appends nodes linearly and history returns them in chronological order', async () => {
    const { sessions } = setup();
    const id = await sessions.create();
    await sessions.append(id, { parentId: null, role: 'user', content: 'hello' });
    await sessions.append(id, { parentId: null, role: 'assistant', content: 'world' });
    const history = await sessions.history(id);
    expect(history.map((n) => n.content)).toEqual(['hello', 'world']);
  });

  it('throws ConversationNotFoundError for unknown ids', async () => {
    const { sessions } = setup();
    await expect(sessions.append('missing', { parentId: null, role: 'user', content: 'hi' }))
      .rejects.toThrow(ConversationNotFoundError);
  });
});

describe('Sessions.branch', () => {
  it('creates a new conversation rooted at the branched node', async () => {
    const { sessions } = setup();
    const id = await sessions.create({ userId: 'u1' });
    const first = await sessions.append(id, { parentId: null, role: 'user', content: 'original' });
    await sessions.append(id, { parentId: null, role: 'assistant', content: 'continuation' });

    const branch = await sessions.branch(id, first.id);
    expect(branch.branchedFrom).toBe(first.id);
    const history = await sessions.history(branch.conversationId);
    expect(history.map((n) => n.content)).toEqual(['original']);
  });

  it('inherits the parent conversation userId', async () => {
    const { sessions } = setup();
    const id = await sessions.create({ userId: 'u42' });
    const node = await sessions.append(id, { parentId: null, role: 'user', content: 'hi' });
    const branch = await sessions.branch(id, node.id);
    const [summary] = await sessions.list('u42');
    expect([summary.id, (await sessions.list('u42'))[1]?.id]).toContain(branch.conversationId);
  });
});

describe('Sessions.list', () => {
  it('returns summaries with message counts and previews for a user', async () => {
    const { sessions } = setup();
    const convId = await sessions.create({ userId: 'u1' });
    await sessions.append(convId, { parentId: null, role: 'user', content: 'hi' });
    const summaries = await sessions.list('u1');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].messageCount).toBe(1);
    expect(summaries[0].preview).toBe('hi');
  });

  it('returns an empty array when the user has no conversations', async () => {
    const { sessions } = setup();
    expect(await sessions.list('unknown-user')).toEqual([]);
  });
});

describe('Sessions.search', () => {
  it('returns nodes containing all search terms', async () => {
    const { sessions } = setup();
    const id = await sessions.create({ userId: 'u1' });
    await sessions.append(id, { parentId: null, role: 'user', content: 'deployment failed overnight' });
    await sessions.append(id, { parentId: null, role: 'assistant', content: 'let us investigate' });
    const results = await sessions.search('deployment overnight', { userId: 'u1' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('deployment');
  });

  it('returns no matches when a term is missing', async () => {
    const { sessions } = setup();
    const id = await sessions.create({ userId: 'u1' });
    await sessions.append(id, { parentId: null, role: 'user', content: 'deployment log' });
    const results = await sessions.search('deployment missing', { userId: 'u1' });
    expect(results).toEqual([]);
  });
});

describe('Sessions.compact', () => {
  it('drop-oldest retains only the most recent `keep` nodes', async () => {
    const { sessions } = setup();
    const id = await sessions.create();
    for (let i = 0; i < 5; i++) {
      await sessions.append(id, { parentId: null, role: 'user', content: `message ${i}` });
    }
    await sessions.compact(id, { kind: 'drop-oldest', keep: 2 });
    const history = await sessions.history(id);
    expect(history.map((n) => n.content)).toEqual(['message 3', 'message 4']);
  });

  it('summarize replaces older nodes with a system summary node', async () => {
    const { sessions } = setup();
    const id = await sessions.create();
    for (let i = 0; i < 4; i++) {
      await sessions.append(id, { parentId: null, role: 'user', content: `message ${i}` });
    }
    await sessions.compact(id, { kind: 'summarize' });
    const history = await sessions.history(id);
    expect(history[0].role).toBe('system');
    expect(history[0].content).toContain('Summary of');
    expect(history.length).toBeLessThan(5);
  });

  it('llm strategy uses the supplied summarizer closure', async () => {
    const { sessions } = setup();
    const id = await sessions.create();
    for (let i = 0; i < 4; i++) {
      await sessions.append(id, { parentId: null, role: 'user', content: `message ${i}` });
    }
    await sessions.compact(id, { kind: 'llm', summarize: async () => 'CUSTOM SUMMARY' });
    const history = await sessions.history(id);
    expect(history[0].content).toBe('CUSTOM SUMMARY');
  });
});

describe('Sessions.delete', () => {
  it('removes the conversation and its nodes, and unlinks from the user index', async () => {
    const { state, sessions } = setup();
    const id = await sessions.create({ userId: 'u1' });
    await sessions.append(id, { parentId: null, role: 'user', content: 'bye' });
    await sessions.delete(id);
    expect(await state.storage.get(`conv:${id}`)).toBeUndefined();
    expect(await state.storage.get<string[]>('user:u1:convs')).toEqual([]);
  });
});