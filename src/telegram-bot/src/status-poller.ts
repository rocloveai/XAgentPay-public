/**
 * Telegram Bot — Status polling loop manager.
 *
 * Manages per-message polling of nexus-core for payment status updates.
 * Edits Telegram messages when status changes. Stops on terminal states.
 */
import { createLogger } from "./logger.js";
import { renderStatusUpdate } from "./message-renderer.js";
import type { NexusClient } from "./nexus-client.js";
import type { TelegramClient } from "./telegram-client.js";
import type { ActivePoll, NexusGroupStatusResponse } from "./types.js";
import { TERMINAL_GROUP_STATUSES, TERMINAL_STATUSES } from "./types.js";

const log = createLogger("StatusPoller");

const MAX_CONSECUTIVE_ERRORS = 5;

interface RunningPoll extends ActivePoll {
  readonly timerId: ReturnType<typeof setInterval>;
  readonly consecutiveErrors: number;
}

export class StatusPoller {
  private readonly polls: Map<string, RunningPoll> = new Map();

  constructor(
    private readonly nexusClient: NexusClient,
    private readonly telegramClient: TelegramClient,
    private readonly config: {
      readonly pollIntervalMs: number;
      readonly maxPollDurationMs: number;
    },
  ) {}

  startPolling(poll: ActivePoll): void {
    const key = `${poll.chatId}:${poll.messageId}`;

    if (this.polls.has(key)) {
      log.warn("Already polling", { key });
      return;
    }

    const timerId = setInterval(() => {
      this.pollOnce(key).catch((err) => {
        log.error("Poll tick error", {
          key,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.pollIntervalMs);

    this.polls.set(key, { ...poll, timerId, consecutiveErrors: 0 });
    log.info("Started polling", { key, group_id: poll.groupId });
  }

  private async pollOnce(key: string): Promise<void> {
    const poll = this.polls.get(key);
    if (!poll) return;

    // Check max duration
    if (Date.now() - poll.startedAt > this.config.maxPollDurationMs) {
      this.stopPolling(key, "max_duration_exceeded");
      return;
    }

    let response: NexusGroupStatusResponse;
    try {
      response = await this.nexusClient.getGroupStatus(poll.groupId);
    } catch (err) {
      const newErrors = poll.consecutiveErrors + 1;
      log.warn("Poll fetch error", {
        key,
        consecutive_errors: newErrors,
        error: err instanceof Error ? err.message : String(err),
      });

      if (newErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.stopPolling(key, "too_many_errors");
        return;
      }

      // Update error count (immutable update)
      this.polls.set(key, { ...poll, consecutiveErrors: newErrors });
      return;
    }

    // Reset error counter on success
    if (poll.consecutiveErrors > 0) {
      this.polls.set(key, { ...poll, consecutiveErrors: 0 });
    }

    if (!response.group) {
      log.warn("Group not found during poll", {
        key,
        group_id: poll.groupId,
      });
      return;
    }

    // Render updated message
    const rendered = renderStatusUpdate(
      response.group,
      response.group_payments,
      poll.checkoutUrl,
    );

    // Skip edit if content unchanged
    if (rendered.contentHash === poll.lastRenderedHash) return;

    // Edit Telegram message
    await this.telegramClient.editOrderMessage(
      poll.chatId,
      poll.messageId,
      rendered,
    );

    // Update hash (immutable update)
    const updatedPoll = {
      ...this.polls.get(key)!,
      lastRenderedHash: rendered.contentHash,
    };
    this.polls.set(key, updatedPoll);

    log.info("Updated message", {
      key,
      group_status: response.group.status,
    });

    // Check if terminal
    if (isTerminal(response)) {
      this.stopPolling(key, "terminal_status");
    }
  }

  private stopPolling(key: string, reason: string): void {
    const poll = this.polls.get(key);
    if (!poll) return;

    clearInterval(poll.timerId);
    this.polls.delete(key);

    log.info("Stopped polling", { key, reason, group_id: poll.groupId });
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
