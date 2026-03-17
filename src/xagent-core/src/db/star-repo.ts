import { getPool } from "./pool.js";
import type { StarRepository, StarInfo } from "./interfaces/star-repo.js";

export class NeonStarRepository implements StarRepository {
  async addStar(merchantDid: string, walletAddress: string): Promise<boolean> {
    const sql = getPool();
    const rows = await sql(
      `INSERT INTO merchant_stars (merchant_did, wallet_address)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING merchant_did`,
      [merchantDid, walletAddress.toLowerCase()],
    );
    return rows.length > 0;
  }

  async removeStar(
    merchantDid: string,
    walletAddress: string,
  ): Promise<boolean> {
    const sql = getPool();
    const rows = await sql(
      `DELETE FROM merchant_stars
       WHERE merchant_did = $1 AND wallet_address = $2
       RETURNING merchant_did`,
      [merchantDid, walletAddress.toLowerCase()],
    );
    return rows.length > 0;
  }

  async getStarCount(merchantDid: string): Promise<number> {
    const sql = getPool();
    const rows = await sql(
      `SELECT COUNT(*)::int AS count FROM merchant_stars WHERE merchant_did = $1`,
      [merchantDid],
    );
    return (rows[0]?.count as number) ?? 0;
  }

  async hasStar(merchantDid: string, walletAddress: string): Promise<boolean> {
    const sql = getPool();
    const rows = await sql(
      `SELECT 1 FROM merchant_stars WHERE merchant_did = $1 AND wallet_address = $2`,
      [merchantDid, walletAddress.toLowerCase()],
    );
    return rows.length > 0;
  }

  async getStarInfo(
    merchantDid: string,
    walletAddress?: string,
  ): Promise<StarInfo> {
    const sql = getPool();
    const countRows = await sql(
      `SELECT COUNT(*)::int AS count FROM merchant_stars WHERE merchant_did = $1`,
      [merchantDid],
    );
    const star_count: number = (countRows[0]?.count as number) ?? 0;

    let has_starred = false;
    if (walletAddress) {
      const starredRows = await sql(
        `SELECT 1 FROM merchant_stars WHERE merchant_did = $1 AND wallet_address = $2`,
        [merchantDid, walletAddress.toLowerCase()],
      );
      has_starred = starredRows.length > 0;
    }

    return { star_count, has_starred };
  }

  async getStarCounts(
    merchantDids: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    if (merchantDids.length === 0) return new Map();

    const sql = getPool();
    const placeholders = merchantDids.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await sql(
      `SELECT merchant_did, COUNT(*)::int AS count
       FROM merchant_stars
       WHERE merchant_did IN (${placeholders})
       GROUP BY merchant_did`,
      [...merchantDids],
    );

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.merchant_did as string, row.count as number);
    }
    return counts;
  }
}
