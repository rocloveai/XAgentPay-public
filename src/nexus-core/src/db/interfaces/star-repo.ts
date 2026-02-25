export interface StarInfo {
  readonly star_count: number;
  readonly has_starred: boolean;
}

export interface StarRepository {
  /** Add a star. Returns true if newly added, false if already existed. */
  addStar(merchantDid: string, walletAddress: string): Promise<boolean>;

  /** Remove a star. Returns true if removed, false if didn't exist. */
  removeStar(merchantDid: string, walletAddress: string): Promise<boolean>;

  /** Get total star count for a merchant. */
  getStarCount(merchantDid: string): Promise<number>;

  /** Check if a wallet has starred a merchant. */
  hasStar(merchantDid: string, walletAddress: string): Promise<boolean>;

  /** Get star count and whether a specific wallet has starred. */
  getStarInfo(merchantDid: string, walletAddress?: string): Promise<StarInfo>;

  /** Batch query: get star counts for multiple merchants. */
  getStarCounts(
    merchantDids: readonly string[],
  ): Promise<ReadonlyMap<string, number>>;
}
