import { describe, it, expect, beforeEach } from "vitest";
import {
  computeQuoteHash,
  checkQuoteExpiry,
  resolveMerchantDid,
  checkNonceGuard,
} from "../../services/security.js";
import { SecurityError } from "../../errors.js";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import { MockMerchantRepository } from "../mocks/mock-merchant-repo.js";
import { makeTestQuote, TEST_FLIGHT_MERCHANT } from "../fixtures.js";

describe("security", () => {
  let paymentRepo: MockPaymentRepository;
  let merchantRepo: MockMerchantRepository;

  beforeEach(() => {
    paymentRepo = new MockPaymentRepository();
    merchantRepo = new MockMerchantRepository();
  });

  describe("computeQuoteHash", () => {
    it("returns a deterministic hex string", () => {
      const quote = makeTestQuote();
      const hash1 = computeQuoteHash(quote);
      const hash2 = computeQuoteHash(quote);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it("produces different hashes for different quotes", () => {
      const q1 = makeTestQuote({ amount: "100000" });
      const q2 = makeTestQuote({ amount: "200000" });
      expect(computeQuoteHash(q1)).not.toBe(computeQuoteHash(q2));
    });
  });

  describe("checkQuoteExpiry", () => {
    it("does not throw for valid expiry", () => {
      const quote = makeTestQuote({
        expiry: Math.floor(Date.now() / 1000) + 600,
      });
      expect(() => checkQuoteExpiry(quote)).not.toThrow();
    });

    it("throws SecurityError for expired quote", () => {
      const quote = makeTestQuote({
        expiry: Math.floor(Date.now() / 1000) - 10,
      });
      expect(() => checkQuoteExpiry(quote)).toThrow(SecurityError);
    });
  });

  describe("resolveMerchantDid", () => {
    it("returns merchant when found and active", async () => {
      merchantRepo.seed([TEST_FLIGHT_MERCHANT]);
      const result = await resolveMerchantDid(
        TEST_FLIGHT_MERCHANT.merchant_did,
        merchantRepo,
      );
      expect(result.merchant_did).toBe(TEST_FLIGHT_MERCHANT.merchant_did);
    });

    it("throws SecurityError when merchant not found", async () => {
      await expect(
        resolveMerchantDid("did:xagent:unknown", merchantRepo),
      ).rejects.toThrow(SecurityError);
    });
  });

  describe("checkNonceGuard", () => {
    it("does not throw when quote hash is new", async () => {
      const hash = computeQuoteHash(makeTestQuote());
      await expect(checkNonceGuard(hash, paymentRepo)).resolves.not.toThrow();
    });

    it("throws SecurityError when quote hash already used", async () => {
      const quote = makeTestQuote();
      const hash = computeQuoteHash(quote);

      // Insert a payment with this quote hash
      await paymentRepo.insert({
        xagent_payment_id: "PAY-existing",
        group_id: null,
        quote_hash: hash,
        merchant_did: quote.merchant_did,
        merchant_order_ref: quote.merchant_order_ref,
        payer_wallet: "0x1234567890abcdef1234567890abcdef12345678",
        payment_address: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
        amount: quote.amount,
        amount_display: "0.10",
        currency: "USDC",
        chain_id: 20250407,
        payment_method: "ESCROW_CONTRACT",
        quote_payload: quote,
        iso_metadata: null,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

      await expect(checkNonceGuard(hash, paymentRepo)).rejects.toThrow(
        SecurityError,
      );
    });
  });
});
