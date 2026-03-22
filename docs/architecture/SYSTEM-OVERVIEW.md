# xXAgent Pay System Overview

## RFC Summary

| RFC | Title | Scope | Status |
|-----|-------|-------|--------|
| RFC-001 | Nexus DID Method Spec | 商户去中心化身份 (did:nexus) | Draft |
| RFC-002 | NUPS (Payment Standard) | Quote-to-Transaction 支付数据标准 | Final Draft |
| RFC-003 | NAIS (Agent Interface) | Agent 技能定义 + MCP 适配规范 | Draft |
| RFC-004 | NCS (Client Standard) | 商户 SDK 三种接入模式 | Draft |
| RFC-005 | Payment Core Spec | 编排引擎 + 状态机 + MCP Server (Full Vision) | Draft |
| RFC-005v3 | Payment Core MVP | **Escrow Settlement on XLayer + Group Payments** | **Draft (CURRENT)** |
| RFC-006 | Risk Gatekeeper | 混合风控 (链下AI + 链上Permit) | Draft (Future) |
| RFC-007 | Core Agentic Interface | Hub-Spoke 跨链托管 + Buyer/Seller Plugin | Final Spec (Future) |
| RFC-008 | NMSS (Merchant Skill) | skill.md 标准 + 工具角色分类 | Draft |
| RFC-009 | Webhook Standard | 支付结果回调 + HMAC + 重试策略 | **v1.1.0 (Implemented)** |
| RFC-010 | xXAgent Pay Escrow Contract | 智能合约担保支付 + 批量存款 + Group 签名 | **v2.0.0 (Deployed)** |
| NBSS | Buyer Skills Standard | User Agent 标准接入 SDK | Draft (Future) |

## Architecture: MVP (Escrow Settlement — Current)

```
+-------------------------------------------------+
|                 User Agent (UA)                  |
|     MCP Tools / REST API / Browser Checkout      |
|  Orchestrate -> Sign EIP-3009 -> Track Status    |
+------------------------+------------------------+
                         | MCP Protocol / HTTP 402
+------------------------v------------------------+
|          xXAgent Pay Core (RFC-005v3 + RFC-010)     |
|  +-------------+ +-----------+ +-------------+  |
|  |  Security   | |  Order    | |  Chain      |  |
|  |  Module     | |  State    | |  Watcher    |  |
|  |             | |  Machine  | |             |  |
|  | EIP-712     | | 12 States | | XLayer RPC  |  |
|  | DID Resolve | | 8 Group   | | Escrow Evts |  |
|  | Group Sig   | | Statuses  | | (Deposited, |  |
|  |             | | Timeout   | |  Released,  |  |
|  |             | |           | |  Refunded)  |  |
|  +-------------+ +-----------+ +-------------+  |
|  +-------------------------------------------+  |
|  |  Group Manager + Relayer                  |  |
|  |  Batch deposits + EIP-3009 + Gas relay    |  |
|  +-------------------------------------------+  |
|  +-------------------------------------------+  |
|  |  Webhook Notifier (RFC-009 v1.1)          |  |
|  |  HMAC-SHA256 + 6x Retry + Delivery Logs  |  |
|  +-------------------------------------------+  |
|  +-------------------------------------------+  |
|  |  PostgreSQL (Neon)                        |  |
|  |  payments | groups | events | merchants   |  |
|  |  webhook_delivery_logs                    |  |
|  +-------------------------------------------+  |
+------------------------+------------------------+
                         | Webhook HTTP POST
+------------------------v------------------------+
|              Merchant Agent (MA)                 |
|        flight-agent / hotel-agent                |
|   SignQuote -> ReceiveWebhook -> ConfirmFulfill  |
+------------------------+------------------------+
                         |
+------------------------v------------------------+
|             XLayer Mainnet                      |
|             chain_id: 196                        |
|  USDC (ERC-20)     xXAgent PayEscrow (UUPS Proxy)  |
|  EIP-3009          batchDeposit / release /      |
|                    refund / dispute / resolve     |
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
|              XAgent Payment Core                  |
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
|  XAgent PayMerchantRegistry (RFC-001 DID)             |
|  XAgent PayRouter + Escrow (Settlement)               |
|  XAgent PayRiskController (Permit Verification)       |
|  Hub: XLayer Mainnet | Spokes: Base, Ethereum            |
+-------------------------------------------------+
```

## Key Design Decisions

### MVP Phase (Current - RFC-005v3 + RFC-010 v2.0)
1. **Escrow Settlement**: 用户通过 EIP-3009 签名存入 Escrow 合约，商户履约后释放
2. **XLayer Mainnet**: 支持 XLayer 链 (chain_id: 196)
3. **MCP + REST + Checkout**: MCP 协议为主，同时提供 REST API 和浏览器 Checkout 页面
4. **Group/Batch Payments**: 多笔支付聚合为一组，一次链上交易
5. **Group Signature (Anti-MITM)**: EIP-712 签名验证防止交易参数篡改
6. **Webhook Notification**: HMAC-SHA256 签名 + 6 次指数退避重试 (RFC-009)
7. **Local DID Registry**: 商户身份信息存储在本地数据库
8. **EIP-712 Signing**: 商户 Quote 使用 EIP-712 TypedData 签名
9. **UUPS Proxy**: Escrow 合约使用可升级代理模式

### Full Vision (Future - RFC-005v1 + RFC-007)
1. **Quote-to-Transaction**: 商户只生成报价，Core 负责编排链上交易
2. **Hub-and-Spoke**: XLayer 为结算主链，支持多链入金 (Base, ETH)
3. **Key Separation**: 签名密钥与收款地址分离 (RFC-001)
4. **Hybrid Risk**: 链下 AI 风控 + 链上 Permit 验证 (RFC-006)
5. **Draft-then-Finalize**: 用户先选链再生成 MPC 托管地址 (RFC-007)
6. **Buyer SDK**: `@nexus/buyer-skills` 标准化 User Agent 接入

## Deployed Addresses (XLayer Mainnet, chain_id: 196)

| Contract | Address | Type |
|----------|---------|------|
| xXAgent PayEscrow (Proxy) | `0x49F9ad8F2c480F8cF9e02b30f8c634F004372cc2` | UUPS Proxy |
| xXAgent PayEscrow (Impl v4.0.0) | `0x81CF9E0d2c1ad879c24b19815Ec803015D5B2e9b` | Implementation |
| USDC | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` | ERC-20 (FiatToken) |
| Core Operator | `0xaC9d5239b597f8903DA93b9B8D92E6CfF564e989` | EOA |

## PRD Reference

| Document | Path | Description |
|----------|------|-------------|
| PRD-001 | docs/prd/PRD-001-xXAgent Pay-Core.md | xXAgent Pay Core 完整产品需求文档 |
