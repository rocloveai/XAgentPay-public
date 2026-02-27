/**
 * Telegram Bot — Pure message rendering functions.
 *
 * Converts payment data into Telegram HTML text + InlineKeyboardMarkup.
 * No side effects — all functions are pure and trivially testable.
 */
import { createHash } from "node:crypto";
import type { InlineKeyboardMarkup, InlineKeyboardButton } from "@grammyjs/types";
import type {
  RenderOrderRequest,
  GroupInfo,
  GroupPaymentInfo,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type { InlineKeyboardMarkup, InlineKeyboardButton };

export interface RenderedMessage {
  readonly text: string;
  readonly replyMarkup: InlineKeyboardMarkup;
  readonly contentHash: string;
}

// ---------------------------------------------------------------------------
// Status emoji mapping
// ---------------------------------------------------------------------------

const STATUS_DISPLAY: Record<string, { emoji: string; label: string }> = {
  CREATED: { emoji: "\u23F3", label: "Pending" },
  GROUP_CREATED: { emoji: "\u23F3", label: "Pending Payment" },
  AWAITING_TX: { emoji: "\u23F3", label: "Awaiting TX" },
  GROUP_AWAITING_TX: { emoji: "\u23F3", label: "Awaiting TX" },
  BROADCASTED: { emoji: "\u{1F4E1}", label: "Broadcasting" },
  ESCROWED: { emoji: "\u{1F512}", label: "Escrowed" },
  GROUP_ESCROWED: { emoji: "\u{1F512}", label: "Escrowed" },
  GROUP_DEPOSITED: { emoji: "\u{1F512}", label: "Deposited" },
  SETTLED: { emoji: "\u2705", label: "Settled" },
  GROUP_SETTLED: { emoji: "\u2705", label: "Settled" },
  COMPLETED: { emoji: "\u{1F389}", label: "Completed" },
  GROUP_COMPLETED: { emoji: "\u{1F389}", label: "Completed" },
  EXPIRED: { emoji: "\u274C", label: "Expired" },
  GROUP_EXPIRED: { emoji: "\u274C", label: "Expired" },
  TX_FAILED: { emoji: "\u274C", label: "Failed" },
  REFUNDED: { emoji: "\u{1F4B0}", label: "Refunded" },
  DISPUTE_OPEN: { emoji: "\u26A0\uFE0F", label: "Disputed" },
  DISPUTE_RESOLVED: { emoji: "\u2696\uFE0F", label: "Resolved" },
  GROUP_PARTIAL: { emoji: "\u26A0\uFE0F", label: "Partial" },
};

function statusDisplay(status: string): { emoji: string; label: string } {
  return STATUS_DISPLAY[status] ?? { emoji: "\u2753", label: status };
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Keyboard builders
// ---------------------------------------------------------------------------

function urlButton(text: string, url: string): InlineKeyboardButton.UrlButton {
  return { text, url };
}

function callbackButton(
  text: string,
  data: string,
): InlineKeyboardButton.CallbackButton {
  return { text, callback_data: data };
}

function buildKeyboard(
  groupStatus: string,
  checkoutUrl: string,
): InlineKeyboardMarkup {
  const s = statusDisplay(groupStatus);

  // Terminal completed states
  if (
    groupStatus === "GROUP_SETTLED" ||
    groupStatus === "GROUP_COMPLETED" ||
    groupStatus === "SETTLED" ||
    groupStatus === "COMPLETED"
  ) {
    return {
      inline_keyboard: [
        [callbackButton(`${s.emoji} ${s.label}`, "noop")],
      ],
    };
  }

  // Escrowed — payment received
  if (
    groupStatus === "GROUP_ESCROWED" ||
    groupStatus === "GROUP_DEPOSITED" ||
    groupStatus === "ESCROWED"
  ) {
    return {
      inline_keyboard: [
        [callbackButton("\u2705 Payment Received", "noop")],
      ],
    };
  }

  // Default — pay now button
  return {
    inline_keyboard: [[urlButton("\u{1F4B3} Pay Now", checkoutUrl)]],
  };
}

// ---------------------------------------------------------------------------
// Content hash (for change detection)
// ---------------------------------------------------------------------------

function computeHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Render: initial order (from POST body)
// ---------------------------------------------------------------------------

export function renderOrderMessage(order: RenderOrderRequest): RenderedMessage {
  const groupStatus = inferGroupStatus(order.payments);
  const s = statusDisplay(groupStatus);

  const lines: string[] = [
    `<b>\u{1F4E6} NexusPay Order</b>`,
    ``,
    `${s.emoji} Status: <b>${escapeHtml(s.label)}</b>`,
    ``,
    `<b>Items</b>`,
  ];

  order.payments.forEach((p, i) => {
    const ps = statusDisplay(p.status);
    const label = p.summary ?? p.merchant_order_ref;
    lines.push(
      `${i + 1}. ${escapeHtml(label)}`,
      `   ${escapeHtml(p.amount_display)} ${escapeHtml(order.currency)}  [${ps.emoji} ${escapeHtml(ps.label)}]`,
    );
  });

  lines.push(
    ``,
    `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
    `<b>Total: ${escapeHtml(order.total_amount_display)} ${escapeHtml(order.currency)}</b>`,
    ``,
    `<code>${escapeHtml(order.group_id)}</code>`,
  );

  const text = lines.join("\n");
  return {
    text,
    replyMarkup: buildKeyboard(groupStatus, order.checkout_url),
    contentHash: computeHash(text),
  };
}

// ---------------------------------------------------------------------------
// Render: status update (from polled API response)
// ---------------------------------------------------------------------------

export function renderStatusUpdate(
  group: GroupInfo,
  payments: readonly GroupPaymentInfo[],
  checkoutUrl: string,
): RenderedMessage {
  const s = statusDisplay(group.status);

  const lines: string[] = [
    `<b>\u{1F4E6} NexusPay Order</b>`,
    ``,
    `${s.emoji} Status: <b>${escapeHtml(s.label)}</b>`,
    ``,
    `<b>Items</b>`,
  ];

  payments.forEach((p, i) => {
    const ps = statusDisplay(p.status);
    const label = p.merchant_order_ref;
    lines.push(
      `${i + 1}. ${escapeHtml(label)}`,
      `   ${escapeHtml(p.amount_display)} ${escapeHtml(p.currency)}  [${ps.emoji} ${escapeHtml(ps.label)}]`,
    );
  });

  lines.push(
    ``,
    `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
    `<b>Total: ${escapeHtml(group.total_amount_display)} ${escapeHtml(group.currency)}</b>`,
    ``,
    `<code>${escapeHtml(group.group_id)}</code>`,
  );

  if (group.tx_hash) {
    lines.push(`TX: <code>${escapeHtml(group.tx_hash)}</code>`);
  }

  const text = lines.join("\n");
  return {
    text,
    replyMarkup: buildKeyboard(group.status, checkoutUrl),
    contentHash: computeHash(text),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferGroupStatus(
  payments: readonly { readonly status: string }[],
): string {
  if (payments.length === 0) return "GROUP_CREATED";
  const statuses = payments.map((p) => p.status);

  if (statuses.every((s) => s === "COMPLETED")) return "GROUP_COMPLETED";
  if (statuses.every((s) => s === "SETTLED" || s === "COMPLETED"))
    return "GROUP_SETTLED";
  if (
    statuses.every(
      (s) => s === "ESCROWED" || s === "SETTLED" || s === "COMPLETED",
    )
  )
    return "GROUP_ESCROWED";
  return "GROUP_CREATED";
}
