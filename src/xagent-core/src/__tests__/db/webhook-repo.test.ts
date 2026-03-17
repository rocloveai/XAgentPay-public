import { describe, it, expect, beforeEach } from "vitest";
import { MockWebhookRepository } from "../mocks/mock-webhook-repo.js";
import type { CreateWebhookLogParams } from "../../types.js";

function makeLog(id: string): CreateWebhookLogParams {
  return {
    log_id: id,
    xagent_payment_id: "P-1",
    merchant_did: "did:nexus:210425:demo_flight",
    webhook_url: "http://localhost:3001/webhook",
    event_type: "payment.settled",
    request_body: { test: true },
  };
}

describe("MockWebhookRepository", () => {
  let repo: MockWebhookRepository;

  beforeEach(() => {
    repo = new MockWebhookRepository();
  });

  it("insert creates a log entry", async () => {
    const log = await repo.insert(makeLog("WH-1"));
    expect(log.log_id).toBe("WH-1");
    expect(log.attempt_number).toBe(1);
    expect(log.delivered_at).toBeNull();
    expect(log.response_status).toBeNull();
    expect(log.next_retry_at).toBeNull();
  });

  it("markDelivered sets delivered_at and clears next_retry_at", async () => {
    await repo.insert(makeLog("WH-1"));
    const updated = await repo.markDelivered("WH-1", 200, '{"ok":true}');
    expect(updated).not.toBeNull();
    expect(updated!.delivered_at).not.toBeNull();
    expect(updated!.response_status).toBe(200);
    expect(updated!.response_body).toBe('{"ok":true}');
    expect(updated!.next_retry_at).toBeNull();
  });

  it("markDelivered returns null for unknown log", async () => {
    const result = await repo.markDelivered("unknown", 200, "ok");
    expect(result).toBeNull();
  });

  it("markFailed increments attempt and sets next_retry_at", async () => {
    await repo.insert(makeLog("WH-1"));
    const retryAt = new Date(Date.now() + 10_000).toISOString();
    const updated = await repo.markFailed("WH-1", 500, "server error", retryAt);
    expect(updated).not.toBeNull();
    expect(updated!.attempt_number).toBe(2);
    expect(updated!.next_retry_at).toBe(retryAt);
    expect(updated!.response_status).toBe(500);
  });

  it("findPendingRetries filters correctly", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    // log that should be retried
    await repo.insert(makeLog("WH-RETRY"));
    await repo.markFailed("WH-RETRY", 500, "err", past);

    // log already delivered — should not appear
    await repo.insert(makeLog("WH-DONE"));
    await repo.markDelivered("WH-DONE", 200, "ok");

    // log with future retry — should not appear
    await repo.insert(makeLog("WH-FUTURE"));
    await repo.markFailed("WH-FUTURE", 500, "err", future);

    const pending = await repo.findPendingRetries(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].log_id).toBe("WH-RETRY");
  });

  it("findPendingRetries excludes logs over max attempts", async () => {
    await repo.insert(makeLog("WH-MAX"));
    const past = new Date(Date.now() - 1000).toISOString();

    // Simulate 5 failures (attempt goes from 1 -> 6)
    for (let i = 0; i < 5; i++) {
      await repo.markFailed("WH-MAX", 500, "err", past);
    }

    const pending = await repo.findPendingRetries(new Date().toISOString());
    expect(pending).toHaveLength(0);
  });
});
