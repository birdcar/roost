import { describe, it, expect } from 'bun:test';
import { runInAgentContext, getCurrentAgent } from '../../src/stateful/context.js';

describe('getCurrentAgent / runInAgentContext', () => {
  it('returns empty slots outside of any context', () => {
    const slot = getCurrentAgent();
    expect(slot.agent).toBeUndefined();
    expect(slot.request).toBeUndefined();
  });

  it('exposes the agent to callers running inside runInAgentContext', async () => {
    const marker = { kind: 'agent-marker' };
    const result = await runInAgentContext({ agent: marker }, async () => {
      return getCurrentAgent<typeof marker>().agent;
    });
    expect(result).toBe(marker);
  });

  it('isolates nested contexts — inner slot wins, outer remains after inner returns', async () => {
    const outer = { name: 'outer' };
    const inner = { name: 'inner' };
    await runInAgentContext({ agent: outer }, async () => {
      await runInAgentContext({ agent: inner }, async () => {
        expect(getCurrentAgent<{ name: string }>().agent?.name).toBe('inner');
      });
      expect(getCurrentAgent<{ name: string }>().agent?.name).toBe('outer');
    });
  });

  it('passes request through to the slot', async () => {
    const req = new Request('https://example.com/');
    await runInAgentContext({ request: req }, async () => {
      expect(getCurrentAgent().request).toBe(req);
    });
  });
});