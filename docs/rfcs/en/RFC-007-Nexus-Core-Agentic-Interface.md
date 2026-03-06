# RFC-007: XAgent Pay Core Agentic Interface
| Metadata | Value |
| --- | --- |
| **Title** | XAgent Pay Core Agentic Interface |
| **Version** | **1.7.0 (Interactive Escrow Edition)** |
| **Status** | **Final Specification** |
| **Protocol** | Model Context Protocol (MCP) |
| **Architecture** | Hub (XLayer) + Spoke (MPC Ingress) + KYT Firewall |
## 1. Core Design Philosophy
XAgent Pay Core operates as an **MCP Server**, providing two standard plugin sets to Agents in the network:
1. **Buyer Plugin:** Guides the UA through the entire flow of "Quote -> Select Chain -> Pay -> Receive Goods".
2. **Seller Plugin:** Helps the MA complete the closed loop of "Check Balance -> Fulfill -> Withdraw".
The interaction model follows **"Draft-then-Finalize"**: first generate a draft order for the user to select a payment method, then lock in and generate a dedicated MPC custody address.
---
## 2. XAgent Pay Buyer Plugin (For User Agent)
This plugin grants the UA the ability to process payment intents, interact with users to select networks, and execute fund escrow.
### Tool A: `initialize_payment` (Initialize / Pre-orchestration)
**Lifecycle Stage:** **Discovery** (when the user sees the quote card)
**Function:** Register order intent, compute cross-chain routing, and return payment options for the user to choose from.
* **Input Schema:**
```json
{
"quote_payload": {
"type": "object",
"description": "NUPS quote payload extracted from the merchant-returned UCP Checkout Session (`ucp.payment_handlers['urn:ucp:payment:nexus_v1'][0].config`)",
"required": true
}
}
```
* **Output Schema:**
```json
{
"nexus_payment_id": "NEX-UUID-001", // Draft ID
"status": "AWAITING_USER_SELECTION",
"expiry": 1760000000,
"fiat_value": { "amount": "530.00", "currency": "USD" },
// Core: option list for UI rendering
"payment_options": [
{
"option_id": "opt_base_usdc",
"chain_id": 8453,
"chain_name": "Base",
"token_symbol": "USDC",
"amount_uint256": "530000000",
"est_gas_fee_usd": "0.02",
"bridge_fee_usd": "0.50",
"tags": ["RECOMMENDED", "BEST_VALUE"]
},
{
"option_id": "opt_eth_usdc",
"chain_id": 1,
"chain_name": "Ethereum",
"est_gas_fee_usd": "5.00",
"tags": ["HIGH_GAS"]
},
{
"option_id": "opt_platon_usdc",
"chain_id": 210425,
"chain_name": "XLayer",
"bridge_fee_usd": "0.00",
"tags": ["NATIVE_SETTLEMENT"]
}
]
}
```
### Tool B: `finalize_payment` (Final Orchestration / Obtain Address)
**Lifecycle Stage:** **Decision** (when the user clicks the "Pay" button)
**Function:** Lock in the user's selection, assign a dedicated MPC ephemeral custody address, and prepare to receive funds.
* **Input Schema:**
```json
{
"nexus_payment_id": "NEX-UUID-001",
"selected_option_id": "opt_base_usdc", // User-selected path
"payer_wallet": "0xUserAddress..." // User's connected wallet address (for subsequent KYT association)
}
```
* **Output Schema:**
```json
{
"status": "AWAITING_DEPOSIT",
"kyc_policy": "STRICT", // Note: strict KYT will be performed after deposit
// Core: payment instruction
"payment_instruction": {
"chain_id": 8453,
"chain_name": "Base",
// MPC Custody Address (Ephemeral Address)
"target_address": "0xXAgent PayMPC_Temp_Addr_99",
"token_address": "0xUSDC_Base_Addr",
"amount": "530000000",
// Explicitly instruct the UA to use a plain transfer, not a contract call
"method": "transfer",
"calldata": "0x"
},
"validity_window": "30 minutes"
}
```
### Tool C: `sign_release` (Confirm Receipt / Release Funds)
**Lifecycle Stage:** **Verification** (after the user confirms receipt of service)
**Function:** Produce an EIP-712 signature over the order ID, authorizing the release of funds to the merchant.
* **Input Schema:**
```json
{
"nexus_payment_id": "NEX-UUID-001",
"rating": 5 // (Optional) Rating
}
```
* **Output Schema:**
```json
{
"status": "RELEASE_SIGNED",
"signature": "0xUserReleaseSig...",
"message": "Signature uploaded to Core. Merchant notified."
}
```
---
## 3. XAgent Pay Seller Plugin (For Merchant Agent)
This plugin grants the MA seamless cross-chain collection capabilities; the MA only needs to monitor the Hub Chain (XLayer) state.
### Tool A: `verify_order_lock` (Verify Fulfillment Conditions)
**Lifecycle Stage:** **Fulfillment** (before the MA prepares to fulfill/ship)
**Function:** Query the Escrow contract on the Hub Chain (XLayer) to confirm whether funds are securely locked (LOCKED).
**Logic:** This tool only returns LOCKED after Core has completed KYT and synchronized the state.
* **Input Schema:**
```json
{ "merchant_order_ref": "TRIP-888" }
```
* **Output Schema:**
```json
{
"nexus_payment_id": "NEX-UUID-001",
"status": "LOCKED", // Key signal: safe to fulfill
"amount_settled": "530.00",
"currency": "USDC",
"hub_chain": "XLayer",
"kyt_result": "PASS" // Funds are compliant
}
```
### Tool B: `claim_funds` (Withdraw / Settle)
**Lifecycle Stage:** **Settlement** (after receiving the user's Release signature)
**Function:** Pull the user's signature from XAgent Pay Core and call the on-chain contract on XLayer to withdraw funds.
* **Input Schema:**
```json
{ "nexus_payment_id": "NEX-UUID-001" }
```
* **Output Schema:**
```json
{
"status": "CLAIMED",
"tx_hash": "0xXLayerTxHash...",
"settled_at": "2026-01-21T12:00:00Z"
}
```
---
## 4. Core State Machine (Order State Machine)
The single source of truth maintained by XAgent Pay Core, exposed via MCP Resource `nexus://core/orders/{id}`.
| Status | Meaning | Triggering Action | UA Interface Display |
| --- | --- | --- | --- |
| **DRAFT** | Order intent created | `initialize_payment` | Selector View (Chain/Wallet) |
| **AWAITING_DEPOSIT** | MPC address assigned | `finalize_payment` | Transfer View (Target Addr) |
| **DETECTING** | On-chain deposit detected | Listener captures Tx | "Verifying Transaction..." |
| **SYNCING** | KYT passed, writing to Hub | KYT Engine | "Securing Funds..." |
| **LOCKED** | **[Milestone]** Locked on XLayer | Hub contract event | "Payment Successful" |
| **RELEASE_SIGNED** | User signed release | `sign_release` | "Order Completed" |
| **CLAIMED** | Merchant withdrew funds | `claim_funds` | (History Record) |
| **RISK_REJECTED** | KYT failed | KYT Engine | "Security Alert" (triggers refund) |
---
## 5. Implementation Guidance for Antigravity
### Core Server (`nexuspay-core`)
1. **Routing Engine:** Requires hardcoded or configured RPC endpoints for XLayer, Base, and Ethereum to fetch real-time Gas Prices and calculate `est_gas_fee_usd`.
2. **MPC Service:** Integrate an MPC wallet SDK (e.g., Fireblocks, Coinbase WaaS, or custom TSS) to derive child addresses during `finalize_payment`.
3. **KYT Hook:** During the `DETECTING` state, block the flow and call the KYT API; only execute `createVirtualDeposit` to XLayer after passing.
### UA Integration (`@nexus/ua-kit`)
1. **Step 1:** Component Mount -> call `initialize_payment` -> render `<ChainSelector>`.
2. **Step 2:** User selects Base + connects wallet -> clicks Pay -> call `finalize_payment`.
3. **Step 3:** Obtain `target_address` -> call `wagmi.sendTransaction({ to: target_address, value: 0 })` (for USDC, call ERC20 transfer instead).
4. **Step 4:** Poll Core status until `LOCKED`.
This specification fully satisfies all requirements for **multi-chain interaction**, **user choice**, **KYT compliance**, and **trustless custody**.