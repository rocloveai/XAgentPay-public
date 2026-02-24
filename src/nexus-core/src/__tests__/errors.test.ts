import { describe, it, expect } from "vitest";
import {
  NexusError,
  SecurityError,
  InvalidTransitionError,
  RelayerError,
  ChainError,
} from "../errors.js";

describe("NexusError", () => {
  it("stores code, message, and context", () => {
    const err = new NexusError("TEST_CODE", "something broke", { key: "val" });
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("something broke");
    expect(err.context).toEqual({ key: "val" });
    expect(err.name).toBe("NexusError");
  });

  it("defaults context to empty object", () => {
    const err = new NexusError("X", "msg");
    expect(err.context).toEqual({});
  });

  it("is an instance of Error", () => {
    const err = new NexusError("X", "msg");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NexusError);
  });
});

describe("SecurityError", () => {
  it("has code SECURITY_ERROR", () => {
    const err = new SecurityError("bad sig");
    expect(err.code).toBe("SECURITY_ERROR");
    expect(err.name).toBe("SecurityError");
    expect(err).toBeInstanceOf(NexusError);
    expect(err).toBeInstanceOf(SecurityError);
  });
});

describe("InvalidTransitionError", () => {
  it("formats message with from/to", () => {
    const err = new InvalidTransitionError("CREATED", "SETTLED");
    expect(err.message).toBe("Cannot transition from CREATED to SETTLED");
    expect(err.code).toBe("INVALID_TRANSITION");
    expect(err.context.from).toBe("CREATED");
    expect(err.context.to).toBe("SETTLED");
    expect(err.name).toBe("InvalidTransitionError");
  });

  it("merges additional context", () => {
    const err = new InvalidTransitionError("A", "B", { payment: "p1" });
    expect(err.context.payment).toBe("p1");
    expect(err.context.from).toBe("A");
  });

  it("is an instance of NexusError", () => {
    const err = new InvalidTransitionError("A", "B");
    expect(err).toBeInstanceOf(NexusError);
    expect(err).toBeInstanceOf(InvalidTransitionError);
  });
});

describe("RelayerError", () => {
  it("has code RELAYER_ERROR", () => {
    const err = new RelayerError("out of gas");
    expect(err.code).toBe("RELAYER_ERROR");
    expect(err.name).toBe("RelayerError");
    expect(err).toBeInstanceOf(NexusError);
  });
});

describe("ChainError", () => {
  it("has code CHAIN_ERROR", () => {
    const err = new ChainError("rpc timeout");
    expect(err.code).toBe("CHAIN_ERROR");
    expect(err.name).toBe("ChainError");
    expect(err).toBeInstanceOf(NexusError);
  });
});
