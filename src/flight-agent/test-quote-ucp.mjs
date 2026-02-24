import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["build/server.js"],
    env: {
      ...process.env,
      MERCHANT_DID: "did:nexus:20250407:demo_flight",
      MERCHANT_SIGNER_PRIVATE_KEY: "0x1234567890123456789012345678901234567890123456789012345678901230", // Dummy key for testing
    }
  });

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  // 1. Search flight first
  console.log("Searching flights...");
  const searchRes = await client.callTool({
    name: "search_flights",
    arguments: { origin: "SFO", destination: "JFK", date: "2026-06-01" }
  });

  console.log("SEARCH OUTPUT:", searchRes.content[0].text);
  let flightId = "demo_SFO_JFK_001";
  const idMatch = searchRes.content[0].text.match(/id:\s*['"]?([^'"\s,]+)['"]?/);
  if (idMatch) {
    flightId = idMatch[1];
  }

  // 2. Generate quote
  console.log("Generating quote for flight:", flightId);
  try {
    const quoteRes = await client.callTool({
      name: "nexus_generate_quote",
      arguments: {
        flight_offer_id: flightId,
        payer_wallet: "0x1234567890123456789012345678901234567890"
      }
    });

    console.log("\n========== RAW STRING OUTPUT ==========\n");
    console.log(quoteRes.content[0].text);
  } catch (e) {
    console.error(e);
  }

  process.exit(0);
}

main().catch(console.error);
