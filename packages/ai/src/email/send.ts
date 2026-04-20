export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType?: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export class EmailSendError extends Error {
  override readonly name = 'EmailSendError';
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

class EmailService {
  private transport?: EmailTransport;
  private fakeImpl?: EmailFake;

  configure(transport: EmailTransport): void {
    this.transport = transport;
  }

  async send(message: EmailMessage): Promise<void> {
    if (this.fakeImpl) {
      this.fakeImpl.record(message);
      return;
    }
    if (!this.transport) {
      throw new EmailSendError('No email transport configured. Call Email.fake() for tests or register one in AiServiceProvider.');
    }
    await this.transport.send(message);
  }

  fake(): EmailFake {
    this.fakeImpl = new EmailFake();
    return this.fakeImpl;
  }

  restore(): void {
    this.fakeImpl = undefined;
  }

  assertSent(predicate: (msg: EmailMessage) => boolean): void {
    if (!this.fakeImpl) throw new Error('Email.assertSent called without Email.fake()');
    this.fakeImpl.assertSent(predicate);
  }

  assertNothingSent(): void {
    if (!this.fakeImpl) throw new Error('Email.assertNothingSent called without Email.fake()');
    this.fakeImpl.assertNothingSent();
  }
}

export class EmailFake {
  readonly sent: EmailMessage[] = [];

  record(message: EmailMessage): void {
    this.sent.push(message);
  }

  assertSent(predicate: (msg: EmailMessage) => boolean): void {
    if (!this.sent.some(predicate)) {
      throw new Error(
        `Expected a matching email to be sent. Sent: ${JSON.stringify(this.sent.map((m) => m.subject))}`,
      );
    }
  }

  assertNothingSent(): void {
    if (this.sent.length > 0) {
      throw new Error(`Expected no emails sent, but ${this.sent.length} were.`);
    }
  }
}

export const Email = new EmailService();
