import type { Tool, ToolRequest } from '../tool.js';
import type { PaymentChallenge, PaymentProof, Price, NonceLedger, VerifyOptions } from './x402.js';
import { createChallenge, verifyPayment, PaymentRequiredError, InvalidPaymentError } from './x402.js';

export interface ChargeOptions {
  ledger?: NonceLedger;
  challengeStore?: ChallengeStore;
  ttlMs?: number;
  verify?: VerifyOptions;
  onCharged?: (proof: PaymentProof, tool: Tool) => void | Promise<void>;
}

/**
 * Minimal challenge cache — maps `nonce` to issued challenge so `verifyPayment`
 * can re-hydrate. Pluggable so callers using DO storage can substitute.
 */
export interface ChallengeStore {
  put(challenge: PaymentChallenge): Promise<void> | void;
  get(nonce: string): Promise<PaymentChallenge | undefined> | PaymentChallenge | undefined;
  delete(nonce: string): Promise<void> | void;
}

export class InMemoryChallengeStore implements ChallengeStore {
  private data = new Map<string, PaymentChallenge>();
  put(c: PaymentChallenge) {
    this.data.set(c.nonce, c);
  }
  get(nonce: string) {
    return this.data.get(nonce);
  }
  delete(nonce: string) {
    this.data.delete(nonce);
  }
}

/**
 * Wrap a Tool so invocations require payment. First call without `__payment`
 * throws `PaymentRequiredError` carrying a fresh challenge. The caller pays
 * (externally; via a Wallet), then retries with `__payment: proof`.
 */
export function chargeForTool<T extends Tool>(tool: T, price: Price, opts: ChargeOptions = {}): T {
  const store = opts.challengeStore ?? new InMemoryChallengeStore();
  const originalHandle = tool.handle.bind(tool);
  const wrapped: Tool = {
    name: tool.name?.bind(tool),
    description: tool.description.bind(tool),
    schema: tool.schema.bind(tool),
    async handle(request: ToolRequest): Promise<string> {
      const proof = request.get<PaymentProof | undefined>('__payment');
      if (!proof) {
        const challenge = createChallenge(price, opts.ttlMs);
        await store.put(challenge);
        throw new PaymentRequiredError(challenge);
      }
      const challenge = await store.get(proof.nonce);
      if (!challenge) throw new InvalidPaymentError(`Unknown challenge '${proof.nonce}'`);
      const ok = verifyPayment(proof, price, challenge, { ledger: opts.ledger, ...opts.verify });
      if (!ok) throw new InvalidPaymentError('Proof did not verify');
      await store.delete(proof.nonce);
      if (opts.onCharged) await opts.onCharged(proof, tool);
      return originalHandle(request);
    },
  };
  return wrapped as T;
}
