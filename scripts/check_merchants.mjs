import { neon } from "@neondatabase/serverless";

// Load DATABASE_URL from environment — never hardcode credentials here.
// Usage: DATABASE_URL="postgresql://..." node scripts/check_merchants.mjs
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is required");
  process.exit(1);
}
const sql = neon(databaseUrl);

async function main() {
    try {
        const merchants = await sql`SELECT merchant_did, signer_address, is_active FROM merchant_registry`;
        console.log(JSON.stringify(merchants, null, 2));
    } catch (err) {
        console.error("DB Error:", err);
    }
}

main();
