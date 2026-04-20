import type { StatefulAgent } from '../stateful/agent.js';
import { InMemoryRealtimeBridge, type RealtimeBridge } from './realtime-bridge.js';

export interface VoiceStreamOptions {
  agent: StatefulAgent;
  inputFormat?: 'webrtc' | 'ws-pcm';
  voiceId?: string;
  bridge?: RealtimeBridge;
  transcribe?: (chunk: Uint8Array) => Promise<string>;
  synthesize?: (text: string) => Promise<Uint8Array>;
}

export type UtteranceHandler = (text: string) => void | string | Promise<string | void>;

export class VoiceSession {
  private utteranceHandler?: UtteranceHandler;
  private closed = false;

  constructor(
    readonly bridge: RealtimeBridge,
    private readonly opts: Required<Pick<VoiceStreamOptions, 'transcribe' | 'synthesize'>>,
  ) {
    this.bridge.onAudio(async (chunk) => {
      if (this.closed) return;
      const text = await this.opts.transcribe(chunk);
      if (!text) return;
      if (this.utteranceHandler) {
        const response = await this.utteranceHandler(text);
        if (typeof response === 'string' && response.length > 0) {
          await this.say(response);
        }
      }
    });
    this.bridge.onClose(() => {
      this.closed = true;
    });
  }

  onUtterance(handler: UtteranceHandler): this {
    this.utteranceHandler = handler;
    return this;
  }

  async send(audio: Uint8Array): Promise<void> {
    if (this.closed) throw new VoiceSessionClosedError();
    await this.bridge.sendAudio(audio);
  }

  async say(text: string): Promise<void> {
    if (this.closed) throw new VoiceSessionClosedError();
    const audio = await this.opts.synthesize(text);
    await this.bridge.sendAudio(audio);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.bridge.close();
    this.closed = true;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

export class VoiceSessionClosedError extends Error {
  override readonly name = 'VoiceSessionClosedError';
  constructor() {
    super('Voice session is closed.');
  }
}

export const Voice = {
  async stream(opts: VoiceStreamOptions): Promise<VoiceSession> {
    const bridge = opts.bridge ?? new InMemoryRealtimeBridge();
    await bridge.start();
    const session = new VoiceSession(bridge, {
      transcribe: opts.transcribe ?? (async () => ''),
      synthesize: opts.synthesize ?? (async () => new Uint8Array()),
    });
    return session;
  },
};
