import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  handleDiscoverAgents,
  handleGetAgentSkill,
} from "../../services/market-tools.js";
import { MockMerchantRepository } from "../mocks/mock-merchant-repo.js";
import { MockStarRepository } from "../mocks/mock-star-repo.js";
import type { MerchantRecord } from "../../types.js";

function makeMerchant(overrides?: Partial<MerchantRecord>): MerchantRecord {
  const now = new Date().toISOString();
  return {
    merchant_did: "did:nexus:20250407:test",
    name: "Test Agent",
    description: "A test agent for flights",
    signer_address: "0x1234567890abcdef1234567890abcdef12345678",
    payment_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    webhook_url: null,
    webhook_secret: null,
    category: "travel.flights",
    skill_md_url: "https://example.com/skill.md",
    health_url: "https://example.com/health",
    mcp_endpoint: "https://example.com/sse",
    skill_name: "FlightSearch",
    skill_version: "0.1.0",
    skill_protocol: "MCP",
    skill_tools: [{ name: "search_flights", role: "search" }],
    currencies: ["USDC"],
    chain_id: 20250407,
    health_status: "ONLINE",
    last_health_check: now,
    last_health_latency_ms: 150,
    consecutive_failures: 0,
    is_verified: true,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("market-tools", () => {
  let merchantRepo: MockMerchantRepository;
  let starRepo: MockStarRepository;

  beforeEach(() => {
    merchantRepo = new MockMerchantRepository();
    starRepo = new MockStarRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // discover_agents
  // -----------------------------------------------------------------------

  describe("handleDiscoverAgents", () => {
    it("returns all agents when no filters", async () => {
      merchantRepo.seed([
        makeMerchant({ merchant_did: "did:a", name: "Agent A" }),
        makeMerchant({ merchant_did: "did:b", name: "Agent B" }),
      ]);

      const result = await handleDiscoverAgents(merchantRepo, starRepo, {});
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Found 2 agent(s)");
      expect(result.content[0].text).toContain("Agent A");
      expect(result.content[0].text).toContain("Agent B");
    });

    it("filters by category", async () => {
      merchantRepo.seed([
        makeMerchant({ merchant_did: "did:a", name: "Flight", category: "travel.flights" }),
        makeMerchant({ merchant_did: "did:b", name: "Food", category: "food.delivery" }),
      ]);

      const result = await handleDiscoverAgents(merchantRepo, starRepo, {
        category: "travel",
      });
      expect(result.content[0].text).toContain("Found 1 agent(s)");
      expect(result.content[0].text).toContain("Flight");
      expect(result.content[0].text).not.toContain("Food");
    });

    it("filters by query keyword", async () => {
      merchantRepo.seed([
        makeMerchant({ merchant_did: "did:a", name: "FlightBot", description: "Booking flights" }),
        makeMerchant({ merchant_did: "did:b", name: "HotelBot", description: "Booking hotels" }),
      ]);

      const result = await handleDiscoverAgents(merchantRepo, starRepo, {
        query: "hotel",
      });
      expect(result.content[0].text).toContain("Found 1 agent(s)");
      expect(result.content[0].text).toContain("HotelBot");
    });

    it("sorts by star_count DESC", async () => {
      merchantRepo.seed([
        makeMerchant({ merchant_did: "did:a", name: "LowStars" }),
        makeMerchant({ merchant_did: "did:b", name: "HighStars" }),
      ]);
      await starRepo.addStar("did:a", "0x1111");
      await starRepo.addStar("did:b", "0x1111");
      await starRepo.addStar("did:b", "0x2222");
      await starRepo.addStar("did:b", "0x3333");

      const result = await handleDiscoverAgents(merchantRepo, starRepo, {});
      const text = result.content[0].text;
      const highIdx = text.indexOf("HighStars");
      const lowIdx = text.indexOf("LowStars");
      expect(highIdx).toBeLessThan(lowIdx);
    });

    it("respects limit parameter", async () => {
      merchantRepo.seed([
        makeMerchant({ merchant_did: "did:a", name: "A" }),
        makeMerchant({ merchant_did: "did:b", name: "B" }),
        makeMerchant({ merchant_did: "did:c", name: "C" }),
      ]);

      const result = await handleDiscoverAgents(merchantRepo, starRepo, {
        limit: 2,
      });
      expect(result.content[0].text).toContain("Found 2 agent(s)");
    });

    it("returns empty message when no agents match", async () => {
      const result = await handleDiscoverAgents(merchantRepo, starRepo, {});
      expect(result.content[0].text).toContain("No agents found");
    });

    it("handles errors gracefully", async () => {
      const brokenRepo = {
        ...merchantRepo,
        listForMarket: () => Promise.reject(new Error("DB down")),
      } as unknown as MockMerchantRepository;

      const result = await handleDiscoverAgents(brokenRepo, starRepo, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("DB down");
    });
  });

  // -----------------------------------------------------------------------
  // get_agent_skill
  // -----------------------------------------------------------------------

  describe("handleGetAgentSkill", () => {
    it("returns skill.md content with header", async () => {
      merchantRepo.seed(makeMerchant({ merchant_did: "did:nexus:test" }));
      const skillContent = "---\nname: test\n---\n# My Skill\nHello world";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(skillContent, { status: 200 }),
      );

      const result = await handleGetAgentSkill(merchantRepo, {
        merchant_did: "did:nexus:test",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("# Test Agent");
      expect(result.content[0].text).toContain("Hello world");
    });

    it("returns error when merchant not found", async () => {
      const result = await handleGetAgentSkill(merchantRepo, {
        merchant_did: "did:nexus:nope",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Agent not found");
    });

    it("returns error when no skill_md_url", async () => {
      merchantRepo.seed(
        makeMerchant({ merchant_did: "did:nexus:noskill", skill_md_url: null }),
      );

      const result = await handleGetAgentSkill(merchantRepo, {
        merchant_did: "did:nexus:noskill",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("no skill.md URL");
    });

    it("returns error when fetch fails", async () => {
      merchantRepo.seed(makeMerchant({ merchant_did: "did:nexus:test" }));
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network error"),
      );

      const result = await handleGetAgentSkill(merchantRepo, {
        merchant_did: "did:nexus:test",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Network error");
    });

    it("returns error when fetch returns non-200", async () => {
      merchantRepo.seed(makeMerchant({ merchant_did: "did:nexus:test" }));
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );

      const result = await handleGetAgentSkill(merchantRepo, {
        merchant_did: "did:nexus:test",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("HTTP 404");
    });
  });
});
