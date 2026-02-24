/**
 * NexusPay Core — Orchestrator.
 *
 * Top-level payment orchestration pipeline:
 * 1. Verify signatures + DID resolution
 * 2. Nonce guard (replay detection)
 * 3. Route payment
 * 4. Create group + N child payments
 * 5. Build aggregated escrow instruction
 */
import type {
  NexusQuotePayload,
  MerchantRecord,
  PaymentRecord,
  PaymentGroupRecord,
  GroupEscrowInstruction,
} from "../types.js";
import type { MerchantRepository } from "../db/interfaces/merchant-repo.js";
import type { PaymentRepository } from "../db/interfaces/payment-repo.js";
import type { EventRepository } from "../db/interfaces/event-repo.js";
import type { GroupRepository } from "../db/interfaces/group-repo.js";
import type { NexusCoreConfig } from "../config.js";
import {
  verifyQuoteSignature,
  resolveMerchantDid,
  checkNonceGuard,
  checkQuoteExpiry,
  computeQuoteHash,
} from "./security.js";
import { routePayment } from "./payment-router.js";
import { GroupManager } from "./group-manager.js";
import { buildGroupEscrowInstruction } from "./instruction-builder.js";
import { NexusError } from "../errors.js";

export interface OrchestrateInput {
  readonly quotes: readonly NexusQuotePayload[];
  readonly payerWallet: string;
}

export interface OrchestrateResult {
  readonly group: PaymentGroupRecord;
  readonly payments: readonly PaymentRecord[];
  readonly instruction: GroupEscrowInstruction;
}

export interface PaymentStatusResult {
  readonly payment: PaymentRecord | null;
  readonly group: PaymentGroupRecord | null;
  readonly groupPayments: readonly PaymentRecord[];
}

export class NexusOrchestrator {
  private readonly groupManager: GroupManager;

  constructor(
    private readonly merchantRepo: MerchantRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly eventRepo: EventRepository,
    private readonly groupRepo: GroupRepository,
    private readonly config: NexusCoreConfig,
  ) {
    this.groupManager = new GroupManager(groupRepo, paymentRepo, eventRepo);
  }

  async orchestratePayment(
    input: OrchestrateInput,
  ): Promise<OrchestrateResult> {
    const { quotes, payerWallet } = input;

    if (quotes.length === 0) {
      throw new NexusError(
        "EMPTY_QUOTES",
        "At least one quote is required",
      );
    }

    // Phase 1: Validate each quote
    const merchants: MerchantRecord[] = [];
    const quoteHashes: string[] = [];

    for (const quote of quotes) {
      // 1a. Check expiry
      checkQuoteExpiry(quote);

      // 1b. Resolve merchant DID
      const merchant = await resolveMerchantDid(
        quote.merchant_did,
        this.merchantRepo,
      );

      // 1c. Verify signature
      await verifyQuoteSignature(quote, merchant);

      // 1d. Compute quote hash for nonce guard
      const quoteHash = computeQuoteHash(quote);

      // 1e. Nonce guard (replay)
      await checkNonceGuard(quoteHash, this.paymentRepo);

      merchants.push(merchant);
      quoteHashes.push(quoteHash);
    }

    // Phase 2: Route (MVP: all escrow)
    const route = routePayment(quotes[0]);

    // Phase 3: Create group + child payments
    const { group, payments } = await this.groupManager.createGroup({
      quotes,
      merchants,
      quoteHashes,
      payerWallet,
      paymentMethod: route.method,
    });

    // Phase 4: Build aggregated escrow instruction
    const instruction = buildGroupEscrowInstruction(
      group,
      payments,
      merchants,
      this.config,
    );

    return { group, payments, instruction };
  }

  async getPaymentStatus(params: {
    nexusPaymentId?: string;
    merchantOrderRef?: string;
    groupId?: string;
  }): Promise<PaymentStatusResult> {
    let payment: PaymentRecord | null = null;
    let group: PaymentGroupRecord | null = null;
    let groupPayments: readonly PaymentRecord[] = [];

    if (params.nexusPaymentId) {
      payment = await this.paymentRepo.findById(params.nexusPaymentId);
    } else if (params.merchantOrderRef) {
      payment = await this.paymentRepo.findByOrderRef(
        params.merchantOrderRef,
      );
    }

    const groupId = params.groupId ?? payment?.group_id;
    if (groupId) {
      const detail = await this.groupManager.getGroupDetail(groupId);
      if (detail) {
        group = detail.group;
        groupPayments = detail.payments;
      }
    }

    return { payment, group, groupPayments };
  }

  async getGroupStatus(groupId: string): Promise<{
    group: PaymentGroupRecord | null;
    payments: readonly PaymentRecord[];
  }> {
    const detail = await this.groupManager.getGroupDetail(groupId);
    if (!detail) return { group: null, payments: [] };
    return detail;
  }
}
