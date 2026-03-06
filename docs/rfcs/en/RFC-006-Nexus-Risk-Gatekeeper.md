# RFC-006: XAgent Pay Risk Gatekeeper Specificationn
| Metadata | Value |
| --- | --- |
| **Title** | XAgent Pay Risk Gatekeeper Protocol |
| **Version** | 1.0.0 |
| **Status** | Standards Track (Draft) |
| **Scope** | Risk Assessment, Permit Issuance, On-Chain Enforcement |
## 1. Abstract
XAgent Pay Risk Gatekeeper is the **security guardian** of the payment network. It adopts a **"Hybrid Guard"** architecture: the off-chain AI engine handles complex behavioral analysis and issues credentials (Permits), while on-chain smart contracts verify credentials and enforce hard interceptions. The Gatekeeper is transparent to Payment Core — Core only needs to pass through the credentials without understanding the risk control logic.
## 2. Architecture: Hybrid Control
### 2.1 Off-Chain Engine (The Brain)
* **Data Ingestion:** Receives transaction context from Core, on-chain historical data, and external intelligence feeds (e.g., Chainalysis).
* **Decision Model:** Runs a Rule Engine and ML models.
* **Signing Service:** Holds the `Gatekeeper Oracle Key` and performs EIP-712 signing on approved transactions.
### 2.2 On-Chain Controller (The Limbs)
* **Storage:** Stores blocklists, limit configurations, and Oracle public keys.
* **Verification:** Verifies Permit legitimacy during atomic transaction execution.
## 3. The Risk Permit Standard
This is the core medium of interaction between the Gatekeeper and the Router. It must be resistant to replay attacks and tampering.
### EIP-712 Structure
```solidity
struct RiskPermit {
bytes32 quoteHash; // Bound to the merchant's specific quote (prevents misuse for other orders)
address payer; // Bound to the payer (prevents front-running or Permit theft)
address merchant; // Bound to the payee
uint256 amountCap; // Amount ceiling
uint256 deadline; // Permit validity period (typically very short, e.g., 5 minutes)
bytes signature; // Gatekeeper Oracle's signature
}
```
## 4. Process Logic: The Checkpoint
### 4.1 Phase 1: Pre-Flight Check (Orchestration-Phase Check)
When Core requests a risk assessment:
1. **Sanity Check:** Checks whether the amount exceeds limits and whether the merchant DID is on the watchlist.
2. **Context Analysis:** Checks whether the IP geolocation and wallet historical behavior are anomalous (e.g., sudden large cross-border payments).
3. **Issuance:**
* **PASS:** Returns the `RiskPermit` struct along with the signature.
* **CHALLENGE:** (Future extension) Returns instructions requiring the user to perform 2FA or biometric verification.
* **REJECT:** Returns a rejection reason code (e.g., `ERR_RISK_HIGH_FRAUD`).
### 4.2 Phase 2: On-Chain Enforcement (Runtime Interception)
When `XAgent PayRouter` calls `XAgent PayRiskController.assessRisk(...)`:
1. **Signature Verification:** `ecrecover` recovers the signer, which must equal `GatekeeperOracle`.
2. **Binding Verification:** Validates that `msg.sender == permit.payer` and that `amount <= permit.amountCap`.
3. **Liveness Check:** Validates that `block.timestamp <= permit.deadline`.
4. **Global Blocklist:** Re-checks whether `payer` and `merchant` are on the contract's emergency blocklist (even with a valid Permit, the blocklist takes higher priority).
## 5. Design Key Points
1. **Fail-Close Mechanism:** If the off-chain risk control service goes down and cannot issue Permits, the on-chain contract will reject all new transactions. This ensures that no fund risk occurs during system failures.
2. **Privacy Preservation:** Sensitive user data such as IP addresses and device IDs **only enter the off-chain risk engine** and are never recorded on-chain. The on-chain component only verifies the Permit signature and contains no privacy-sensitive fields.
3. **Decoupling:** `XAgent PayRouter` (on the Core side) only needs to receive a `bool isPassed` result — it does not need to know the specific risk control rules. Upgrading rules (e.g., adjusting limits) only requires upgrading the Gatekeeper module.
---
### Summary: Interaction Protocol Between Core and Gatekeeper
To link the two together, we need to define an Internal Protocol.
**Request (Core -> Gatekeeper):**
```json
{
"request_id": "REQ-123",
"quote_hash": "0xabc...",
"payer": "0xUser...",
"merchant": "0xMerchant...",
"context": { "ip": "1.2.3.4", "device_score": 0.9 }
}
```
**Response (Gatekeeper -> Core):**
```json
{
"decision": "PERMIT", // or REJECT
"permit_payload": {
"deadline": 1760000000,
"signature": "0xSig..."
},
"risk_metadata": { "score": 10, "label": "SAFE" }
}
```