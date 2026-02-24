import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

export function initPool(databaseUrl: string): void {
  sql = neon(databaseUrl);
  console.error("[DB] Neon pool initialized");
}

export function isPoolInitialized(): boolean {
  return sql !== null;
}

export function getPool(): NeonQueryFunction<false, false> {
  if (!sql) throw new Error("DB pool not initialized — call initPool first");
  return sql;
}
