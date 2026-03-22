import type {
  PaymentGroupRecord,
  PaymentGroupStatus,
  CreateGroupParams,
} from "../../types.js";

export interface GroupRepository {
  /** Insert a new payment group. Returns the full record. */
  insert(params: CreateGroupParams): Promise<PaymentGroupRecord>;

  /** Find by group_id. Returns null if not found. */
  findById(groupId: string): Promise<PaymentGroupRecord | null>;

  /** Update group status atomically. Returns updated record or null. */
  updateStatus(
    groupId: string,
    newStatus: PaymentGroupStatus,
    fields?: Partial<Pick<PaymentGroupRecord, "tx_hash">>,
  ): Promise<PaymentGroupRecord | null>;

  /** Find groups by payer wallet. */
  findByPayer(payerWallet: string): Promise<readonly PaymentGroupRecord[]>;

  /** List all groups ordered by created_at DESC. */
  findAll(params?: {
    limit?: number;
    offset?: number;
  }): Promise<readonly PaymentGroupRecord[]>;

  /** Persist a GroupEscrowInstruction JSON to the instruction column. */
  updateInstruction(
    groupId: string,
    instruction: Record<string, unknown>,
  ): Promise<void>;

  /** Read the persisted instruction JSONB for a group. */
  findInstruction(groupId: string): Promise<Record<string, unknown> | null>;
}
