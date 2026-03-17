# RFC-001: Nexus DID Method Specification
| Metadata | Value |
| --- | --- |
| **Title** | The `did:nexus` Method Specification |
| **Version** | 1.0.0 |
| **Status** | Draft |
| **Author** | Cipher & XAgent Pay Architect Team |
| **Created** | 2026-01-20 |
| **Target Layer** | Google UCP Payment Extension / EVM Chains |
## Abstract
The Nexus DID method (`did:nexus`) is a decentralized identifier scheme based on EVM blockchains (such as XLayer, Ethereum). It is designed to provide verifiable identity, payment routing, and signature verification capabilities for merchant entities in the AI Agent commerce network (UCP). This method supports Account Abstraction, allowing merchants to separate their "custody account" (e.g., Gnosis Safe) from their "high-frequency signing account" (e.g., hot wallet).
## 1. Method Name
The name of this DID method is `nexus`.
DID strings must begin with the prefix: `did:xagent:`.
## 2. DID Syntax
The Nexus DID uses a simple **three-segment structure**, resolved through an on-chain registry contract.
### 2.1 ABNF Definition
```abnf
nexus-did = "did:xagent:" chain-id ":" unique-id
chain-id = 1*DIGIT ; EVM Chain ID (e.g., 210425)
unique-id = 1*id-char ; Merchant's unique registered name
id-char = ALPHA / DIGIT / "_" / "-"
```
### 2.2 Examples
* **Trip.com (XLayer Mainnet):** `did:xagent:210425:trip_com`
* **XAgent Pay OTC (Local Devnet):** `did:xagent:31337:nexus_otc_01`
---
## 3. DID Document
When a User Agent resolves a `did:nexus`, it should return a standard DID Document JSON. This document is dynamically generated from data in the on-chain `XAgent PayMerchantRegistry` contract.
### 3.1 Data Model Mapping
The on-chain registry contains the following fields, mapped to the DID Document:
| Registry Field | DID Document Section | Description |
| --- | --- | --- |
| `name` | `id` | Unique identifier |
| `signer` | `verificationMethod` | **Authentication key**: used to verify signatures on UCP responses |
| `paymentAddress` | `service` (type: PaymentEndpoint) | **Funds entry point**: used to receive token transfers |
| `metadata` | `service` (type: MetadataService) | Merchant logo, contact info, etc. |
### 3.2 Full DID Document Example
```json
{
"@context": [
"https://www.w3.org/ns/did/v1",
"https://w3id.org/security/suites/secp256k1-2019/v1"
],
"id": "did:xagent:210425:trip_com",
// 1. Verification Methods (Who is authorized to sign on behalf of this merchant?)
// Supports EOA or EIP-1271 contracts
"verificationMethod": [{
"id": "did:xagent:210425:trip_com#key-1",
"type": "EcdsaSecp256k1RecoveryMethod2020",
"controller": "did:xagent:210425:trip_com",
"blockchainAccountId": "eip155:210425:0xSignerAddress..."
}],
// 2. Authentication Relationship
"authentication": [
"did:xagent:210425:trip_com#key-1"
],
// 3. Service Endpoints (Where do funds go? Where is the metadata?)
"service": [
{
"id": "#payment",
"type": "xXAgent PaymentEndpoint",
"serviceEndpoint": "eip155:210425:0xTreasurySafeContractAddress..."
},
{
"id": "#metadata",
"type": "MerchantMetadata",
"serviceEndpoint": "https://api.trip.com/nexus/metadata.json"
}
]
}
```
---
## 4. CRUD Operations
All operations are executed by calling the `XAgent PayMerchantRegistry` smart contract.
### 4.1 Create (Register)
The merchant calls the contract method:
```solidity
function register(
string calldata name,
address paymentAddress,
address signer,
string calldata metadata
) external;
```
* **Constraint:** `name` must not already be taken under the current `chain-id`.
* **Cost:** A small amount of gas is required.
### 4.2 Read (Resolve)
The resolver is the User Agent or XAgent Pay Explorer.
1. Parse the DID string, extracting `chain-id` and `name`.
2. Connect to the corresponding chain's RPC node.
3. Call the contract's `getMerchant(name)` to retrieve the struct.
4. Assemble the JSON response according to the format in Section 3.2.
### 4.3 Update
The merchant (must be the `signer` or contract Owner) calls:
```solidity
function updateMerchant(
string calldata name,
address newSigner,
address newPaymentAddress
) external;
```
* **Use case:** The business has rotated its hot wallet private key, or switched to a new multisig contract for receiving funds.
### 4.4 Deactivate
The merchant calls `deregister(name)`.
* After deactivation, the DID Document is empty.
* The `name` is released (or reserved per governance rules).
---
## 5. Security & Compatibility
### 5.1 Key Separation
This specification mandates support for **separation of funds and authority**.
* `service.serviceEndpoint` (PaymentAddress) can be a cold wallet or multisig contract.
* `verificationMethod` (Signer) can be a hot wallet on a server.
* **Security advantage:** Even if the server is compromised, an attacker can only publish fraudulent quotes (which can be intercepted by risk controls) but cannot steal merchant funds.
### 5.2 Contract Wallet Support (EIP-1271 Compliance)
When the User Agent verifies a signature, it must follow this logic:
1. Extract the address `A` from the `verificationMethod` in the DID Document.
2. Obtain the signature `S` and the data hash `H`.
3. Check whether address `A` contains code (`extcodesize > 0`).
* **NO (EOA):** Use `ecrecover(H, S)` to verify it equals `A`.
* **YES (Contract):** Call `A.isValidSignature(H, S)`. If it returns `0x1626ba7e` (Magic Value), verification passes.
---
## 6. Implementation Notes
### 6.1 Antigravity Task List
Based on this RFC, the following development tasks must be executed:
1. **Contract:** Write `XAgent PayMerchantRegistry.sol`, implementing `register` / `update` logic and `MerchantProfile` storage.
2. **SDK:** Implement the `XAgent PayResolver` class in `@nexus/ucp-adapter`, taking a DID as input and outputting the JSON Document described above.
3. **Validation:** Integrate a universal signature verification method using `viem` or `ethers` in the SDK's verification function, with automatic EIP-1271 handling.
