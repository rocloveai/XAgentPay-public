import pg from "pg";

let pool: pg.Pool | null = null;

export function initPool(databaseUrl: string): void {
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    ssl: { rejectUnauthorized: false },
  });
  // pg returns int4 as string by default — parse as JS number
  pg.types.setTypeParser(23, parseInt);
  console.error("[DB] PostgreSQL pool initialized");
}

export function isPoolInitialized(): boolean {
  return pool !== null;
}

export function getPool(): (
  query: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]> {
  if (!pool) throw new Error("DB pool not initialized — call initPool first");
  return async (query: string, params?: unknown[]) => {
    const result = await pool!.query(query, params);
    return result.rows;
  };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
