/**
 * XAgent Core — Orchestrator.
 *
 * Top-level payment orchestration pipeline:
 * 1. Verify signatures + DID resolution
 * 2. Nonce guard (replay detection)
 * 3. Route payment
 * 4. Create group + N child payments
 * 5. Build aggregated escrow instruction
 */
import type {
  XAgentQuotePayload,
  MerchantRecord,
  PaymentRecord,
  PaymentGroupRecord,
  GroupEscrowInstruction,
  BatchDepositInstruction,
  PaymentRequired402,
  ACPJobInstruction,
} from "../types.js";
import type { MerchantRepository } from "../db/interfaces/merchant-repo.js";
import type { PaymentRepository } from "../db/interfaces/payment-repo.js";
import type { EventRepository } from "../db/interfaces/event-repo.js";
import type { GroupRepository } from "../db/interfaces/group-repo.js";
import type { KVRepository } from "../db/interfaces/kv-repo.js";
import type { XAgentCoreConfig } from "../config.js";
import { randomBytes } from "node:crypto";
import {
  verifyQuoteSignature,
  resolveMerchantDid,
  checkNonceGuard,
  checkQuoteExpiry,
  computeQuoteHash,
} from "./security.js";
import { routePayment } from "./payment-router.js";
import { GroupManager } from "./group-manager.js";
import {
  buildGroupEscrowInstruction,
  buildBatchDepositInstruction,
  buildACPJobInstruction,
} from "./instruction-builder.js";
import { signGroup } from "./group-signer.js";
import { XAgentError } from "../errors.js";
import { keccak256, toHex } from "viem";

export interface OrchestrateInput {
  readonly quotes: readonly XAgentQuotePayload[];
  readonly payerWallet: string;
}

export interface OrchestrateResult {
  readonly group: PaymentGroupRecord;
  readonly payments: readonly PaymentRecord[];
  readonly instruction: BatchDepositInstruction;
  readonly paymentRequired: PaymentRequired402;
  /** @deprecated kept for backward compatibility */
  readonly legacyInstruction: GroupEscrowInstruction;
}

export interface PaymentStatusResult {
  readonly payment: PaymentRecord | null;
  readonly group: PaymentGroupRecord | null;
  readonly groupPayments: readonly PaymentRecord[];
}

export class XAgentOrchestrator {
  private readonly groupManager: GroupManager;

  constructor(
    private readonly merchantRepo: MerchantRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly eventRepo: EventRepository,
    private readonly groupRepo: GroupRepository,
    private readonly kvRepo: KVRepository | null,
    private readonly config: XAgentCoreConfig,
  ) {
    this.groupManager = new GroupManager(groupRepo, paymentRepo, eventRepo);
  }

  async orchestratePayment(
    input: OrchestrateInput,
  ): Promise<OrchestrateResult> {
    const { quotes, payerWallet } = input;

    if (quotes.length === 0) {
      throw new XAgentError("EMPTY_QUOTES", "At least one quote is required");
    }

    // Phase 1: Validate all quotes in parallel
    const validationResults = await Promise.all(
      quotes.map(async (quote) => {
        checkQuoteExpiry(quote);
        const merchant = await resolveMerchantDid(
          quote.merchant_did,
          this.merchantRepo,
        );
        await verifyQuoteSignature(quote, merchant);
        const quoteHash = computeQuoteHash(quote);
        await checkNonceGuard(quoteHash, this.paymentRepo);
        return { merchant, quoteHash };
      }),
    );

    const merchants = validationResults.map((r) => r.merchant);
    const quoteHashes = validationResults.map((r) => r.quoteHash);

    // Phase 2: Route (respects quote.payment_method)
    const route = routePayment(quotes[0]);

    // Phase 3: Create group + child payments
    const { group, payments } = await this.groupManager.createGroup({
      quotes,
      merchants,
      quoteHashes,
      payerWallet,
      paymentMethod: route.method,
    });

    // ---- ACP (ERC-8183) branch ----
    if (route.method === "ACP_JOB") {
      return this.handleACPRoute(group, payments, merchants, quotes);
    }

    // Phase 4: Build batch deposit instruction (unsigned)
    const unsignedInstruction = buildBatchDepositInstruction(
      group,
      payments,
      merchants,
      this.config,
    );

    // Phase 4b: Sign (groupId, entriesHash, totalAmount) with coreOperator
    const { signature, signerAddress } = await signGroup(
      group.group_id,
      unsignedInstruction.payments,
      group.total_amount,
      this.config,
    );

    // Merge signature into final instruction (immutable)
    const instruction: BatchDepositInstruction = {
      ...unsignedInstruction,
      xagent_group_sig: signature,
      core_operator_address: signerAddress,
    };

    // Also build legacy instruction for backward compatibility
    const legacyInstruction = buildGroupEscrowInstruction(
      group,
      payments,
      merchants,
      this.config,
    );

    // Phase 5: Persist instruction for checkout page
    await this.groupRepo.updateInstruction(
      group.group_id,
      instruction as unknown as Record<string, unknown>,
    );

    // Phase 6: Persist escrow fields on each payment record (parallel)
    const now = Math.floor(Date.now() / 1000);
    await Promise.all(
      payments.map((payment) => {
        const paymentIdBytes32 = keccak256(toHex(payment.xagent_payment_id));
        return this.paymentRepo.updateStatus(
          payment.xagent_payment_id,
          "CREATED",
          {
            payment_id_bytes32: paymentIdBytes32,
            escrow_contract: this.config.escrowContract,
            release_deadline: new Date(
              (now + this.config.releaseTimeoutS) * 1000,
            ).toISOString(),
            dispute_deadline: new Date(
              (now + this.config.disputeWindowS) * 1000,
            ).toISOString(),
          },
        );
      }),
    );

    // Phase 7: Generate short-lived secure token for checkout URL
    // Token expiry = earliest payment expiry (so token can't outlive sub-payments)
    const earliestPaymentExpiry = Math.min(
      ...quotes.map((q) => q.expiry * 1000), // quote.expiry is unix seconds → ms
    );
    const fallbackExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
    const tokenExpiresAt = Number.isFinite(earliestPaymentExpiry)
      ? earliestPaymentExpiry
      : fallbackExpiry;

    let checkoutToken = group.group_id; // Default fallback
    if (this.kvRepo) {
      const tokenBytes = randomBytes(16).toString("hex");
      checkoutToken = `tok-${tokenBytes}`;
      await this.kvRepo.set(
        `checkout:token:${checkoutToken}`,
        JSON.stringify({ groupId: group.group_id, expiresAt: tokenExpiresAt }),
      );
    }

    // Phase 8: Build HTTP 402 payload
    const baseUrl =
      this.config.baseUrl || `http://localhost:${this.config.port}`;
    const paymentRequired: PaymentRequired402 = {
      xagent_version: "0.5.0",
      group_id: group.group_id,
      status: "PAYMENT_REQUIRED",
      checkout_url: `${baseUrl}/checkout/${checkoutToken}`,
      instruction,
      xagent_group_sig: signature,
      core_operator_address: signerAddress,
    };

    return { group, payments, instruction, paymentRequired, legacyInstruction };
  }

  /**
   * Handle ACP (ERC-8183) payment route.
   * Builds an ACPJobInstruction and returns a checkout URL.
   */
  private async handleACPRoute(
    group: PaymentGroupRecord,
    payments: readonly PaymentRecord[],
    merchants: readonly MerchantRecord[],
    quotes: readonly XAgentQuotePayload[],
  ): Promise<OrchestrateResult> {
    const acpInstruction = buildACPJobInstruction(
      group,
      payments,
      merchants,
      this.config,
    );

    // Persist ACP instruction for checkout page
    await this.groupRepo.updateInstruction(
      group.group_id,
      acpInstruction as unknown as Record<string, unknown>,
    );

    // Persist ACP contract on each payment record
    await Promise.all(
      payments.map((payment) =>
        this.paymentRepo.updateStatus(payment.xagent_payment_id, "CREATED", {
          acp_contract: this.config.acpContract,
        }),
      ),
    );

    // Generate checkout token
    const earliestPaymentExpiry = Math.min(
      ...quotes.map((q) => q.expiry * 1000),
    );
    const fallbackExpiry = Date.now() + 60 * 60 * 1000;
    const tokenExpiresAt = Number.isFinite(earliestPaymentExpiry)
      ? earliestPaymentExpiry
      : fallbackExpiry;

    let checkoutToken = group.group_id;
    if (this.kvRepo) {
      const tokenBytes = randomBytes(16).toString("hex");
      checkoutToken = `tok-${tokenBytes}`;
      await this.kvRepo.set(
        `checkout:token:${checkoutToken}`,
        JSON.stringify({ groupId: group.group_id, expiresAt: tokenExpiresAt }),
      );
    }

    const baseUrl =
      this.config.baseUrl || `http://localhost:${this.config.port}`;

    // Build a compatible 402 payload (reuse existing shape)
    // For ACP, we put the acpInstruction in a compatible wrapper
    const paymentRequired: PaymentRequired402 = {
      xagent_version: "0.5.0",
      group_id: group.group_id,
      status: "PAYMENT_REQUIRED",
      checkout_url: `${baseUrl}/checkout/${checkoutToken}`,
      instruction: acpInstruction as unknown as BatchDepositInstruction,
      xagent_group_sig: "0x" as `0x${string}`,
      core_operator_address: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    };

    // Build a no-op legacy instruction (ACP doesn't use it)
    const legacyInstruction = buildGroupEscrowInstruction(
      group,
      payments,
      merchants,
      this.config,
    );

    return {
      group,
      payments,
      instruction: acpInstruction as unknown as BatchDepositInstruction,
      paymentRequired,
      legacyInstruction,
    };
  }

  async getPaymentStatus(params: {
    xagentPaymentId?: string;
    merchantOrderRef?: string;
    groupId?: string;
  }): Promise<PaymentStatusResult> {
    let payment: PaymentRecord | null = null;
    let group: PaymentGroupRecord | null = null;
    let groupPayments: readonly PaymentRecord[] = [];

    if (params.xagentPaymentId) {
      payment = await this.paymentRepo.findById(params.xagentPaymentId);
    } else if (params.merchantOrderRef) {
      payment = await this.paymentRepo.findByOrderRef(params.merchantOrderRef);
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
