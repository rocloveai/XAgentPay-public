import { describe, it, expect } from "vitest";
import {
  loadNexusCoreConfig,
  validateConfig,
  type NexusCoreConfig,
  type TransportMode,
} from "../config.js";

function makeConfig(overrides: Partial<NexusCoreConfig> = {}): NexusCoreConfig {
  return {
    databaseUrl: "postgres://localhost/test",
    escrowContract: "0x1111111111111111111111111111111111111111",
    chainId: 20250407,
    chainName: "PlatON Devnet",
    usdcAddress: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
    usdcDecimals: 6,
    protocolFeeBps: 30,
    releaseTimeoutS: 86400,
    disputeWindowS: 259200,
    port: 4000,
    rpcUrl: "https://devnet3openapi.platon.network/rpc",
    relayerPrivateKey: "0x" + "ab".repeat(32),
    watcherIntervalMs: 15000,
    timeoutSweepIntervalMs: 60000,
    webhookRetryIntervalMs: 30000,
    arbitrationTimeoutS: 604800,
    portalToken: "",
    ...overrides,
  };
}

describe("validateConfig", () => {
  it("returns empty array when config is fully valid (sse mode)", () => {
    const errors = validateConfig(makeConfig(), "sse");
    expect(errors).toEqual([]);
  });

  it("returns empty array for stdio mode with empty databaseUrl", () => {
    const errors = validateConfig(
      makeConfig({ databaseUrl: "", relayerPrivateKey: "" }),
      "stdio",
    );
    expect(errors).toEqual([]);
  });

  it("reports missing DATABASE_URL in sse mode", () => {
    const errors = validateConfig(makeConfig({ databaseUrl: "" }), "sse");
    expect(errors).toContainEqual({
      field: "DATABASE_URL",
      message: "Required in SSE mode",
    });
  });

  it("reports missing RELAYER_PRIVATE_KEY in sse mode", () => {
    const errors = validateConfig(
      makeConfig({ relayerPrivateKey: "" }),
      "sse",
    );
    expect(errors).toContainEqual({
      field: "RELAYER_PRIVATE_KEY",
      message: "Required in SSE mode",
    });
  });

  it("reports zero-address ESCROW_CONTRACT in sse mode", () => {
    const errors = validateConfig(
      makeConfig({
        escrowContract: "0x0000000000000000000000000000000000000000",
      }),
      "sse",
    );
    expect(errors).toContainEqual({
      field: "ESCROW_CONTRACT",
      message: "Must not be zero address in SSE mode",
    });
  });

  it("reports protocolFeeBps > 10000", () => {
    const errors = validateConfig(
      makeConfig({ protocolFeeBps: 10001 }),
      "stdio",
    );
    expect(errors).toContainEqual({
      field: "PROTOCOL_FEE_BPS",
      message: "Must be between 0 and 10000",
    });
  });

  it("reports protocolFeeBps < 0", () => {
    const errors = validateConfig(
      makeConfig({ protocolFeeBps: -1 }),
      "sse",
    );
    expect(errors).toContainEqual({
      field: "PROTOCOL_FEE_BPS",
      message: "Must be between 0 and 10000",
    });
  });

  it("returns multiple errors at once", () => {
    const errors = validateConfig(
      makeConfig({
        databaseUrl: "",
        relayerPrivateKey: "",
        protocolFeeBps: 99999,
      }),
      "sse",
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
