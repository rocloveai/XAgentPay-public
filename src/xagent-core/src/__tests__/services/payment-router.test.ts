import { describe, it, expect } from "vitest";
import { routePayment } from "../../services/payment-router.js";
import { makeTestQuote } from "../fixtures.js";

describe("payment-router", () => {
  it("routes all payments to ESCROW_CONTRACT in MVP", () => {
    const quote = makeTestQuote();
    const decision = routePayment(quote);
    expect(decision.method).toBe("ESCROW_CONTRACT");
    expect(decision.reason).toContain("escrow");
  });

  it("returns consistent routing regardless of amount", () => {
    const small = makeTestQuote({ amount: "1" });
    const large = makeTestQuote({ amount: "999999999" });
    expect(routePayment(small).method).toBe(routePayment(large).method);
  });
});
