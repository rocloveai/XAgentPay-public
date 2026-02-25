/**
 * NexusPay Core — Agent Health Checker.
 *
 * Periodically pings marketplace agent health endpoints
 * and updates their status in the database.
 */
import type { MarketRepository } from "../db/interfaces/market-repo.js";
import type { MarketAgentRecord, AgentHealthStatus } from "../types.js";
import { createLogger } from "../logger.js";

const hcLog = createLogger("HealthChecker");

export class HealthChecker {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly marketRepo: MarketRepository,
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
    const agents = await this.marketRepo.listAll();
    await Promise.allSettled(agents.map((a) => this.checkOne(a)));
  }

  async checkOne(agent: MarketAgentRecord): Promise<void> {
    const start = Date.now();
    try {
      const res = await fetch(agent.health_url, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        await this.marketRepo.updateHealth(agent.agent_id, "ONLINE", latency, 0);
      } else {
        const failures = agent.consecutive_failures + 1;
        const status: AgentHealthStatus = failures >= 3 ? "OFFLINE" : "DEGRADED";
        await this.marketRepo.updateHealth(agent.agent_id, status, latency, failures);
      }
    } catch {
      const latency = Date.now() - start;
      const failures = agent.consecutive_failures + 1;
      const status: AgentHealthStatus = failures >= 3 ? "OFFLINE" : "DEGRADED";
      await this.marketRepo.updateHealth(agent.agent_id, status, latency, failures);
    }
  }
}
