import { describe, it, expect, beforeEach } from "vitest";
import { MockEventRepository } from "../mocks/mock-event-repo.js";
import type { CreateEventParams } from "../../types.js";

function makeEvent(id: string, paymentId: string): CreateEventParams {
  return {
    event_id: id,
    xagent_payment_id: paymentId,
    event_type: "PAYMENT_CREATED",
    from_status: null,
    to_status: "CREATED",
    metadata: { source: "test" },
  };
}

describe("MockEventRepository", () => {
  let repo: MockEventRepository;

  beforeEach(() => {
    repo = new MockEventRepository();
  });

  it("append creates an event and returns it", async () => {
    const event = await repo.append(makeEvent("E-1", "P-1"));
    expect(event.event_id).toBe("E-1");
    expect(event.xagent_payment_id).toBe("P-1");
    expect(event.event_type).toBe("PAYMENT_CREATED");
    expect(event.from_status).toBeNull();
    expect(event.to_status).toBe("CREATED");
    expect(event.metadata).toEqual({ source: "test" });
    expect(event.created_at).toBeDefined();
  });

  it("findByPaymentId returns events in chronological order", async () => {
    await repo.append(makeEvent("E-1", "P-1"));
    // small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 5));
    await repo.append({
      ...makeEvent("E-2", "P-1"),
      event_type: "PAYMENT_FINALIZED",
      from_status: "CREATED",
      to_status: "AWAITING_TX",
    });

    const events = await repo.findByPaymentId("P-1");
    expect(events).toHaveLength(2);
    expect(events[0].event_id).toBe("E-1");
    expect(events[1].event_id).toBe("E-2");
  });

  it("findByPaymentId returns empty array for unknown payment", async () => {
    const events = await repo.findByPaymentId("unknown");
    expect(events).toHaveLength(0);
  });

  it("events for different payments are separate", async () => {
    await repo.append(makeEvent("E-1", "P-1"));
    await repo.append(makeEvent("E-2", "P-2"));

    const p1Events = await repo.findByPaymentId("P-1");
    const p2Events = await repo.findByPaymentId("P-2");

    expect(p1Events).toHaveLength(1);
    expect(p2Events).toHaveLength(1);
    expect(p1Events[0].event_id).toBe("E-1");
    expect(p2Events[0].event_id).toBe("E-2");
  });

  it("EventRepository has no update or delete methods", () => {
    // Verify the interface is truly append-only
    expect(typeof repo.append).toBe("function");
    expect(typeof repo.findByPaymentId).toBe("function");
    expect((repo as unknown as Record<string, unknown>)["update"]).toBeUndefined();
    expect((repo as unknown as Record<string, unknown>)["delete"]).toBeUndefined();
    expect((repo as unknown as Record<string, unknown>)["remove"]).toBeUndefined();
  });
});
