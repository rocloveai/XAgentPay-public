import { describe, it, expect, beforeEach } from "vitest";
import { MockGroupRepository } from "../mocks/mock-group-repo.js";
import { TEST_PAYER_WALLET } from "../fixtures.js";

describe("MockGroupRepository", () => {
  let repo: MockGroupRepository;

  beforeEach(() => {
    repo = new MockGroupRepository();
  });

  it("inserts and finds a group", async () => {
    const group = await repo.insert({
      group_id: "GRP-1",
      payer_wallet: TEST_PAYER_WALLET,
      total_amount: "200000",
      total_amount_display: "0.20",
      currency: "USDC",
      chain_id: 20250407,
      payment_count: 2,
    });

    expect(group.group_id).toBe("GRP-1");
    expect(group.status).toBe("GROUP_CREATED");
    expect(group.payment_count).toBe(2);

    const found = await repo.findById("GRP-1");
    expect(found).not.toBeNull();
    expect(found!.total_amount).toBe("200000");
  });

  it("returns null for unknown group", async () => {
    const found = await repo.findById("GRP-nonexistent");
    expect(found).toBeNull();
  });

  it("updates group status", async () => {
    await repo.insert({
      group_id: "GRP-2",
      payer_wallet: TEST_PAYER_WALLET,
      total_amount: "100000",
      total_amount_display: "0.10",
      currency: "USDC",
      chain_id: 20250407,
      payment_count: 1,
    });

    const updated = await repo.updateStatus(
      "GRP-2",
      "GROUP_ESCROWED",
      { tx_hash: "0xabc" },
    );
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("GROUP_ESCROWED");
    expect(updated!.tx_hash).toBe("0xabc");
  });

  it("finds groups by payer wallet", async () => {
    await repo.insert({
      group_id: "GRP-3",
      payer_wallet: TEST_PAYER_WALLET,
      total_amount: "100000",
      total_amount_display: "0.10",
      currency: "USDC",
      chain_id: 20250407,
      payment_count: 1,
    });
    await repo.insert({
      group_id: "GRP-4",
      payer_wallet: "0x0000000000000000000000000000000000000099",
      total_amount: "50000",
      total_amount_display: "0.05",
      currency: "USDC",
      chain_id: 20250407,
      payment_count: 1,
    });

    const results = await repo.findByPayer(TEST_PAYER_WALLET);
    expect(results).toHaveLength(1);
    expect(results[0].group_id).toBe("GRP-3");
  });
});
