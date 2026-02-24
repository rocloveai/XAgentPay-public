import type { MerchantRecord } from "../../types.js";

export interface MerchantRepository {
  /** Find merchant by DID. Returns null if not found or inactive. */
  findByDid(merchantDid: string): Promise<MerchantRecord | null>;

  /** List all active merchants. */
  listAll(): Promise<readonly MerchantRecord[]>;
}
