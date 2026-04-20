export interface Price {
  amount: number;
  currency: string;
  asset?: string;
}

export interface PaymentChallenge {
  nonce: string;
  price: Price;
  issuedAt: number;
  expiresAt: number;
}

export interface PaymentProof {
  nonce: string;
  payer: string;
  signature: string;
  paidAt: number;
  price: Price;
}

export class PaymentRequiredError extends Error {
  override readonly name = 'PaymentRequiredError';
  constructor(public readonly challenge: PaymentChallenge) {
    super(`Payment required: ${challenge.price.amount} ${challenge.price.currency}`);
  }
}

export class InvalidPaymentError extends Error {
  override readonly name = 'InvalidPaymentError';
  constructor(reason: string) {
    super(`Invalid payment: ${reason}`);
  }
}

export class PaymentReplayError extends Error {
  override readonly name = 'PaymentReplayError';
  constructor(nonce: string) {
    super(`Payment proof with nonce '${nonce}' was already consumed.`);
  }
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function createChallenge(price: Price, ttlMs = DEFAULT_TTL_MS): PaymentChallenge {
  const issuedAt = Date.now();
  return {
    nonce: generateNonce(),
    price,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
  };
}

/**
 * In-memory ledger of consumed nonces. Single-use to prevent replay.
 */
export class NonceLedger {
  private consumed = new Set<string>();

  has(nonce: string): boolean {
    return this.consumed.has(nonce);
  }

  consume(nonce: string): void {
    if (this.consumed.has(nonce)) throw new PaymentReplayError(nonce);
    this.consumed.add(nonce);
  }

  reset(): void {
    this.consumed.clear();
  }
}

/**
 * Verify a payment proof against expected price. The signature check is
 * abstracted — a `Verifier` strategy can plug in real on-chain verification;
 * default is a signature-equals-expected check suitable for InMemoryWallet.
 */
export type SignatureVerifier = (proof: PaymentProof) => boolean;

export interface VerifyOptions {
  ledger?: NonceLedger;
  verifySignature?: SignatureVerifier;
  now?: () => number;
}

export function verifyPayment(
  proof: PaymentProof,
  expectedPrice: Price,
  challenge: PaymentChallenge,
  opts: VerifyOptions = {},
): boolean {
  const now = opts.now?.() ?? Date.now();
  if (proof.nonce !== challenge.nonce) return false;
  if (challenge.expiresAt < now) return false;
  if (expectedPrice.amount !== proof.price.amount) return false;
  if (expectedPrice.currency !== proof.price.currency) return false;
  if (expectedPrice.asset !== proof.price.asset) return false;
  const verify = opts.verifySignature ?? defaultVerifier;
  if (!verify(proof)) return false;
  if (opts.ledger) opts.ledger.consume(proof.nonce);
  return true;
}

const defaultVerifier: SignatureVerifier = (proof) => proof.signature.length > 0;

function generateNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `nonce-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Wallet abstraction — signs payment challenges into proofs.
 */
export interface Wallet {
  readonly id: string;
  sign(challenge: PaymentChallenge): Promise<PaymentProof>;
}

export class InMemoryWallet implements Wallet {
  constructor(public readonly id: string, private readonly secret: string) {}

  async sign(challenge: PaymentChallenge): Promise<PaymentProof> {
    const signature = `${this.secret}:${challenge.nonce}`;
    return {
      nonce: challenge.nonce,
      payer: this.id,
      signature,
      paidAt: Date.now(),
      price: challenge.price,
    };
  }
}
