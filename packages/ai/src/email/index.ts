export { Email, EmailFake, EmailSendError } from './send.js';
export type { EmailMessage, EmailAttachment, EmailTransport } from './send.js';
export { createEmailHandler, hasEmailInbound } from './inbound.js';
export type { ForwardedEmail, InboundEmailContract, AgentFactory } from './inbound.js';
