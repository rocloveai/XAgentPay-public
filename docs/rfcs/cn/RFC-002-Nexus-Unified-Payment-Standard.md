# RFC-002: XAgent Pay UCP Payment Standard (NUPS)
| Metadata | Value |
| --- | --- |
| **Title** | XAgent Pay UCP Payment Standard (NUPS) |
| **Version** | 1.5.0 (Enterprise Edition) |
| **Status** | Final Draft |
| **Author** | Cipher & XAgent Pay Architect Team |
| **Integrations** | Google UCP, EVM Chains, ISO 20022 Financial Rails |
## 1. Architecture Overview (架构总览)
本协议采用 **"Quote-to-Transaction" (报价-交易)** 模型。数据流分为两个严格阶段，确保商户接入的轻量化与结算逻辑的严谨性。
1. **Quote Phase (商户侧):** 商户生成包含业务单号和 ISO 元数据的“报价”。**商户不生成 XAgent Pay ID，也不生成链上 Calldata。**
2. **Orchestration Phase (核心侧):** XAgent Pay Core 接收报价，分配 `nexus_payment_id`，解析 DID 路由，生成符合 ISO 标准的结算交易。
3. **Settlement Phase (链上):** 智能合约执行原子化分账，并抛出兼容 ISO 20022 语义的 Event。
---
## 2. Phase I: Merchant Quote Payload (商户报价载荷)
这是 Merchant Agent 通过 UCP 返回的标准 JSON。
* **生成工具:** `@nexus/ucp-adapter` SDK。
* **设计目标:** 极简接入，同时携带金融机构所需的 ISO 元数据。
### 2.1 JSON Schema
```json
{
"payment_methods": [
{
"type": "urn:ucp:payment:nexus_v1",
"display_name": "xXAgent Pay (USDC)",
"payload": {
// --- A. 商业意图 (Business Intent) ---
"merchant_did": "did:xagent:20250407:trip_com",
"merchant_order_ref": "TRIP-2026-888", // [关键] 商户ERP中的唯一单号
"amount": "530000000", // 整数 (6位精度)
"currency": "USDC", // XAgent Pay 内部资产标识
"chain_id": 20250407,
"expiry": 1768809600,
// --- B. 业务上下文 (Context - User View) ---
// 用于 User Agent 向用户展示明细
"context": {
"summary": "Flight SQ638 (SIN-NRT)",
"ucp_offer_id": "OFFER-XYZ-999",
"line_items": [
{ "name": "Flight Ticket", "qty": 1, "amount": "500000000" },
{ "name": "Tax", "qty": 1, "amount": "30000000" }
]
},
// --- C. ISO 金融元数据 (ISO Metadata - Bank View) --- [OPTIONAL]
// 用于银行系统/ERP 自动对账的语义映射
// MVP 阶段此字段为可选，未来企业版强制要求
"iso_metadata": {  // OPTIONAL in MVP
// 价值锚定层 (Value Layer): 映射到 ISO 4217 (如 USD)
// 目的: 让 SAP/Oracle ERP 能识别这是"美元"业务
"account_currency": "USD",
// 结算资产层 (Settlement Layer): 映射到 ISO 24165 (DTI)
// 目的: 明确具体的数字资产 ID
"asset_identifier": {
"scheme": "ISO24165",
"dti_code": "4H95J0R2X", // USDC DTI Code
"contract": "0xA0b8..."
},
// 债权人信息 (ISO 20022 )
"creditor": {
"name": "Trip.com International",
"bic": "TRIPCNBJ" // 如果有 SWIFT BIC 码
}
},
// --- D. 安全凭证 ---
// 签名覆盖以上所有字段 (含 context hash 和 iso hash)
"signature": "0xMerchantSig..."
}
}
]
}
```
---
## 3. Phase II: Settlement Manifest (结算清单)
当 User Agent 执行聚合支付 (`nexus/orchestrateBatch`) 时，XAgent Pay Core 返回此对象。这是 User Agent 最终签名的内容。
### 3.1 JSON Schema
```json
{
"type": "urn:ucp:payment:nexus_batch_v1",
"batch_id": "BATCH-ROOT-20260120-001",
"total_amount": "630000000",
// --- A. ID 映射与聚合清单 (The Manifest) ---
// 用于 UI 渲染和用户核对
"manifest": [
{
"index": 0,
"merchant_name": "Trip.com",
// [ID 桥接] XAgent Pay 资金号 <---> 商户业务号
"nexus_payment_id": "NEX-UUID-001", // [NEW] 核心生成的端到端ID
"merchant_order_ref": "TRIP-2026-888", // [OLD] 来自商户Quote
"amount": "530000000",
"summary": "Flight SQ638",
"iso_currency": "USD" // UI显示: $530.00 USD (USDC Settlement)
},
{
"index": 1,
"merchant_name": "XAgent Pay OTC",
"nexus_payment_id": "NEX-UUID-002",
"merchant_order_ref": "OTC-BTC-05",
"amount": "100000000",
"summary": "0.03 ETH"
}
],
// --- B. 链上交互数据 (Transaction Data) ---
"tx_data": {
"to": "0xXAgent PayRouter...",
"chain_id": 20250407,
"data": "0x...", // Encoded batchPay
"value": "0"
}
}
```
---
## 4. ISO 20022 Data Mapping (数据映射标准)
为了兼容金融机构系统，我们将 JSON 字段映射到 ISO 20022 XML 标签 (pacs.008 / pain.001)。
| XAgent Pay JSON Field | ISO 20022 XML Tag | 业务含义 |
| --- | --- | --- |
| `nexus_payment_id` | `` | **端到端标识符**。贯穿全链路的唯一流水号。 |
| `merchant_order_ref` | `//` | **汇款附言**。商户 ERP 用于自动销账的单号。 |
| `amount` (converted) | `` | **入账金额**。使用 `iso_metadata.account_currency`。 |
| `iso_metadata.dti` | `/` | **备注**。如 "Settled via DTI:4H95J0R2X"。 |
| `merchant_did` | `///` | **债权人 ID**。 |
---
## 5. Reconciliation & Events (对账与事件)
智能合约在执行成功后，**必须**抛出符合 ISO 语义的 Event。
### 5.1 Solidity Event Definition
```solidity
event PaymentProcessed(
// 索引字段 (用于快速过滤)
string indexed merchant_did,
string indexed nexus_payment_id, // 对应 ISO
// 数据字段 (用于业务处理)
string merchant_order_ref, // 对应 ISO
uint256 amount,
address token_address, // 对应 DTI/Contract
string iso_currency_code // e.g. "USD"
);
```
### 5.2 商户/银行对账逻辑
1. **监听:** 监听 `PaymentProcessed`。
2. **转换:** (可选) 将 Event 数据转换为 ISO 20022 XML 格式导入 ERP。
3. **匹配:** * 匹配 `merchant_did`。
* 使用 `merchant_order_ref` 在 ERP 中查找应收账款。
* 核对 `amount`。
4. **核销:** 标记订单为 PAID。
---
## 6. Security Specification (安全规范)
### 6.1 EIP-712 TypedData
商户 SDK 必须对 Quote 进行签名。
```javascript
const types = {
XAgent PayQuote: [
{ name: 'merchant_did', type: 'string' },
{ name: 'merchant_order_ref', type: 'string' },
{ name: 'amount', type: 'uint256' },
{ name: 'currency', type: 'string' },
{ name: 'expiry', type: 'uint256' },
{ name: 'context_hash', type: 'bytes32' }, // Hash(context)
// iso_hash is OPTIONAL — omit when iso_metadata is not provided (MVP)
// { name: 'iso_hash', type: 'bytes32' } // Hash(iso_metadata) [Enterprise only]
]
};
```
### 6.2 DID Resolution
XAgent Pay Core **严禁**信任前端传入的收款地址。必须使用 `merchant_did` 调用链上 Registry 合约（或可信缓存）获取真实的 `payment_address`。
---