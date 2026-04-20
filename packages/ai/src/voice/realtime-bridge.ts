/**
 * Minimal realtime bridge abstraction. Concrete impls wrap CF Realtime SFU or
 * a Workers AI voice model. Kept interface-only so unit tests can supply a
 * stub without spinning up actual WebRTC infrastructure.
 */
export interface RealtimeBridge {
  start(): Promise<void>;
  /** Push outbound audio to the remote peer (agent → user). */
  sendAudio(chunk: Uint8Array): Promise<void>;
  /** Register a handler for inbound audio (user → agent). */
  onAudio(handler: (chunk: Uint8Array) => Promise<void> | void): void;
  onClose(handler: () => void): void;
  close(): Promise<void>;
  /** Outbound audio fed to `sendAudio`, exposed for assertions. */
  readonly outbound: Uint8Array[];
}

/**
 * In-memory `RealtimeBridge` used by unit tests. Outbound audio (from the
 * session's `send`/`say`) is collected on `outbound`; inbound audio is fed via
 * `receiveAudio()` which fires `onAudio` handlers. Keeping these channels
 * separate prevents feedback loops when a session auto-replies.
 */
export class InMemoryRealtimeBridge implements RealtimeBridge {
  readonly outbound: Uint8Array[] = [];
  private audioHandlers: Array<(chunk: Uint8Array) => Promise<void> | void> = [];
  private closeHandlers: Array<() => void> = [];
  private started = false;
  private closed = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async sendAudio(chunk: Uint8Array): Promise<void> {
    this.assertRunning();
    this.outbound.push(chunk);
  }

  /** Test helper — simulate an inbound audio chunk from the remote peer. */
  async receiveAudio(chunk: Uint8Array): Promise<void> {
    this.assertRunning();
    for (const h of this.audioHandlers) await h(chunk);
  }

  onAudio(handler: (chunk: Uint8Array) => Promise<void> | void): void {
    this.audioHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const h of this.closeHandlers) h();
  }

  private assertRunning(): void {
    if (!this.started || this.closed) throw new Error('Bridge not running');
  }
}
