# NexusPay System Overview

## RFC Summary

| RFC | Title | Scope | Status |
|-----|-------|-------|--------|
| RFC-001 | Nexus DID Method Spec | 商户去中心化身份 (did:nexus) | Draft |
| RFC-002 | NUPS (Payment Standard) | Quote-to-Transaction 支付数据标准 | Final Draft |
| RFC-003 | NAIS (Agent Interface) | Agent 技能定义 + MCP 适配规范 | Draft |
| RFC-004 | NCS (Client Standard) | 商户 SDK 三种接入模式 | Draft |
| RFC-005 | Payment Core Spec | 编排引擎 + 状态机 + MCP Server (Full Vision) | Draft |
| RFC-005v2 | Payment Core MVP | Direct Settlement on PlatON + 4 模块设计 | **Draft (NEW)** |
| RFC-006 | Risk Gatekeeper | 混合风控 (链下AI + 链上Permit) | Draft |
| RFC-007 | Core Agentic Interface | Hub-Spoke 跨链托管 + Buyer/Seller Plugin | Final Spec |
| RFC-008 | NMSS (Merchant Skill) | skill.md 标准 + 工具角色分类 | Draft |
| RFC-009 | Webhook Standard | 支付结果回调 + HMAC + 重试策略 | **Draft (NEW)** |
| NBSS | Buyer Skills Standard | User Agent 标准接入 SDK | Draft |

## Architecture: MVP (Direct Settlement)

```
+-------------------------------------------------+
|                 User Agent (UA)                  |
|          @nexus/buyer-skills (NBSS)              |
|  PreparePayment -> ExecutePayment -> TrackOrder  |
+------------------------+------------------------+
                         | MCP Protocol
+------------------------v------------------------+
|              NexusPay Core (RFC-005v2)           |
|  +-------------+ +-----------+ +-------------+  |
|  |  Security   | |  Order    | |  Chain      |  |
|  |  Module     | |  State    | |  Watcher    |  |
|  |             | |  Machine  | |             |  |
|  | EIP-712     | | 6 States  | | PlatON RPC  |  |
|  | DID Resolve | | Timeout   | | USDC Events |  |
|  | Nonce Guard | | Events    | | Tx Tracker  |  |
|  +-------------+ +-----------+ +-------------+  |
|  +-------------------------------------------+  |
|  |  Webhook Notifier (RFC-009)               |  |
|  |  HMAC Signed + Retry + ISO 20022 Data     |  |
|  +-------------------------------------------+  |
|  +-------------------------------------------+  |
|  |  PostgreSQL (Neon)                        |  |
|  |  payments | events | merchants | webhooks |  |
|  +-------------------------------------------+  |
+------------------------+------------------------+
                         | Webhook HTTP POST
+------------------------v------------------------+
|              Merchant Agent (MA)                 |
|        flight-agent / hotel-agent                |
|   SignQuote -> ReceiveWebhook -> Fulfill         |
+------------------------+------------------------+
                         |
+------------------------v------------------------+
|             PlatON Blockchain                    |
|             chain_id: 210425                     |
|        USDC (ERC-20) Direct Transfer             |
+-------------------------------------------------+
```

## Architecture: Full Vision (Future)

```
+-------------------------------------------------+
|                 User Agent (UA)                  |
|          @nexus/buyer-skills (NBSS)              |
+------------------------+------------------------+
                         | MCP Protocol
+------------------------v------------------------+
|              Nexus Payment Core                  |
|        (RFC-005 + RFC-007 State Machine)         |
|  initialize -> finalize -> detect -> sync -> lock|
|                         |                        |
|             +-----------v-----------+            |
|             |  Risk Gatekeeper      |            |
|             |  (RFC-006)            |            |
|             |  KYT + RiskPermit     |            |
|             +-----------------------+            |
+------------------------+------------------------+
                         | MCP Protocol
+------------------------v------------------------+
|              Merchant Agent (MA)                 |
|         @nexus/seller-sdk (RFC-004)              |
|     SignQuote -> VerifyReceipt -> ClaimFunds      |
+------------------------+------------------------+
                         |
+------------------------v------------------------+
|              On-Chain Layer                      |
|  NexusMerchantRegistry (RFC-001 DID)             |
|  NexusRouter + Escrow (Settlement)               |
|  NexusRiskController (Permit Verification)       |
|  Hub: PlatON | Spokes: Base, Ethereum            |
+-------------------------------------------------+
```

## Key Design Decisions

### MVP Phase (Current - RFC-005v2)
1. **Direct Settlement**: 用户直接 USDC transfer 到商户地址，Core 不触碰资金
2. **PlatON Only**: 仅支持 PlatON 链 (chain_id: 210425)
3. **MCP-First**: 所有组件间通过 MCP 协议通信
4. **Webhook Notification**: 支付结果通过 HTTP POST + HMAC 回调商户 (RFC-009)
5. **Local DID Registry**: 商户身份信息存储在本地数据库
6. **EIP-712 Signing**: 商户 Quote 使用 EIP-712 TypedData 签名
7. **ISO 20022 Compliance**: Webhook 携带 ISO 标准元数据供 ERP 对账

### Full Vision (Future - RFC-005v1 + RFC-007)
1. **Quote-to-Transaction**: 商户只生成报价，Core 负责编排链上交易
2. **Hub-and-Spoke**: PlatON 为结算主链，支持多链入金 (Base, ETH)
3. **Key Separation**: 签名密钥与收款地址分离 (RFC-001)
4. **Hybrid Risk**: 链下 AI 风控 + 链上 Permit 验证 (RFC-006)
5. **Draft-then-Finalize**: 用户先选链再生成 MPC 托管地址 (RFC-007)

## PRD Reference

| Document | Path | Description |
|----------|------|-------------|
| PRD-001 | docs/prd/PRD-001-NexusPay-Core.md | NexusPay Core 完整产品需求文档 |
