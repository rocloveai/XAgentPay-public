import { neon } from '@neondatabase/serverless';

const DATABASE_URL = "postgresql://neondb_owner:npg_ozD4dLXYFg1Q@ep-floral-snow-a1hxha0q-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const sql = neon(DATABASE_URL);

const quotes = [
    {
        "merchant_did": "did:nexus:20250407:demo_flight",
        "merchant_order_ref": "FLT-SINNRT-FEB-001",
        "amount": "100000",
        "currency": "USDC",
        "chain_id": 20250407,
        "expiry": 1772076066,
        "context": {
            "summary": "Flight SIN -> NRT (SQ638) - 2026-02-27",
            "line_items": [
                {
                    "name": "Premium Economy",
                    "amount": "850000000"
                }
            ],
            "original_amount": "850000000",
            "payer_wallet": "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5"
        },
        "signature": "0xaff33c41389af6f1ab1ae99f7651102085eead1a5c480eb0faf2f45a55f863fb664e01970299591144074a6db0da9c25dc7a5f36b4738fb78035e422b9edc2a71c"
    },
    {
        "merchant_did": "did:nexus:20250407:demo_flight",
        "merchant_order_ref": "FLT-NRTSIN-FEB-001",
        "amount": "100000",
        "currency": "USDC",
        "chain_id": 20250407,
        "expiry": 1772076066,
        "context": {
            "summary": "Flight NRT -> SIN (SQ637) - 2026-02-28",
            "line_items": [
                {
                    "name": "Premium Economy",
                    "amount": "850000000"
                }
            ],
            "original_amount": "850000000",
            "payer_wallet": "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5"
        },
        "signature": "0x39f2bc06d88dcfa2581c626f95ab1339ac5917b9feffa2c29222083690d3583a2eeaeb7e3db47bb8b3753a49ae545d69a26c95cb20e0a2061b86d9cf7cc4c71f1c"
    },
    {
        "merchant_did": "did:nexus:20250407:demo_hotel",
        "merchant_order_ref": "HTL-TYO-FEB-001",
        "amount": "100000",
        "currency": "USDC",
        "chain_id": 20250407,
        "expiry": 1772076066,
        "context": {
            "summary": "Park Hyatt Tokyo (1 Night) - 2026-02-27/28",
            "line_items": [
                {
                    "name": "King Room",
                    "amount": "1200000000"
                }
            ],
            "original_amount": "1200000000",
            "payer_wallet": "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5"
        },
        "signature": "0x56341042cbd25c37b0fbc945880f6916348976e1a11f14016de8a564dea4650935895406b5d6e604ddb2c6d8b1725a274b38a0959ccf2ddca514d872582f60f01b"
    }
];

async function sync() {
    console.log("Syncing orders...");
    for (const quote of quotes) {
        const agentType = quote.merchant_did.includes("flight") ? "flight" : "hotel";
        const now = new Date().toISOString();

        console.log(`Inserting ${quote.merchant_order_ref} (${agentType})...`);
        await sql`
      INSERT INTO orders (order_ref, agent_type, status, quote_payload, payer_wallet, created_at, updated_at)
      VALUES (${quote.merchant_order_ref}, ${agentType}, 'UNPAID', ${JSON.stringify(quote)}, ${quote.context.payer_wallet}, ${now}, ${now})
      ON CONFLICT (order_ref) DO UPDATE SET updated_at = ${now}
    `;
    }
    console.log("Sync complete.");
}

sync().catch(console.error);
