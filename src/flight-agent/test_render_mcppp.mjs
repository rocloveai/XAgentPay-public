import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
    console.log("Connecting to Render via SSE...");
    const transport = new SSEClientTransport(
        new URL("https://nexus-flight-agent-nr8m.onrender.com/sse")
    );

    const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} }
    );

    await client.connect(transport);
    console.log("Connected and Initialized!");

    console.log("\\n--- Calling search_flights ---");
    const searchRes = await client.callTool({
        name: "search_flights",
        arguments: { origin: "SIN", destination: "SHA", date: "2026-02-24", passengers: 1 }
    });
    console.log(searchRes.content[0].text);

    console.log("\\n--- Calling nexus_generate_quote (Order Placement) ---");
    try {
        const quoteRes = await client.callTool({
            name: "nexus_generate_quote",
            arguments: {
                flight_offer_id: "demo_SIN_SHA_001",
                payer_wallet: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1"
            }
        });

        console.log("\\n[RETURNED ORDER DATA FROM MERCHANT AGENT]");
        console.log(quoteRes.content[0].text);
    } catch (err) {
        console.log("\\n[ERROR FROM MERCHANT AGENT]");
        console.error(err.message || err);
    }

    process.exit(0);
}

main().catch(console.error);
