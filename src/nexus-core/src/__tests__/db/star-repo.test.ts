import { describe, it, expect, beforeEach } from "vitest";
import { MockStarRepository } from "../mocks/mock-star-repo.js";

describe("StarRepository", () => {
  let repo: MockStarRepository;

  beforeEach(() => {
    repo = new MockStarRepository();
  });

  it("addStar returns true on first add, false on duplicate", async () => {
    const first = await repo.addStar("did:nexus:a", "0xABC");
    expect(first).toBe(true);

    const second = await repo.addStar("did:nexus:a", "0xABC");
    expect(second).toBe(false);
  });

  it("removeStar returns true when removed, false when not found", async () => {
    await repo.addStar("did:nexus:a", "0xABC");

    const removed = await repo.removeStar("did:nexus:a", "0xABC");
    expect(removed).toBe(true);

    const again = await repo.removeStar("did:nexus:a", "0xABC");
    expect(again).toBe(false);
  });

  it("getStarCount returns correct count", async () => {
    expect(await repo.getStarCount("did:nexus:a")).toBe(0);

    await repo.addStar("did:nexus:a", "0xAAA");
    await repo.addStar("did:nexus:a", "0xBBB");
    await repo.addStar("did:nexus:a", "0xCCC");

    expect(await repo.getStarCount("did:nexus:a")).toBe(3);
  });

  it("hasStar returns true/false correctly", async () => {
    expect(await repo.hasStar("did:nexus:a", "0xAAA")).toBe(false);

    await repo.addStar("did:nexus:a", "0xAAA");
    expect(await repo.hasStar("did:nexus:a", "0xAAA")).toBe(true);
    expect(await repo.hasStar("did:nexus:a", "0xBBB")).toBe(false);
  });

  it("getStarInfo returns combined count and has_starred", async () => {
    await repo.addStar("did:nexus:a", "0xAAA");
    await repo.addStar("did:nexus:a", "0xBBB");

    const info = await repo.getStarInfo("did:nexus:a", "0xAAA");
    expect(info.star_count).toBe(2);
    expect(info.has_starred).toBe(true);

    const info2 = await repo.getStarInfo("did:nexus:a", "0xCCC");
    expect(info2.star_count).toBe(2);
    expect(info2.has_starred).toBe(false);
  });

  it("getStarInfo without walletAddress returns has_starred=false", async () => {
    await repo.addStar("did:nexus:a", "0xAAA");

    const info = await repo.getStarInfo("did:nexus:a");
    expect(info.star_count).toBe(1);
    expect(info.has_starred).toBe(false);
  });

  it("getStarCounts batch query returns correct map", async () => {
    await repo.addStar("did:nexus:a", "0xAAA");
    await repo.addStar("did:nexus:a", "0xBBB");
    await repo.addStar("did:nexus:b", "0xAAA");

    const counts = await repo.getStarCounts(["did:nexus:a", "did:nexus:b", "did:nexus:c"]);
    expect(counts.get("did:nexus:a")).toBe(2);
    expect(counts.get("did:nexus:b")).toBe(1);
    expect(counts.has("did:nexus:c")).toBe(false);
  });

  it("wallet address is case-normalized", async () => {
    await repo.addStar("did:nexus:a", "0xAbCdEf");
    expect(await repo.hasStar("did:nexus:a", "0xABCDEF")).toBe(true);
    expect(await repo.hasStar("did:nexus:a", "0xabcdef")).toBe(true);

    // Adding same address with different case should be idempotent
    const duplicate = await repo.addStar("did:nexus:a", "0xABCDEF");
    expect(duplicate).toBe(false);
  });

  it("getStarCounts with empty input returns empty map", async () => {
    const counts = await repo.getStarCounts([]);
    expect(counts.size).toBe(0);
  });
});
