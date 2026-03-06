# RFC-011: XAgent Pay Buyer Skills Standard (NBSS)
| Field | Description |
| --- | --- |
| **Package** | `@nexus/buyer-skills` |
| **Context** | User Agent / Buyer Bot |
| **Protocol** | Compatible with Google UCP v1 & NUPS v1.5 |
| **Role** | Payment Orchestration & Execution |
## 1. Design Goals
This standard aims to provide Agent developers with **zero blockchain barrier** integration. Developers do not need to write any Web3 code (such as `ethers.js` or ABI calls) — they simply register these Skills with the LLM, and the Agent can autonomously complete payments.
## 2. Core Class: `XAgent PayBuyerToolkit`
This is the SDK entry point. It manages the wallet signer and the connection to XAgent Pay Core.
```typescript
import { XAgent PayBuyerToolkit } from '@nexus/buyer-skills';
import { PrivateKeySigner } from '@nexus/buyer-skills/signers'; // Or import from wagmi/viem
// Initialize the toolkit
const nexusToolkit = new XAgent PayBuyerToolkit({
// 1. Agent identity (for risk control and signing)
signer: new PrivateKeySigner(process.env.AGENT_WALLET_PRIVATE_KEY),
// 2. Environment configuration
chainId: 210425, // XLayer / Ethereum / Base ...
coreUrl: "https://api.nexus.xyz" // XAgent Pay Core MCP/API Endpoint
});
```
---
## 3. Standard Skills Definition (The Skills)
This toolkit exposes three core Skills. Each Skill includes standard `name`, `description` (Prompt), and `schema` (Zod), which can be directly injected into Agent frameworks.
### Skill 1: `PreparePayment` (Payment Orchestration)
**Positioning:** Transforms a UCP "quote" into a "signable transaction".
**LLM Cognition:** "When a merchant returns a xXAgent Pay quote, use this tool to perform preprocessing and risk control checks."
* **Tool Name:** `nexus_prepare_transaction`
* **Description:** "Analyzes a UCP payment quote, performs risk checks via XAgent Pay Core, and generates a signable blockchain transaction manifest."
* **Input Schema:**
```typescript
z.object({
// Directly accepts the payment_method object from the UCP protocol
ucp_payment_method: z.object({
type: z.literal("urn:ucp:payment:nexus_v1"),
payload: z.any() // NUPS v1.5 Quote JSON
}).describe("The entire payment method object from the Merchant's UCP response")
})
```
* **Output:** `TransactionManifest` (contains `to`, `data`, `nexus_payment_id`, etc.).
### Skill 2: `ExecutePayment` (Execute Payment)
**Positioning:** Invokes the Agent's wallet for signing and on-chain submission.
**LLM Cognition:** "When preprocessing is complete and the decision to pay is confirmed, use this tool to transfer funds."
* **Tool Name:** `nexus_execute_transaction`
* **Description:** "Signs and broadcasts the transaction manifest using the Agent's configured wallet. This action moves funds."
* **Input Schema:**
```typescript
z.object({
nexus_payment_id: z.string().describe("The ID returned from preparation step"),
transaction_manifest: z.any().describe("The manifest object returned from preparation step")
})
```
* **Output:** `{ status: "BROADCASTED", tx_hash: "0x..." }`
### Skill 3: `TrackOrder` (Track Status)
**Positioning:** Confirms whether the transaction has been accepted by the merchant (closed loop).
**LLM Cognition:** "After payment is completed, you must use this tool to confirm whether the merchant has received and confirmed fulfillment."
* **Tool Name:** `nexus_track_status`
* **Description:** "Polls XAgent Pay Core until the order is confirmed by the merchant (MERCHANT_ACCEPTED) or fails."
* **Input Schema:**
```typescript
z.object({
nexus_payment_id: z.string()
})
```
* **Output:** `{ status: "COMPLETED", merchant_ref: "..." }`
---
## 4. Integration Examples: How to Import the Code
The following demonstrates how to use these standard Skills in popular Agent frameworks.
### Scenario A: Using Google Genkit (Node.js)
Google Genkit is UCP's native companion.
```typescript
import { genkit } from 'genkit';
import { nexusBuyerPlugin } from '@nexus/buyer-skills/adapters/genkit';
const ai = genkit({
plugins: [
// One line of code to inject all XAgent Pay capabilities
nexusBuyerPlugin({
privateKey: process.env.KEY,
chainId: 210425
})
]
});
// Define Flow
export const buyProduct = ai.defineFlow({
name: 'buyProduct',
inputSchema: z.any(), // Input: UCP Response
}, async (ucpResponse) => {
// LLM automatically plans:
// 1. Recognizes the XAgent Pay Quote inside the UCP Response
// 2. Calls nexus_prepare_transaction
// 3. Calls nexus_execute_transaction
// 4. Calls nexus_track_status
const result = await ai.generate({
prompt: `Complete the payment for this UCP offer: ${JSON.stringify(ucpResponse)}`,
tools: ['nexus_prepare_transaction', 'nexus_execute_transaction', 'nexus_track_status']
});
return result.text;
});
```
### Scenario B: Using LangChain (Python/JS)
```typescript
import { XAgent PayBuyerToolkit } from '@nexus/buyer-skills';
const toolkit = new XAgent PayBuyerToolkit({...});
// Get a LangChain-compatible Tools array
const tools = toolkit.getTools();
const agent = createOpenAIFunctionsAgent({
llm,
tools,
prompt
});
// Agent execution
await agent.invoke({
input: "I accept the quote from Trip.com. Please pay it."
});
```
---
## 5. Agent Internal Execution Flow (The Internal Loop)
After the Agent imports this code, the standard Chain of Thought for processing a UCP order is as follows:
1. **Observation:** The user wants to buy a ticket. The merchant returned UCP JSON containing `urn:ucp:payment:nexus_v1`.
2. **Thought:** I need to convert this Quote into a transaction.
3. **Action:** Call `nexus_prepare_transaction(quote)`.
4. **Observation:** XAgent Pay Core returned `risk: PASS` and a `manifest`.
5. **Thought:** Risk control passed, and the user has authorized it (assuming the Agent has an automatic spending limit). I will now execute on-chain.
6. **Action:** Call `nexus_execute_transaction(manifest)`.
7. **Observation:** The transaction has been broadcast. The hash is `0x123...`.
8. **Thought:** I need to wait for merchant confirmation to ensure the ticket was successfully issued.
9. **Action:** Call `nexus_track_status(id)`.
10. **Observation:** The status changed to `MERCHANT_ACCEPTED`.
11. **Final Response:** "Payment successful, the merchant has confirmed ticket issuance!"
---
## 6. Security and Publishing Standards
To make this package `public publishable`, the following security design principles must be followed:
1. **Non-Custodial Design:** `@nexus/buyer-skills` **never** hardcodes private keys in the code. Private keys must be injected by the developer at runtime via a `Signer` instance.
2. **Manifest Verification (Explicit Confirmation):** During the `ExecutePayment` step, the SDK should support passing an `approvalCallback`. For attended Agents, this can trigger a popup for user secondary confirmation; for unattended Agents, the behavior is determined by policy configuration.
3. **Minimal Dependencies:** The package should be as small as possible, with no dependency on large UI libraries — only lightweight cryptographic libraries (such as `viem`).
By publishing this standardized SDK, XAgent Pay effectively establishes **the industry standard for "Agent Pay"**. Any Agent that installs this plugin automatically gains the ability to connect to the global XAgent Pay merchant network.
