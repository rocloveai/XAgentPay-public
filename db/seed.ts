/**
 * db/seed.ts — Run migrations + seed data against Neon PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npm run seed
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(databaseUrl);

function loadSql(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf-8");
}

/**
 * Neon HTTP driver only supports one statement per call.
 * Split on semicolons followed by a newline (not inside parentheses).
 */
function splitStatements(raw: string): string[] {
  // Split on ";" that appears at the end of a line (possibly followed by whitespace)
  // We use a simple approach: split on ";\n" boundaries
  const parts: string[] = [];
  let current = "";

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    // Skip pure comment lines and empty lines when we have no current content
    if (current === "" && (trimmed === "" || trimmed.startsWith("--"))) {
      continue;
    }
    current += (current ? "\n" : "") + line;

    // A statement ends when the trimmed line ends with ";"
    // but NOT inside a CREATE TABLE (...) block
    if (trimmed.endsWith(";")) {
      const stmt = current.trim();
      if (stmt.length > 0) {
        // Remove trailing semicolon for execution
        parts.push(stmt.replace(/;\s*$/, ""));
      }
      current = "";
    }
  }

  // Any leftover
  const remaining = current.trim();
  if (remaining.length > 0) {
    parts.push(remaining.replace(/;\s*$/, ""));
  }

  return parts.filter((s) => s.length > 0 && !s.startsWith("--"));
}

async function execStatements(raw: string): Promise<void> {
  const statements = splitStatements(raw);
  for (const stmt of statements) {
    await sql(stmt);
  }
}

async function run(): Promise<void> {
  console.log("Running migrations...");
  await execStatements(loadSql("migrations/001_initial_schema.sql"));
  console.log("  001_initial_schema.sql applied");

  console.log("Seeding flights...");
  await execStatements(loadSql("seed/seed-flights.sql"));
  console.log("  seed-flights.sql applied");

  console.log("Seeding hotels...");
  await execStatements(loadSql("seed/seed-hotels.sql"));
  console.log("  seed-hotels.sql applied");

  console.log("Done. Verifying row counts...");

  const flights = await sql("SELECT count(*) AS cnt FROM flight_templates");
  const hotels = await sql("SELECT count(*) AS cnt FROM hotel_templates");
  const orders = await sql("SELECT count(*) AS cnt FROM orders");

  console.log(`  flight_templates: ${flights[0].cnt}`);
  console.log(`  hotel_templates:  ${hotels[0].cnt}`);
  console.log(`  orders:           ${orders[0].cnt}`);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
