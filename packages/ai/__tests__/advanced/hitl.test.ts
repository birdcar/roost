import { describe, it, expect } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';
import {
  requireApproval,
  approve,
  getApproval,
  listPendingApprovals,
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
} from '../../src/hitl/approval.js';
import { toElicitationEnvelope } from '../../src/hitl/mcp-bridge.js';

class DemoAgent extends StatefulAgent {
  instructions() {
    return 'demo';
  }
}

describe('HITL approval state machine', () => {
  it('suspends requireApproval until approve resolves the waiter', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const pending = requireApproval(agent, 'charge', { amount: 100 });
      const list = await listPendingApprovals(agent);
      expect(list.length).toBe(1);
      const resolved = await approve(agent, list[0].id, 'approved', 'reviewer@example.com');
      expect(resolved.status).toBe('approved');
      const final = await pending;
      expect(final.status).toBe('approved');
      expect(final.decision?.by).toBe('reviewer@example.com');
    } finally {
      cleanup();
    }
  });

  it('marks the request expired when timeout elapses before approval', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const result = await requireApproval(agent, 'slow', {}, { timeout: 10 });
      expect(result.status).toBe('expired');
    } finally {
      cleanup();
    }
  });

  it('rejects double-approve with ApprovalAlreadyDecidedError', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const pending = requireApproval(agent, 'charge', {});
      const [list] = await Promise.all([listPendingApprovals(agent)]);
      await approve(agent, list[0].id, 'approved', 'u');
      await expect(approve(agent, list[0].id, 'rejected', 'u')).rejects.toThrow(ApprovalAlreadyDecidedError);
      await pending;
    } finally {
      cleanup();
    }
  });

  it('throws ApprovalNotFoundError for unknown ids', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      await expect(approve(agent, 'nope', 'approved', 'u')).rejects.toThrow(ApprovalNotFoundError);
    } finally {
      cleanup();
    }
  });

  it('invokes the router callback with the persisted request', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      let routed = '';
      const pending = requireApproval(agent, 'step', { x: 1 }, {
        router: async (r) => {
          routed = r.id;
        },
      });
      const list = await listPendingApprovals(agent);
      expect(routed).toBe(list[0].id);
      await approve(agent, list[0].id, 'approved', 'u');
      await pending;
    } finally {
      cleanup();
    }
  });

  it('getApproval returns the stored request', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const pending = requireApproval(agent, 'lookup', {});
      const list = await listPendingApprovals(agent);
      const stored = await getApproval(agent, list[0].id);
      expect(stored?.step).toBe('lookup');
      await approve(agent, list[0].id, 'approved', 'u');
      await pending;
    } finally {
      cleanup();
    }
  });
});

describe('toElicitationEnvelope', () => {
  it('shapes the request as an MCP elicitation envelope', () => {
    const envelope = toElicitationEnvelope({
      id: 'a',
      step: 'pay',
      payload: { amount: 10 },
      createdAt: 1,
      expiresAt: 2,
      status: 'pending',
    });
    expect(envelope.method).toBe('elicitation/create');
    expect(envelope.params.approvalId).toBe('a');
    expect(envelope.params.payload).toEqual({ amount: 10 });
  });
});
