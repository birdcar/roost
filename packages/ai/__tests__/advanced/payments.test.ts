import { describe, it, expect } from 'bun:test';
import {
  createChallenge,
  verifyPayment,
  NonceLedger,
  InMemoryWallet,
  PaymentRequiredError,
  PaymentReplayError,
  InvalidPaymentError,
  chargeForTool,
  InMemoryChallengeStore,
  payAgent,
} from '../../src/payments/index.js';
import { createToolRequest, type Tool, type ToolRequest } from '../../src/tool.js';

const priceUsd = { amount: 100, currency: 'usd' };

describe('x402 challenge + verify', () => {
  it('creates a challenge with a fresh nonce and expiry', () => {
    const c1 = createChallenge(priceUsd);
    const c2 = createChallenge(priceUsd);
    expect(c1.nonce).not.toBe(c2.nonce);
    expect(c1.expiresAt).toBeGreaterThan(c1.issuedAt);
  });

  it('verifies a correctly-signed proof', async () => {
    const wallet = new InMemoryWallet('alice', 'secret');
    const challenge = createChallenge(priceUsd);
    const proof = await wallet.sign(challenge);
    expect(verifyPayment(proof, priceUsd, challenge)).toBe(true);
  });

  it('rejects expired challenges', async () => {
    const wallet = new InMemoryWallet('alice', 'secret');
    const challenge = createChallenge(priceUsd, 5);
    const proof = await wallet.sign(challenge);
    await new Promise((r) => setTimeout(r, 15));
    expect(verifyPayment(proof, priceUsd, challenge)).toBe(false);
  });

  it('rejects proofs for a different nonce', async () => {
    const wallet = new InMemoryWallet('alice', 'secret');
    const challenge = createChallenge(priceUsd);
    const proof = await wallet.sign(createChallenge(priceUsd));
    expect(verifyPayment(proof, priceUsd, challenge)).toBe(false);
  });

  it('NonceLedger blocks replay', () => {
    const ledger = new NonceLedger();
    ledger.consume('abc');
    expect(() => ledger.consume('abc')).toThrow(PaymentReplayError);
  });
});

describe('chargeForTool', () => {
  const baseTool: Tool = {
    name() {
      return 'premium';
    },
    description() {
      return 'premium';
    },
    schema() {
      return {};
    },
    async handle() {
      return 'secret-data';
    },
  };

  it('throws PaymentRequiredError on the first call', async () => {
    const wrapped = chargeForTool(baseTool, priceUsd);
    await expect(wrapped.handle(createToolRequest({}))).rejects.toThrow(PaymentRequiredError);
  });

  it('returns the underlying result when paid with a valid proof', async () => {
    const store = new InMemoryChallengeStore();
    const wrapped = chargeForTool(baseTool, priceUsd, { challengeStore: store });
    const wallet = new InMemoryWallet('alice', 'secret');

    let proof;
    try {
      await wrapped.handle(createToolRequest({}));
    } catch (err) {
      const challenge = (err as PaymentRequiredError).challenge;
      proof = await wallet.sign(challenge);
    }
    const result = await wrapped.handle(createToolRequest({ __payment: proof }));
    expect(result).toBe('secret-data');
  });

  it('rejects a proof with an unknown nonce', async () => {
    const wrapped = chargeForTool(baseTool, priceUsd);
    const wallet = new InMemoryWallet('alice', 'secret');
    const proof = await wallet.sign(createChallenge(priceUsd));
    await expect(wrapped.handle(createToolRequest({ __payment: proof }))).rejects.toThrow(InvalidPaymentError);
  });

  it('emits onCharged when payment succeeds', async () => {
    const store = new InMemoryChallengeStore();
    const seen: string[] = [];
    const wrapped = chargeForTool(baseTool, priceUsd, {
      challengeStore: store,
      onCharged: (proof) => {
        seen.push(proof.payer);
      },
    });
    const wallet = new InMemoryWallet('alice', 'secret');

    let proof;
    try {
      await wrapped.handle(createToolRequest({}));
    } catch (err) {
      proof = await wallet.sign((err as PaymentRequiredError).challenge);
    }
    await wrapped.handle(createToolRequest({ __payment: proof }));
    expect(seen).toEqual(['alice']);
  });
});

describe('payAgent (MPP)', () => {
  it('flows a payment between a sender wallet and a recipient', async () => {
    const wallet = new InMemoryWallet('agent-a', 's');
    const recipient = {
      async requestPayment(price: typeof priceUsd) {
        return createChallenge(price);
      },
      async acceptPayment() {
        return true;
      },
    };
    const proof = await payAgent({ wallet }, recipient, priceUsd);
    expect(proof.payer).toBe('agent-a');
  });

  it('throws when recipient rejects the proof', async () => {
    const wallet = new InMemoryWallet('agent-a', 's');
    const recipient = {
      async requestPayment(price: typeof priceUsd) {
        return createChallenge(price);
      },
      async acceptPayment() {
        return false;
      },
    };
    await expect(payAgent({ wallet }, recipient, priceUsd)).rejects.toThrow('rejected');
  });
});

// Silence unused import warning for test-only types
void ({} as ToolRequest);
