import { describe, it, expect } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';
import { Voice, InMemoryRealtimeBridge, VoiceSessionClosedError } from '../../src/voice/index.js';

class DemoAgent extends StatefulAgent {
  instructions() {
    return 'v';
  }
}

describe('Voice.stream', () => {
  it('transcribes inbound audio and invokes the utterance handler', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const bridge = new InMemoryRealtimeBridge();
      const transcripts: string[] = [];
      const session = await Voice.stream({
        agent,
        bridge,
        transcribe: async () => 'hello',
        synthesize: async () => new Uint8Array([1, 2, 3]),
      });
      session.onUtterance((text) => {
        transcripts.push(text);
      });
      await bridge.receiveAudio(new Uint8Array([0, 0, 0]));
      expect(transcripts).toEqual(['hello']);
      await session.close();
    } finally {
      cleanup();
    }
  });

  it('auto-synthesises the handler response and sends it back', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const bridge = new InMemoryRealtimeBridge();
      const synthesised: string[] = [];
      const session = await Voice.stream({
        agent,
        bridge,
        transcribe: async () => 'ping',
        synthesize: async (text) => {
          synthesised.push(text);
          return new Uint8Array([7]);
        },
      });
      session.onUtterance(() => 'pong');
      await bridge.receiveAudio(new Uint8Array([0]));
      expect(synthesised).toEqual(['pong']);
      expect(bridge.outbound.length).toBe(1);
      await session.close();
    } finally {
      cleanup();
    }
  });

  it('close() flips isClosed and blocks further sends', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const bridge = new InMemoryRealtimeBridge();
      const session = await Voice.stream({ agent, bridge });
      await session.close();
      expect(session.isClosed).toBe(true);
      await expect(session.send(new Uint8Array([1]))).rejects.toThrow(VoiceSessionClosedError);
    } finally {
      cleanup();
    }
  });
});
