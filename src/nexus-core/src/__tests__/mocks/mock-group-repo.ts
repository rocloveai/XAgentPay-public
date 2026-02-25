import type { GroupRepository } from "../../db/interfaces/group-repo.js";
import type {
  PaymentGroupRecord,
  PaymentGroupStatus,
  CreateGroupParams,
} from "../../types.js";

export class MockGroupRepository implements GroupRepository {
  private readonly store = new Map<string, PaymentGroupRecord>();
  private readonly instructions = new Map<string, Record<string, unknown>>();

  clear(): void {
    this.store.clear();
    this.instructions.clear();
  }

  async insert(params: CreateGroupParams): Promise<PaymentGroupRecord> {
    const now = new Date().toISOString();
    const record: PaymentGroupRecord = {
      group_id: params.group_id,
      payer_wallet: params.payer_wallet,
      total_amount: params.total_amount,
      total_amount_display: params.total_amount_display,
      currency: params.currency,
      chain_id: params.chain_id,
      status: "GROUP_CREATED",
      payment_count: params.payment_count,
      tx_hash: null,
      created_at: now,
      updated_at: now,
    };
    this.store.set(params.group_id, record);
    return record;
  }

  async findById(groupId: string): Promise<PaymentGroupRecord | null> {
    return this.store.get(groupId) ?? null;
  }

  async updateStatus(
    groupId: string,
    newStatus: PaymentGroupStatus,
    fields?: Partial<Pick<PaymentGroupRecord, "tx_hash">>,
  ): Promise<PaymentGroupRecord | null> {
    const existing = this.store.get(groupId);
    if (!existing) return null;

    const updated: PaymentGroupRecord = {
      ...existing,
      ...fields,
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    this.store.set(groupId, updated);
    return updated;
  }

  async findByPayer(
    payerWallet: string,
  ): Promise<readonly PaymentGroupRecord[]> {
    const results: PaymentGroupRecord[] = [];
    for (const r of this.store.values()) {
      if (r.payer_wallet === payerWallet) {
        results.push(r);
      }
    }
    return results;
  }

  async findAll(params?: {
    limit?: number;
    offset?: number;
  }): Promise<readonly PaymentGroupRecord[]> {
    const all = [...this.store.values()].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 50;
    return all.slice(offset, offset + limit);
  }

  async updateInstruction(
    groupId: string,
    instruction: Record<string, unknown>,
  ): Promise<void> {
    this.instructions.set(groupId, instruction);
  }

  async findInstruction(
    groupId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.instructions.get(groupId) ?? null;
  }
}
