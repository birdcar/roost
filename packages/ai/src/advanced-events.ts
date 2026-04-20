import { Event } from '@roostjs/events';
import type { ApprovalRequest } from './hitl/approval.js';
import type { PaymentProof, Price } from './payments/x402.js';
import type { EmailMessage } from './email/send.js';

export class ApprovalRequested extends Event {
  constructor(public readonly request: ApprovalRequest) {
    super();
  }
}

export class ApprovalDecided extends Event {
  constructor(public readonly request: ApprovalRequest) {
    super();
  }
}

export class ApprovalExpired extends Event {
  constructor(public readonly request: ApprovalRequest) {
    super();
  }
}

export class ToolCharged extends Event {
  constructor(
    public readonly toolName: string,
    public readonly price: Price,
    public readonly proof: PaymentProof,
  ) {
    super();
  }
}

export class InvalidPayment extends Event {
  constructor(public readonly reason: string) {
    super();
  }
}

export class VoiceSessionOpened extends Event {
  constructor(public readonly agentName: string) {
    super();
  }
}

export class VoiceSessionClosed extends Event {
  constructor(public readonly agentName: string) {
    super();
  }
}

export class EmailSent extends Event {
  constructor(public readonly message: EmailMessage) {
    super();
  }
}

export class EmailReceived extends Event {
  constructor(public readonly from: string, public readonly subject: string) {
    super();
  }
}

export class BrowserNavigated extends Event {
  constructor(public readonly url: string) {
    super();
  }
}

export class CodeModeExecuted extends Event {
  constructor(
    public readonly intent: string,
    public readonly cached: boolean,
    public readonly durationMs: number,
  ) {
    super();
  }
}
