/**
 * NexusPay Core — Group manager.
 *
 * Manages PaymentGroup lifecycle: creation, status aggregation.
 */
import { randomUUID } from "node:crypto";
import type {
  PaymentGroupRecord,
  PaymentGroupStatus,
  PaymentRecord,
  NexusQuotePayload,
  MerchantRecord,
  PaymentMethod,
} from "../types.js";
import type { GroupRepository } from "../db/interfaces/group-repo.js";
import type { PaymentRepository } from "../db/interfaces/payment-repo.js";
import type { EventRepository } from "../db/interfaces/event-repo.js";
import { PaymentStateMachine } from "./state-machine.js";
import { NexusError } from "../errors.js";
import { USDC_DECIMALS } from "../constants.js";

export interface CreateGroupInput {
  readonly quotes: readonly NexusQuotePayload[];
  readonly merchants: readonly MerchantRecord[];
  readonly quoteHashes: readonly string[];
  readonly payerWallet: string;
  readonly paymentMethod: PaymentMethod;
}

export interface GroupDetail {
  readonly group: PaymentGroupRecord;
  readonly payments: readonly PaymentRecord[];
}

/**
 * Sum amounts as BigInt strings (no floating point).
 */
function sumAmounts(amounts: readonly string[]): string {
  let total = 0n;
  for (const a of amounts) {
    total += BigInt(a);
  }
  return total.toString();
}

/**
 * Convert uint256 amount to display string (e.g., "100000" → "0.10").
 */
function toDisplayAmount(
  uint256: string,
  decimals: number = USDC_DECIMALS,
): string {
  const raw = uint256.padStart(decimals + 1, "0");
  const intPart = raw.slice(0, raw.length - decimals) || "0";
  const fracPart = raw.slice(raw.length - decimals);
  return `${intPart}.${fracPart}`;
}

export class GroupManager {
  private readonly stateMachine: PaymentStateMachine;

  constructor(
    private readonly groupRepo: GroupRepository,
    private readonly paymentRepo: PaymentRepository,
    eventRepo: EventRepository,
  ) {
    this.stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
  }

  async createGroup(input: CreateGroupInput): Promise<GroupDetail> {
    const { quotes, merchants, quoteHashes, payerWallet, paymentMethod } =
      input;

    if (quotes.length === 0) {
      throw new NexusError("EMPTY_QUOTES", "At least one quote is required");
    }
    if (quotes.length !== merchants.length) {
      throw new NexusError(
        "MISMATCH",
        "Quotes and merchants arrays must have equal length",
      );
    }

    const groupId = `GRP-${randomUUID()}`;
    const amounts = quotes.map((q) => q.amount);
    const totalAmount = sumAmounts(amounts);
    const totalDisplay = toDisplayAmount(totalAmount);

    const group = await this.groupRepo.insert({
      group_id: groupId,
      payer_wallet: payerWallet,
      total_amount: totalAmount,
      total_amount_display: totalDisplay,
      currency: quotes[0].currency,
      chain_id: quotes[0].chain_id,
      payment_count: quotes.length,
    });

    const payments: PaymentRecord[] = [];

    for (let i = 0; i < quotes.length; i++) {
      const quote = quotes[i];
      const merchant = merchants[i];
      const quoteHash = quoteHashes[i];

      const display = toDisplayAmount(quote.amount);
      const expiresAt = new Date(quote.expiry * 1000).toISOString();

      const payment = await this.stateMachine.createPayment({
        quoteHash,
        groupId,
        merchantDid: quote.merchant_did,
        merchantOrderRef: quote.merchant_order_ref,
        payerWallet,
        paymentAddress: merchant.payment_address,
        amount: quote.amount,
        amountDisplay: display,
        currency: quote.currency,
        chainId: quote.chain_id,
        paymentMethod,
        quotePayload: quote,
        isoMetadata: null,
        expiresAt,
      });

      payments.push(payment);
    }

    return { group, payments };
  }

  async getGroupDetail(groupId: string): Promise<GroupDetail | null> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) return null;

    const payments = await this.paymentRepo.findByGroupId(groupId);
    return { group, payments };
  }

  async syncGroupStatus(groupId: string): Promise<PaymentGroupRecord | null> {
    const detail = await this.getGroupDetail(groupId);
    if (!detail) return null;

    const { group, payments } = detail;
    const newStatus = aggregateGroupStatus(payments);

    if (newStatus === group.status) return group;

    return this.groupRepo.updateStatus(groupId, newStatus);
  }
}

/**
 * Derive group status from child payment statuses.
 */
function aggregateGroupStatus(
  payments: readonly PaymentRecord[],
): PaymentGroupStatus {
  if (payments.length === 0) return "GROUP_CREATED";

  const statuses = payments.map((p) => p.status);

  if (statuses.every((s) => s === "COMPLETED")) return "GROUP_COMPLETED";
  if (statuses.every((s) => s === "SETTLED")) return "GROUP_SETTLED";
  if (statuses.every((s) => s === "ESCROWED")) return "GROUP_ESCROWED";
  if (statuses.every((s) => s === "EXPIRED")) return "GROUP_EXPIRED";

  if (
    statuses.every(
      (s) => s === "CREATED" || s === "AWAITING_TX",
    )
  ) {
    return "GROUP_AWAITING_TX";
  }

  if (statuses.some((s) => s === "CREATED")) return "GROUP_CREATED";

  return "GROUP_PARTIAL";
}
