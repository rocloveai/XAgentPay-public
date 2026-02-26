# RFC-004: Nexus Client Standard (NCS)

| Metadata | Value |
| --- | --- |
| **Title** | Nexus Client Standard |
| **Version** | 1.5.0 |
| **Status** | Standards Track (Draft) |
| **Dependencies** | RFC-002 (NUPS), RFC-003 (NAIS) |

Below are three ways for merchants to integrate the code, ranging from **most automated (AI Agent) to most controllable (traditional backend)**.
---
### 1. Core Dependency Package (The Package)
Merchants only need to install one package:
```bash
npm install @nexus/seller-sdk
```
This package includes:
* **Signer:** Handles EIP-712 offline signing.
* **Client:** Handles communication with Nexus Core (MCP).
* **Adapters:** Adapters for LangChain, Genkit, and MCP.
---
### Approach 1: AI Native Mode (For Google Genkit/LangChain)
This is the most simplified integration approach. If a merchant is developing an Agent using Google Genkit, they only need **one line of code** to register the plugin. The Agent's LLM will automatically learn when to invoke payment functionality.
#### Code Implementation
```typescript
// src/agent.ts
import { genkit } from 'genkit';
import { nexusSellerPlugin } from '@nexus/seller-sdk/genkit';
const ai = genkit({
plugins: [
// --- 1. Import Nexus Plugin ---
nexusSellerPlugin({
merchantDid: process.env.MERCHANT_DID, // e.g. "did:nexus:trip_com"
privateKey: process.env.MERCHANT_KEY, // Your private key
env: 'production' // Or 'sandbox'
})
]
});
// --- 2. Your Business Flow ---
export const bookFlight = ai.defineFlow({
name: 'bookFlight',
inputSchema: z.string(),
}, async (input) => {
// --- 3. Where the Magic Happens ---
// You don't need to write any payment logic.
// The LLM will automatically, based on context, call the `nexus_create_quote` tool from the plugin,
// and generate a UCP-compliant JSON response to return to the user.
const response = await ai.generate({
prompt: `User wants to book flight ${input}. Price is 530 USDC. Generate a Nexus payment quote.`,
tools: ['nexus_create_quote'] // Explicitly allow the LLM to use the Nexus tool
});
return response.output;
});
```
**Result:** The merchant Agent instantly gains the ability to "issue quotes" and "verify funds", without writing any additional glue code.
---
### Approach 2: MCP Server Mode (For General Agent Integration)
If a merchant wants to expose their service to Claude Desktop, Cursor, or other general Agents via **MCP (Model Context Protocol)**, they can use the built-in MCP Server class.
#### Code Implementation
```typescript
// src/mcp-server.ts
import { NexusMcpServer } from '@nexus/seller-sdk/mcp';
// --- 1. Start the Server ---
const server = new NexusMcpServer({
name: "Trip.com Payment Service",
version: "1.0.0",
identity: {
did: process.env.MERCHANT_DID,
key: process.env.MERCHANT_KEY
}
});
// This automatically exposes tools via Stdio:
// - nexus_create_quote
// - nexus_verify_settlement
// - nexus_confirm_fulfillment
server.start();
console.log("Nexus MCP Server running...");
```
**Result:** Any MCP-compatible client (such as Claude) can now directly connect to this service and perform ordering and payment interactions on behalf of the user.
---
### Approach 3: Traditional Backend Integration (For REST API / UCP Adapters)
For existing Web2 systems (such as Express/NestJS-based UCP adapter layers), we provide an imperative API.
#### Code Implementation
```typescript
// src/controllers/booking.controller.ts
import { NexusClient } from '@nexus/seller-sdk';
const nexus = new NexusClient({
privateKey: process.env.KEY,
merchantDid: "did:nexus:trip_com"
});
// Scenario: Inject payment methods when returning UCP Search results
app.post('/ucp/search', async (req, res) => {
const { flightId, price } = req.body;
// --- 1. Generate Quote (Pure local computation, no network latency) ---
const quote = nexus.signQuote({
orderRef: `ORD-${Date.now()}`,
amount: price, // e.g. 530.00
currency: 'USDC',
lineItems: [{ name: "Flight Ticket", amount: price }]
});
// --- 2. Return UCP Standard JSON ---
res.json({
offers: [...],
payment_methods: [
{
type: "urn:ucp:payment:nexus_v1",
payload: quote // <--- Inject the generated JSON
}
]
});
});
// Scenario: Handle fulfillment (after receiving Core Webhook or user request)
app.post('/fulfill', async (req, res) => {
const { orderRef } = req.body;
// --- 3. Proactively query Nexus Core for settlement (Risk control & fund verification) ---
const result = await nexus.verifySettlement(orderRef);
if (result.status === 'SETTLED' && result.risk === 'LOW') {
// Safe! Proceed with fulfillment
await issueTicket(orderRef);
// 4. Notify Core to close the transaction loop
await nexus.confirmFulfillment(result.nexusPaymentId);
res.json({ success: true });
} else {
res.status(400).json({ error: "Payment verification failed" });
}
});
```
---
### Key Design Points for Simplified Integration
To achieve a "minimalist" experience, we have done extensive encapsulation within the SDK:
1. **Automatic ISO Mapping:**
The merchant inputs `currency: 'USDC'`, and the SDK automatically converts it to `{ iso_4217: 'USD', dti: '4H95...' }`. Merchants don't need to look up the ISO standard manual.
2. **Automatic Unit Conversion:**
The merchant inputs `530.00` (floating point), and the SDK automatically converts it to `530000000` (Wei) based on the token's precision, preventing precision loss issues.
3. **Built-in Mock Mode:**
In the development environment (`env: 'sandbox'`), the SDK won't actually sign anything. Instead, it generates test Mock data, allowing merchants to run through the entire UCP flow without spending a single cent.
4. **Smart Retry & Polling:**
The `verifySettlement` method has a built-in exponential backoff strategy. If a transaction was just broadcast on-chain and hasn't been confirmed yet, the SDK will automatically wait a few seconds and retry, returning the finalized result to the merchant instead of throwing an error.
### Summary
For MA developers:
* **If you're an AI team:** Use `nexusSellerPlugin` -- just add one line to your `genkit` configuration.
* **If you're an API team:** Use `NexusClient` -- just add two lines to your Controller (`signQuote` and `verifySettlement`).
This design minimizes the cognitive barrier to Web3, turning payments into simple function calls.
