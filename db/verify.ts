import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function verify() {
  console.log("=== merchant_registry ===");
  const merchants = await sql("SELECT merchant_did, name, signer_address, payment_address, webhook_url, is_active FROM merchant_registry");
  console.table(merchants);

  console.log("\n=== payments table columns (including escrow fields) ===");
  const cols = await sql("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'payments' ORDER BY ordinal_position");
  console.table(cols);

  console.log("\n=== all tables created ===");
  const tables = await sql("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.table(tables);
}

verify().catch((err) => {
  console.error("Verify failed:", err);
  process.exit(1);
});
