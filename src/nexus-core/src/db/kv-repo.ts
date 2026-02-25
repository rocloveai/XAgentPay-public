import { getPool } from "./pool.js";
import type { KVRepository } from "./interfaces/kv-repo.js";

export class NeonKVRepository implements KVRepository {
  async get(key: string): Promise<string | null> {
    const sql = getPool();
    const rows = await sql(`SELECT value FROM kv_store WHERE key = $1`, [key]);
    return rows.length > 0 ? (rows[0].value as string) : null;
  }

  async set(key: string, value: string): Promise<void> {
    const sql = getPool();
    await sql(
      `INSERT INTO kv_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value],
    );
  }
}
