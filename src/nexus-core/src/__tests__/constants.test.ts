import { describe, it, expect } from "vitest";
import {
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
  ALL_STATUSES,
  AWAITING_TX_TIMEOUT_MS,
  DEFAULT_RELEASE_TIMEOUT_S,
  DEFAULT_DISPUTE_WINDOW_S,
  PLATON_CHAIN_ID,
  USDC_DECIMALS,
  PROTOCOL_FEE_BPS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MS,
} from "../constants.js";
import type { PaymentStatus } from "../types.js";

describe("VALID_TRANSITIONS", () => {
  it("covers all 12 statuses", () => {
    expect(VALID_TRANSITIONS.size).toBe(12);
    for (const status of ALL_STATUSES) {
      expect(VALID_TRANSITIONS.has(status)).toBe(true);
    }
  });

  it("terminal statuses have empty transition sets", () => {
    for (const status of TERMINAL_STATUSES) {
      const targets = VALID_TRANSITIONS.get(status);
      expect(targets).toBeDefined();
      expect(targets!.size).toBe(0);
    }
  });

  it("has no self-transitions", () => {
    for (const [from, targets] of VALID_TRANSITIONS) {
      expect(targets.has(from)).toBe(false);
    }
  });

  it("CREATED can transition to AWAITING_TX, EXPIRED, RISK_REJECTED", () => {
    const targets = VALID_TRANSITIONS.get("CREATED")!;
    expect(targets.has("AWAITING_TX")).toBe(true);
    expect(targets.has("EXPIRED")).toBe(true);
    expect(targets.has("RISK_REJECTED")).toBe(true);
    expect(targets.size).toBe(3);
  });

  it("BROADCASTED can transition to SETTLED, ESCROWED, TX_FAILED, RISK_REJECTED", () => {
    const targets = VALID_TRANSITIONS.get("BROADCASTED")!;
    expect(targets.has("SETTLED")).toBe(true);
    expect(targets.has("ESCROWED")).toBe(true);
    expect(targets.has("TX_FAILED")).toBe(true);
    expect(targets.has("RISK_REJECTED")).toBe(true);
  });

  it("ESCROWED can transition to SETTLED, REFUNDED, DISPUTE_OPEN", () => {
    const targets = VALID_TRANSITIONS.get("ESCROWED")!;
    expect(targets.has("SETTLED")).toBe(true);
    expect(targets.has("REFUNDED")).toBe(true);
    expect(targets.has("DISPUTE_OPEN")).toBe(true);
    expect(targets.size).toBe(3);
  });
});

describe("TERMINAL_STATUSES", () => {
  it("contains exactly 6 terminal states", () => {
    expect(TERMINAL_STATUSES.size).toBe(6);
    const expected: PaymentStatus[] = [
      "COMPLETED",
      "EXPIRED",
      "TX_FAILED",
      "RISK_REJECTED",
      "REFUNDED",
      "DISPUTE_RESOLVED",
    ];
    for (const s of expected) {
      expect(TERMINAL_STATUSES.has(s)).toBe(true);
    }
  });
});

describe("constant values", () => {
  it("AWAITING_TX_TIMEOUT_MS is 30 minutes", () => {
    expect(AWAITING_TX_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it("DEFAULT_RELEASE_TIMEOUT_S is 24 hours", () => {
    expect(DEFAULT_RELEASE_TIMEOUT_S).toBe(86400);
  });

  it("DEFAULT_DISPUTE_WINDOW_S is 72 hours", () => {
    expect(DEFAULT_DISPUTE_WINDOW_S).toBe(259200);
  });

  it("chain constants", () => {
    expect(PLATON_CHAIN_ID).toBe(20250407);
    expect(USDC_DECIMALS).toBe(6);
    expect(PROTOCOL_FEE_BPS).toBe(30);
  });

  it("webhook constants", () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(6);
    expect(WEBHOOK_RETRY_DELAYS_MS).toHaveLength(5);
    // delays should be strictly increasing
    for (let i = 1; i < WEBHOOK_RETRY_DELAYS_MS.length; i++) {
      expect(WEBHOOK_RETRY_DELAYS_MS[i]).toBeGreaterThan(
        WEBHOOK_RETRY_DELAYS_MS[i - 1],
      );
    }
  });
});
