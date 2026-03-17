import type { StarRepository, StarInfo } from "../../db/interfaces/star-repo.js";

export class MockStarRepository implements StarRepository {
  private readonly store = new Set<string>();

  private key(merchantDid: string, walletAddress: string): string {
    return `${merchantDid}:${walletAddress.toLowerCase()}`;
  }

  clear(): void {
    this.store.clear();
  }

  seed(entries: readonly { merchantDid: string; walletAddress: string }[]): void {
    for (const e of entries) {
      this.store.add(this.key(e.merchantDid, e.walletAddress));
    }
  }

  async addStar(merchantDid: string, walletAddress: string): Promise<boolean> {
    const k = this.key(merchantDid, walletAddress);
    if (this.store.has(k)) return false;
    this.store.add(k);
    return true;
  }

  async removeStar(merchantDid: string, walletAddress: string): Promise<boolean> {
    return this.store.delete(this.key(merchantDid, walletAddress));
  }

  async getStarCount(merchantDid: string): Promise<number> {
    let count = 0;
    const prefix = `${merchantDid}:`;
    for (const k of this.store) {
      if (k.startsWith(prefix)) count++;
    }
    return count;
  }

  async hasStar(merchantDid: string, walletAddress: string): Promise<boolean> {
    return this.store.has(this.key(merchantDid, walletAddress));
  }

  async getStarInfo(merchantDid: string, walletAddress?: string): Promise<StarInfo> {
    const star_count = await this.getStarCount(merchantDid);
    const has_starred = walletAddress
      ? this.store.has(this.key(merchantDid, walletAddress))
      : false;
    return { star_count, has_starred };
  }

  async getStarCounts(merchantDids: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    for (const did of merchantDids) {
      const count = await this.getStarCount(did);
      if (count > 0) counts.set(did, count);
    }
    return counts;
  }
}
