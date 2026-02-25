/**
 * NexusPay Core — Agent Health Checker.
 *
 * Periodically pings marketplace merchant health endpoints
 * and updates their status in the database.
 */
import type { MerchantRepository } from "../db/interfaces/merchant-repo.js";
import type { MerchantRecord, AgentHealthStatus } from "../types.js";
import { createLogger } from "../logger.js";

const hcLog = createLogger("HealthChecker");

export class HealthChecker {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly merchantRepo: MerchantRepository,
    private readonly intervalMs: number = 300_000,
  ) {}

  start(): void {
    if (this.timer) return;
    hcLog.info("Starting", { intervalMs: this.intervalMs });
    this.timer = setInterval(() => {
      this.checkAll().catch((err) =>
        hcLog.error("checkAll error", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkAll(): Promise<void> {
    const merchants = await this.merchantRepo.listForMarket();
    await Promise.allSettled(merchants.map((m) => this.checkOne(m)));
  }

  async checkOne(merchant: MerchantRecord): Promise<void> {
    if (!merchant.health_url) return;
    const start = Date.now();
    try {
      const res = await fetch(merchant.health_url, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        await this.merchantRepo.updateHealth(merchant.merchant_did, "ONLINE", latency, 0);
      } else {
        const failures = merchant.consecutive_failures + 1;
        const status: AgentHealthStatus = failures >= 3 ? "OFFLINE" : "DEGRADED";
        await this.merchantRepo.updateHealth(merchant.merchant_did, status, latency, failures);
      }
    } catch {
      const latency = Date.now() - start;
      const failures = merchant.consecutive_failures + 1;
      const status: AgentHealthStatus = failures >= 3 ? "OFFLINE" : "DEGRADED";
      await this.merchantRepo.updateHealth(merchant.merchant_did, status, latency, failures);
    }
  }
}
