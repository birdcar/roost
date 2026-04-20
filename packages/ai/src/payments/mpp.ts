import type { PaymentChallenge, PaymentProof, Price, Wallet } from './x402.js';

export interface MppRecipient {
  requestPayment(price: Price): Promise<PaymentChallenge>;
  acceptPayment(proof: PaymentProof): Promise<boolean>;
}

/**
 * Agent-to-agent payment flow. Sender asks recipient to issue a challenge,
 * signs it via the configured wallet, and hands the proof back for acceptance.
 */
export async function payAgent(
  sender: { wallet: Wallet },
  recipient: MppRecipient,
  price: Price,
): Promise<PaymentProof> {
  const challenge = await recipient.requestPayment(price);
  const proof = await sender.wallet.sign(challenge);
  const accepted = await recipient.acceptPayment(proof);
  if (!accepted) throw new Error('Recipient rejected payment proof');
  return proof;
}
