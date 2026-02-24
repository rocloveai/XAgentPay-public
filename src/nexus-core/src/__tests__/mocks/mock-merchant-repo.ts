import type { MerchantRepository } from "../../db/interfaces/merchant-repo.js";
import type { MerchantRecord } from "../../types.js";

export class MockMerchantRepository implements MerchantRepository {
  private readonly store = new Map<string, MerchantRecord>();

  clear(): void {
    this.store.clear();
  }

  /** Seed a merchant for testing */
  seed(record: MerchantRecord): void {
    this.store.set(record.merchant_did, record);
  }

  async findByDid(merchantDid: string): Promise<MerchantRecord | null> {
    const r = this.store.get(merchantDid);
    if (!r || !r.is_active) return null;
    return r;
  }

  async listAll(): Promise<readonly MerchantRecord[]> {
    return [...this.store.values()]
      .filter((r) => r.is_active)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
  }
}
