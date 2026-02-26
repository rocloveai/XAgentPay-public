# RFC-007: Nexus Core Agentic Interface
| Metadata | Value |
| --- | --- |
| **Title** | Nexus Core Agentic Interface |
| **Version** | **1.7.0 (Interactive Escrow Edition)** |
| **Status** | **Final Specification** |
| **Protocol** | Model Context Protocol (MCP) |
| **Architecture** | Hub (PlatON) + Spoke (MPC Ingress) + KYT Firewall |
## 1. 核心设计理念 (Design Philosophy)
Nexus Core 作为一个 **MCP Server** 运行，向网络中的 Agent 提供两套标准的插件（Plugins）：
1. **Buyer Plugin:** 引导 UA 完成“询价 -> 选链 -> 支付 -> 收货”的全过程。
2. **Seller Plugin:** 帮助 MA 完成“查账 -> 发货 -> 提款”的闭环。
交互模式采用 **"Draft-then-Finalize"**：先生成草稿订单供用户选择支付方式，再锁定生成具体的 MPC 托管地址。
---
## 2. 📦 Nexus Buyer Plugin (For User Agent)
此插件赋予 UA 处理支付意图、与用户交互选择网络、并执行资金托管的能力。
### 🛠️ Tool A: `initialize_payment` (初始化/预编排)
**生命周期阶段:** **Discovery** (用户看到报价卡片时)
**功能:** 注册订单意图，计算跨链路由，返回供用户选择的支付选项。
* **Input Schema:**
```json
{
"quote_payload": {
"type": "object",
"description": "提取自商户返回的 UCP Checkout Session (`ucp.payment_handlers['urn:ucp:payment:nexus_v1'][0].config`) 的 NUPS 报价 Payload",
"required": true
}
}
```
* **Output Schema:**
```json
{
"nexus_payment_id": "NEX-UUID-001", // 草稿 ID
"status": "AWAITING_USER_SELECTION",
"expiry": 1760000000,
"fiat_value": { "amount": "530.00", "currency": "USD" },
// 核心：供 UI 渲染的选项列表
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
"chain_name": "PlatON",
"bridge_fee_usd": "0.00",
"tags": ["NATIVE_SETTLEMENT"]
}
]
}
```
### 🛠️ Tool B: `finalize_payment` (终编排/获取地址)
**生命周期阶段:** **Decision** (用户点击“支付”按钮时)
**功能:** 锁定用户的选择，分配专属的 MPC 临时托管地址，准备接收资金。
* **Input Schema:**
```json
{
"nexus_payment_id": "NEX-UUID-001",
"selected_option_id": "opt_base_usdc", // 用户选定的路径
"payer_wallet": "0xUserAddress..." // 用户连接的钱包地址 (用于后续 KYT 关联)
}
```
* **Output Schema:**
```json
{
"status": "AWAITING_DEPOSIT",
"kyc_policy": "STRICT", // 提示：入账后将进行严格 KYT
// 核心：支付指令
"payment_instruction": {
"chain_id": 8453,
"chain_name": "Base",
// MPC 托管地址 (Ephemeral Address)
"target_address": "0xNexusMPC_Temp_Addr_99",
"token_address": "0xUSDC_Base_Addr",
"amount": "530000000",
// 明确告知 UA 使用普通转账，而非合约调用
"method": "transfer",
"calldata": "0x"
},
"validity_window": "30 minutes"
}
```
### 🛠️ Tool C: `sign_release` (确认收货/释放资金)
**生命周期阶段:** **Verification** (用户确认收到服务后)
**功能:** 对订单 ID 进行 EIP-712 签名，授权将资金释放给商户。
* **Input Schema:**
```json
{
"nexus_payment_id": "NEX-UUID-001",
"rating": 5 // (可选) 评分
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
## 3. 📦 Nexus Seller Plugin (For Merchant Agent)
此插件赋予 MA 跨链无感的收款能力，MA 只需要关注 Hub Chain (PlatON) 的状态。
### 🛠️ Tool A: `verify_order_lock` (验证发货条件)
**生命周期阶段:** **Fulfillment** (MA 准备发货前)
**功能:** 查询 Hub Chain (PlatON) 上的 Escrow 合约，确认资金是否安全锁定 (LOCKED)。
**逻辑:** 只有当 Core 完成 KYT 并同步状态后，此工具才会返回 LOCKED。
* **Input Schema:**
```json
{ "merchant_order_ref": "TRIP-888" }
```
* **Output Schema:**
```json
{
"nexus_payment_id": "NEX-UUID-001",
"status": "LOCKED", // 关键信号：可以发货
"amount_settled": "530.00",
"currency": "USDC",
"hub_chain": "PlatON",
"kyt_result": "PASS" // 资金合规
}
```
### 🛠️ Tool B: `claim_funds` (提款/核销)
**生命周期阶段:** **Settlement** (收到用户 Release 签名后)
**功能:** 从 Nexus Core 拉取用户的签名，并在 PlatON 链上调用合约提取资金。
* **Input Schema:**
```json
{ "nexus_payment_id": "NEX-UUID-001" }
```
* **Output Schema:**
```json
{
"status": "CLAIMED",
"tx_hash": "0xPlatONTxHash...",
"settled_at": "2026-01-21T12:00:00Z"
}
```
---
## 4. 核心状态机 (Order State Machine)
Nexus Core 维护的单一真实状态源，通过 MCP Resource `nexus://core/orders/{id}` 暴露。
| 状态码 (Status) | 含义 | 触发动作 | UA 界面展示 |
| --- | --- | --- | --- |
| **DRAFT** | 订单意图已创建 | `initialize_payment` | 选择器视图 (Chain/Wallet) |
| **AWAITING_DEPOSIT** | MPC 地址已分配 | `finalize_payment` | 转账视图 (Target Addr) |
| **DETECTING** | 链上监测到入账 | 监听器捕获 Tx | "Verifying Transaction..." |
| **SYNCING** | KYT 通过，正在写入 Hub | KYT 引擎 | "Securing Funds..." |
| **LOCKED** | **[里程碑]** PlatON 已锁定 | Hub 合约事件 | ✅ "Payment Successful" |
| **RELEASE_SIGNED** | 用户已签署释放 | `sign_release` | "Order Completed" |
| **CLAIMED** | 商户已提款 | `claim_funds` | (历史记录) |
| **RISK_REJECTED** | KYT 失败 | KYT 引擎 | ❌ "Security Alert" (触发退款) |
---
## 5. 对 Antigravity 的实现指引
### Core Server (`nexuspay-core`)
1. **路由引擎:** 需要硬编码或配置 PlatON, Base, Ethereum 的 RPC 节点，实时拉取 Gas Price 计算 `est_gas_fee_usd`。
2. **MPC 服务:** 集成 MPC 钱包 SDK（如 Fireblocks, Coinbase WaaS 或自研 TSS），实现 `finalize_payment` 时派生子地址。
3. **KYT 钩子:** 在 `DETECTING` 状态时，阻塞流程，调用 KYT API，仅在通过后执行 `createVirtualDeposit` 到 PlatON。
### UA Integration (`@nexus/ua-kit`)
1. **Step 1:** 组件 Mount -> 调用 `initialize_payment` -> 渲染 ``。
2. **Step 2:** 用户选 Base + 连钱包 -> 点击 Pay -> 调用 `finalize_payment`。
3. **Step 3:** 拿到 `target_address` -> 调用 `wagmi.sendTransaction({ to: target_address, value: 0 })` (USDC 则调用 ERC20 transfer)。
4. **Step 4:** 轮询 Core 状态直到 `LOCKED`。
此规范完全满足了**多链交互**、**用户选择权**、**KYT 合规**以及**去信任托管**的所有需求。