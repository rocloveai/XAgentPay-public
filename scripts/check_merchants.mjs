import { neon } from "@neondatabase/serverless";

const databaseUrl = "postgresql://neondb_owner:npg_ozD4dLXYFg1Q@ep-floral-snow-a1hxha0q-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
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
