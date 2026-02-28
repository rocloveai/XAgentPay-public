/**
 * Telegram Bot — Status polling loop manager.
 *
 * Manages per-message polling of nexus-core for payment status updates.
 * Edits Telegram messages when status changes. Stops on terminal states.
 *
 * Uses progressive backoff: each successive poll waits longer.
 * With defaults (initial=10s, backoff=5s, max=20):
 *   Poll 1: 10s, Poll 2: 15s, Poll 3: 20s, …, Poll 20: 105s
 *   Total coverage: ~19 minutes across 20 queries
 */
import { createLogger } from "./logger.js";
import { renderStatusUpdate } from "./message-renderer.js";
import type { NexusClient } from "./nexus-client.js";
import type { TelegramClient } from "./telegram-client.js";
import type { ActivePoll, NexusGroupStatusResponse } from "./types.js";
import { TERMINAL_GROUP_STATUSES, TERMINAL_STATUSES } from "./types.js";

const log = createLogger("StatusPoller");

const MAX_CONSECUTIVE_ERRORS = 5;

export interface PollerConfig {
  readonly pollIntervalMs: number;
  readonly pollBackoffMs: number;
  readonly maxPollCount: number;
}

interface RunningPoll extends ActivePoll {
  readonly timerId: ReturnType<typeof setTimeout>;
  readonly consecutiveErrors: number;
  readonly pollCount: number;
}

export class StatusPoller {
  private readonly polls: Map<string, RunningPoll> = new Map();

  constructor(
    private readonly nexusClient: NexusClient,
    private readonly telegramClient: TelegramClient,
    private readonly config: PollerConfig,
  ) {}

  startPolling(poll: ActivePoll): void {
    const key = `${poll.chatId}:${poll.messageId}`;

    if (this.polls.has(key)) {
      log.warn("Already polling", { key });
      return;
    }

    const timerId = this.scheduleNext(key, 0);
    this.polls.set(key, {
      ...poll,
      timerId,
      consecutiveErrors: 0,
      pollCount: 0,
    });
    log.info("Started polling", {
      key,
      group_id: poll.groupId,
      max_polls: this.config.maxPollCount,
    });
  }

  /**
   * Compute delay for the Nth poll (0-indexed).
   * delay(n) = pollIntervalMs + n * pollBackoffMs
   */
  private delayForPoll(n: number): number {
    return this.config.pollIntervalMs + n * this.config.pollBackoffMs;
  }

  private scheduleNext(
    key: string,
    pollIndex: number,
  ): ReturnType<typeof setTimeout> {
    const delay = this.delayForPoll(pollIndex);
    return setTimeout(() => {
      this.pollOnce(key).catch((err) => {
        log.error("Poll tick error", {
          key,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, delay);
  }

  private async pollOnce(key: string): Promise<void> {
    const poll = this.polls.get(key);
    if (!poll) return;

    // Check max poll count
    const newCount = poll.pollCount + 1;
    if (newCount > this.config.maxPollCount) {
      this.stopPolling(key, "max_poll_count");
      return;
    }

    // Update count before fetch
    this.polls.set(key, { ...poll, pollCount: newCount });

    let response: NexusGroupStatusResponse;
    try {
      response = await this.nexusClient.getGroupStatus(poll.groupId);
    } catch (err) {
      const newErrors = poll.consecutiveErrors + 1;
      log.warn("Poll fetch error", {
        key,
        poll_count: newCount,
        consecutive_errors: newErrors,
        error: err instanceof Error ? err.message : String(err),
      });

      if (newErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.stopPolling(key, "too_many_errors");
        return;
      }

      // Update error count and schedule next
      const current = this.polls.get(key)!;
      const timerId = this.scheduleNext(key, newCount);
      this.polls.set(key, {
        ...current,
        consecutiveErrors: newErrors,
        timerId,
      });
      return;
    }

    // Reset error counter on success
    const current = this.polls.get(key)!;
    let updated: RunningPoll = {
      ...current,
      consecutiveErrors: 0,
    };

    if (!response.group) {
      log.warn("Group not found during poll", {
        key,
        group_id: poll.groupId,
      });
      // Schedule next anyway
      const timerId = this.scheduleNext(key, newCount);
      this.polls.set(key, { ...updated, timerId });
      return;
    }

    // Render updated message
    const rendered = renderStatusUpdate(
      response.group,
      response.group_payments,
      poll.checkoutUrl,
    );

    // Edit Telegram message only if content changed
    if (rendered.contentHash !== current.lastRenderedHash) {
      await this.telegramClient.editOrderMessage(
        poll.chatId,
        poll.messageId,
        rendered,
      );

      updated = { ...updated, lastRenderedHash: rendered.contentHash };

      log.info("Updated message", {
        key,
        group_status: response.group.status,
        poll_count: newCount,
        next_delay_ms: this.delayForPoll(newCount),
      });
    }

    // Check if terminal — stop polling
    if (isTerminal(response)) {
      this.polls.set(key, updated);
      this.stopPolling(key, "terminal_status");
      return;
    }

    // Schedule next poll with increased delay
    const timerId = this.scheduleNext(key, newCount);
    this.polls.set(key, { ...updated, timerId });
  }

  private stopPolling(key: string, reason: string): void {
    const poll = this.polls.get(key);
    if (!poll) return;

    clearTimeout(poll.timerId);
    this.polls.delete(key);

    log.info("Stopped polling", {
      key,
      reason,
      group_id: poll.groupId,
      total_polls: poll.pollCount,
    });
  }

  stopAll(): void {
    for (const key of [...this.polls.keys()]) {
      this.stopPolling(key, "shutdown");
    }
  }

  get activePollCount(): number {
    return this.polls.size;
  }
}

// ---------------------------------------------------------------------------
// Terminal detection
// ---------------------------------------------------------------------------

function isTerminal(response: NexusGroupStatusResponse): boolean {
  if (response.group && TERMINAL_GROUP_STATUSES.has(response.group.status)) {
    return true;
  }

  if (response.group_payments.length > 0) {
    return response.group_payments.every((p) =>
      TERMINAL_STATUSES.has(p.status),
    );
  }

  return false;
}
