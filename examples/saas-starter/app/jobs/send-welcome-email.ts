import { Job } from '@roost/queue';

interface WelcomeEmailPayload {
  email: string;
  name: string;
  orgName: string;
}

export class SendWelcomeEmail extends Job<WelcomeEmailPayload> {
  async handle() {
    const { email, name, orgName } = this.payload;
    console.log(`[SendWelcomeEmail] Sending welcome to ${name} (${email}) for org "${orgName}"`);
    // In production: integrate with Resend, Postmark, etc.
  }
}
