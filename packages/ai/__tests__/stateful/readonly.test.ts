import { describe, it, expect } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { createReadonlyConnection, _notifyReadonlySubscribers } from '../../src/stateful/readonly.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';

class DemoAgent extends StatefulAgent {
  instructions() { return 'demo'; }
}

describe('createReadonlyConnection.state', () => {
  it('returns a frozen snapshot of the agent state', async () => {
    const harness = TestStatefulAgentHarness.for(DemoAgent)
      .withState({ currentTopic: 'billing', counter: 3 });
    const { agent, cleanup } = harness.build();
    try {
      const conn = createReadonlyConnection(agent);
      const snapshot = await conn.state();
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(snapshot.currentTopic).toBe('billing');
      expect(snapshot.counter).toBe(3);
    } finally {
      cleanup();
    }
  });

  it('deeply freezes nested objects so consumers cannot mutate state through references', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent)
      .withState({ nested: { a: 1, b: { c: 2 } } })
      .build();
    try {
      const snapshot = await createReadonlyConnection(agent).state();
      const nested = snapshot.nested as { b: { c: number } };
      expect(Object.isFrozen(nested)).toBe(true);
      expect(Object.isFrozen(nested.b)).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('createReadonlyConnection.subscribe', () => {
  it('invokes subscribers when _notifyReadonlySubscribers fires for the key', () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const conn = createReadonlyConnection(agent);
      const received: unknown[] = [];
      const unsubscribe = conn.subscribe('counter', (v) => received.push(v));
      _notifyReadonlySubscribers(agent, 'counter', 42);
      expect(received).toEqual([42]);
      unsubscribe();
      _notifyReadonlySubscribers(agent, 'counter', 43);
      expect(received).toEqual([42]);
    } finally {
      cleanup();
    }
  });
});