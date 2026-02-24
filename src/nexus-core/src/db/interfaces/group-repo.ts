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
}
