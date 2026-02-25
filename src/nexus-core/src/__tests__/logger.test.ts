import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../logger.js";

describe("createLogger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });

  it("exposes debug, info, warn, error methods", () => {
    const log = createLogger("Test");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("outputs JSON to stderr with ts, level, component, msg", () => {
    process.env.LOG_LEVEL = "debug";
    const log = createLogger("MyComponent");
    log.info("hello world");

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const output = (stderrSpy.mock.calls[0][0] as string).trim();
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe("info");
    expect(parsed.component).toBe("MyComponent");
    expect(parsed.msg).toBe("hello world");
    expect(parsed.ts).toBeDefined();
  });

  it("suppresses debug when LOG_LEVEL=info", () => {
    process.env.LOG_LEVEL = "info";
    const log = createLogger("Test");
    log.debug("should not appear");

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("merges context fields into output", () => {
    process.env.LOG_LEVEL = "debug";
    const log = createLogger("Test");
    log.warn("caution", { code: 42, detail: "something" });

    const output = (stderrSpy.mock.calls[0][0] as string).trim();
    const parsed = JSON.parse(output);
    expect(parsed.code).toBe(42);
    expect(parsed.detail).toBe("something");
    expect(parsed.level).toBe("warn");
  });
});
