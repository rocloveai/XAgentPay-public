/**
 * Telegram Bot — Pure message rendering functions.
 *
 * Converts payment data into Telegram HTML text + InlineKeyboardMarkup.
 * No side effects — all functions are pure and trivially testable.
 */
import { createHash } from "node:crypto";
import type {
  InlineKeyboardMarkup,
  InlineKeyboardButton,
} from "@grammyjs/types";
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
      inline_keyboard: [[callbackButton(`${s.emoji} ${s.label}`, "noop")]],
    };
  }

  // Expired / failed / refunded — non-clickable terminal badge
  if (
    groupStatus === "GROUP_EXPIRED" ||
    groupStatus === "EXPIRED" ||
    groupStatus === "TX_FAILED" ||
    groupStatus === "REFUNDED" ||
    groupStatus === "RISK_REJECTED" ||
    groupStatus === "DISPUTE_RESOLVED"
  ) {
    return {
      inline_keyboard: [[callbackButton(`${s.emoji} ${s.label}`, "noop")]],
    };
  }

  // Partial settlement — some paid, some still settling
  if (groupStatus === "GROUP_PARTIAL") {
    return {
      inline_keyboard: [[callbackButton("\u2699\uFE0F Settling...", "noop")]],
    };
  }

  // Escrowed — payment received
  if (
    groupStatus === "GROUP_ESCROWED" ||
    groupStatus === "GROUP_DEPOSITED" ||
    groupStatus === "ESCROWED"
  ) {
    return {
      inline_keyboard: [[callbackButton("\u2705 Payment Received", "noop")]],
    };
  }

  // TX submitted, awaiting confirmation — show "Paid"
  if (
    groupStatus === "GROUP_AWAITING_TX" ||
    groupStatus === "AWAITING_TX" ||
    groupStatus === "BROADCASTED"
  ) {
    return {
      inline_keyboard: [
        [callbackButton("\u{1F4B3} Paid \u2014 Confirming...", "noop")],
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
// Card layout helpers
// ---------------------------------------------------------------------------

const SEPARATOR =
  "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";
const NUM_EMOJI = [
  "\u0031\uFE0F\u20E3",
  "\u0032\uFE0F\u20E3",
  "\u0033\uFE0F\u20E3",
  "\u0034\uFE0F\u20E3",
  "\u0035\uFE0F\u20E3",
  "\u0036\uFE0F\u20E3",
  "\u0037\uFE0F\u20E3",
  "\u0038\uFE0F\u20E3",
  "\u0039\uFE0F\u20E3",
];

function numEmoji(i: number): string {
  return i < NUM_EMOJI.length ? NUM_EMOJI[i] : `${i + 1}.`;
}

function statusBadge(status: string): string {
  const s = statusDisplay(status);
  return `${s.emoji} ${s.label}`;
}

function renderItemBlock(
  index: number,
  label: string,
  amount: string,
  currency: string,
  status: string,
): string {
  const badge = statusBadge(status);
  return [
    `${numEmoji(index)}  <b>${escapeHtml(label)}</b>`,
    `      ${escapeHtml(amount)} ${escapeHtml(currency)}  \u00B7  ${badge}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Render: initial order (from POST body)
// ---------------------------------------------------------------------------

export function renderOrderMessage(order: RenderOrderRequest): RenderedMessage {
  const groupStatus = inferGroupStatus(order.payments);
  const s = statusDisplay(groupStatus);

  const items = order.payments.map((p, i) =>
    renderItemBlock(
      i,
      p.summary ?? p.merchant_order_ref,
      p.amount_display,
      order.currency,
      p.status,
    ),
  );

  const lines: string[] = [
    `\u{1F3AB} <b>NexusPay Order</b>`,
    ``,
    `<blockquote>${s.emoji} <b>${escapeHtml(s.label)}</b>`,
    ``,
    SEPARATOR,
    ``,
    items.join("\n\n"),
    ``,
    SEPARATOR,
    ``,
    `\u{1F4B0} <b>Total: ${escapeHtml(order.total_amount_display)} ${escapeHtml(order.currency)}</b></blockquote>`,
    ``,
    `\u{1F194} <code>${escapeHtml(order.group_id)}</code>`,
  ];

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

  const items = payments.map((p, i) =>
    renderItemBlock(
      i,
      p.merchant_order_ref,
      p.amount_display,
      p.currency,
      p.status,
    ),
  );

  const lines: string[] = [
    `\u{1F3AB} <b>NexusPay Order</b>`,
    ``,
    `<blockquote>${s.emoji} <b>${escapeHtml(s.label)}</b>`,
    ``,
    SEPARATOR,
    ``,
    items.join("\n\n"),
    ``,
    SEPARATOR,
    ``,
    `\u{1F4B0} <b>Total: ${escapeHtml(group.total_amount_display)} ${escapeHtml(group.currency)}</b></blockquote>`,
    ``,
    `\u{1F194} <code>${escapeHtml(group.group_id)}</code>`,
  ];

  if (group.tx_hash) {
    lines.push(`\u{1F517} <code>${escapeHtml(group.tx_hash)}</code>`);
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
  if (statuses.every((s) => s === "EXPIRED")) return "GROUP_EXPIRED";
  if (statuses.every((s) => s === "CREATED" || s === "AWAITING_TX"))
    return "GROUP_CREATED";
  return "GROUP_PARTIAL";
}
