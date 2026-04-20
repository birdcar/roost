import { describe, it, expect } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';
import {
  Memory,
  ReadonlyMemory,
  ShortFormMemory,
  KnowledgeMemory,
  SkillsMemory,
  SkillRegistrationCycleError,
} from '../../src/memory/index.js';
import type { Tool, ToolRequest } from '../../src/tool.js';

class DemoAgent extends StatefulAgent {
  instructions() {
    return 'demo';
  }
}

describe('ReadonlyMemory', () => {
  it('exposes initial entries as a frozen read surface', () => {
    const r = new ReadonlyMemory([
      ['user.id', 'u1'],
      ['org.tier', 'pro'],
    ]);
    expect(r.get<string>('user.id')).toBe('u1');
    expect(r.has('org.tier')).toBe(true);
    expect(r.toObject()).toEqual({ 'user.id': 'u1', 'org.tier': 'pro' });
  });
});

describe('ShortFormMemory', () => {
  it('persists values in DO storage with the mem:short prefix', async () => {
    const { agent, cleanup, state } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const s = new ShortFormMemory(agent);
      await s.set('draft', 'hello');
      expect(await s.get<string>('draft')).toBe('hello');
      expect(await state.storage.get('mem:short:draft')).toBe('hello');
      await s.delete('draft');
      expect(await s.get<string>('draft')).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('clear() removes every key under the tier prefix', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const s = new ShortFormMemory(agent);
      await s.set('a', 1);
      await s.set('b', 2);
      await s.clear();
      expect(await s.keys()).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe('KnowledgeMemory', () => {
  it('returns empty results when no backend is configured', async () => {
    const k = new KnowledgeMemory();
    expect(await k.query({ query: 'anything' })).toEqual([]);
    expect(k.hasBackend()).toBe(false);
  });

  it('delegates to the configured backend', async () => {
    const k = new KnowledgeMemory({
      async query(q) {
        return [{ id: '1', score: 0.9, content: `hit:${q.query}` }];
      },
    });
    const hits = await k.query({ query: 'ai' });
    expect(hits[0].content).toBe('hit:ai');
  });
});

describe('SkillsMemory', () => {
  const makeTool = (name: string): Tool => ({
    name() {
      return name;
    },
    description() {
      return `${name} skill`;
    },
    schema() {
      return {};
    },
    async handle(_r: ToolRequest) {
      return name;
    },
  });

  it('registers skills with lazy load', async () => {
    let loadCount = 0;
    const s = new SkillsMemory();
    s.register({
      name: 'weather',
      description: 'Weather',
      load: () => {
        loadCount++;
        return makeTool('weather');
      },
    });
    const tools = await s.tools(['weather']);
    expect(tools.length).toBe(1);
    expect(loadCount).toBe(1);
    await s.tools(['weather']);
    expect(loadCount).toBe(1);
  });

  it('filters by requested names when provided', async () => {
    const s = new SkillsMemory();
    s.register({ name: 'a', description: '', load: () => makeTool('a') });
    s.register({ name: 'b', description: '', load: () => makeTool('b') });
    const tools = await s.tools(['a']);
    expect(tools.map((t) => t.name!())).toEqual(['a']);
  });

  it('detects cycles when a skill load re-enters the same name', async () => {
    const s = new SkillsMemory();
    s.register({
      name: 'cyclic',
      description: '',
      load: async () => {
        await s.loadSkill('cyclic');
        return makeTool('cyclic');
      },
    });
    await expect(s.tools(['cyclic'])).rejects.toThrow(SkillRegistrationCycleError);
  });

  it('returns undefined when a skill is not registered', async () => {
    const s = new SkillsMemory();
    expect(await s.loadSkill('missing')).toBeUndefined();
  });
});

describe('Memory facade', () => {
  it('composes all four tiers', () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const mem = new Memory(agent, {
        context: [['tenant', 'acme']],
        knowledge: { async query() { return []; } },
      });
      expect(mem.context.get('tenant')).toBe('acme');
      expect(mem.shortForm).toBeInstanceOf(ShortFormMemory);
      expect(mem.knowledge.hasBackend()).toBe(true);
      expect(mem.skills.list()).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
