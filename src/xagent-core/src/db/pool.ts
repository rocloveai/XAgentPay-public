import pg from "pg";

let pool: pg.Pool | null = null;

export function initPool(databaseUrl: string): void {
  const isLocal =
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1") ||
    databaseUrl.includes("sslmode=disable");
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    ssl: isLocal
      ? false
      : {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
          ...(process.env.DB_CA_CERT ? { ca: process.env.DB_CA_CERT } : {}),
        },
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

/**
 * Idempotent schema migrations run on every startup.
 * Safe to run repeatedly — all statements use IF NOT EXISTS / IF EXISTS guards.
 */
export async function runStartupMigrations(): Promise<void> {
  if (!pool) return;
  const migrations = [
    // 012: skill_user_url column for HTTP REST API docs link
    `ALTER TABLE merchant_registry ADD COLUMN IF NOT EXISTS skill_user_url TEXT`,
  ];
  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.error("[DB] Startup migration failed:", sql, err);
    }
  }
  console.error("[DB] Startup migrations complete");
}
