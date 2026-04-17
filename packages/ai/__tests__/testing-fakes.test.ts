import { describe, it, expect, beforeEach } from 'bun:test';
import { Agent } from '../src/agent';
import type { schema, SchemaBuilder } from '@roostjs/schema';

class FakeAgent extends Agent {
  instructions() { return 'testable'; }
}

class StructuredFakeAgent extends Agent {
  instructions() { return 'score'; }
  schema(s: typeof schema): Record<string, SchemaBuilder> {
    return { score: s.integer(), label: s.string() };
  }
}

describe('Agent.fake()', () => {
  beforeEach(() => {
    FakeAgent.restore();
    StructuredFakeAgent.restore();
  });

  it('returns fake responses in order from an array', async () => {
    FakeAgent.fake(['one', 'two', 'three']);
    const a = new FakeAgent();
    const r1 = await a.prompt('q1');
    const r2 = await a.prompt('q2');
    const r3 = await a.prompt('q3');
    const r4 = await a.prompt('q4');
    expect((r1 as { text: string }).text).toBe('one');
    expect((r2 as { text: string }).text).toBe('two');
    expect((r3 as { text: string }).text).toBe('three');
    expect((r4 as { text: string }).text).toBe('three'); // clamps to last
  });

  it('invokes a closure resolver with the AgentPrompt', async () => {
    FakeAgent.fake((p) => `echo: ${p.prompt}`);
    const a = new FakeAgent();
    const r = await a.prompt('hello');
    expect((r as { text: string }).text).toBe('echo: hello');
  });

  it('records prompts for assertions', async () => {
    FakeAgent.fake();
    const a = new FakeAgent();
    await a.prompt('first');
    await a.prompt('second');
    FakeAgent.assertPrompted('first');
    FakeAgent.assertPrompted('second');
    expect(() => FakeAgent.assertPrompted('missing')).toThrow();
  });

  it('assertNotPrompted throws when prompt was received', async () => {
    FakeAgent.fake();
    const a = new FakeAgent();
    await a.prompt('seen');
    expect(() => FakeAgent.assertNotPrompted('seen')).toThrow();
  });

  it('assertNeverPrompted passes when no prompts received', () => {
    FakeAgent.fake();
    FakeAgent.assertNeverPrompted();
  });

  it('assertNeverPrompted throws after prompting', async () => {
    FakeAgent.fake();
    const a = new FakeAgent();
    await a.prompt('x');
    expect(() => FakeAgent.assertNeverPrompted()).toThrow();
  });

  it('preventStrayPrompts throws when no matching fake and called', async () => {
    FakeAgent.preventStrayPrompts();
    const a = new FakeAgent();
    await expect(a.prompt('x')).rejects.toThrow('Stray prompt');
  });

  describe('structured output auto-fake', () => {
    it('generates a minimal shape matching the schema', async () => {
      const f = StructuredFakeAgent.fake();
      f.withStructuredSchema((s) => ({
        score: s.integer(),
        label: s.string(),
      }));
      const a = new StructuredFakeAgent();
      const r = await a.prompt('score me');
      const parsed = JSON.parse((r as { text: string }).text);
      expect(parsed.score).toBe(0);
      expect(parsed.label).toBe('');
    });
  });
});
