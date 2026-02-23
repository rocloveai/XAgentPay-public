# NexusPay System Overview

## RFC Summary

| RFC | Title | Scope |
|-----|-------|-------|
| RFC-001 | Nexus DID Method Spec | 商户去中心化身份 (did:nexus) |
| RFC-002 | NUPS (Payment Standard) | Quote-to-Transaction 支付数据标准 |
| RFC-003 | NAIS (Agent Interface) | Agent 技能定义 + MCP 适配规范 |
| RFC-004 | NCS (Client Standard) | 商户 SDK 三种接入模式 |
| RFC-005 | Payment Core Spec | 编排引擎 + 状态机 + MCP Server |
| RFC-006 | Risk Gatekeeper | 混合风控 (链下AI + 链上Permit) |
| RFC-007 | Core Agentic Interface | Hub-Spoke 跨链托管 + Buyer/Seller Plugin |
| NBSS  | Buyer Skills Standard | User Agent 标准接入 SDK |

## Architecture Layers

```
┌──────────────────────────────────────────────────┐
│                  User Agent (UA)                  │
│         @nexus/buyer-skills (NBSS)               │
│   PreparePayment → ExecutePayment → TrackOrder   │
└──────────────────────┬───────────────────────────┘
                       │ MCP Protocol
┌──────────────────────▼───────────────────────────┐
│              Nexus Payment Core                   │
│        (RFC-005 + RFC-007 State Machine)          │
│  initialize → finalize → detect → sync → lock    │
│                       │                           │
│            ┌──────────▼──────────┐                │
│            │  Risk Gatekeeper    │                │
│            │  (RFC-006)          │                │
│            │  KYT + RiskPermit   │                │
│            └─────────────────────┘                │
└──────────────────────┬───────────────────────────┘
                       │ MCP Protocol
┌──────────────────────▼───────────────────────────┐
│             Merchant Agent (MA)                   │
│         @nexus/seller-sdk (RFC-004)               │
│     SignQuote → VerifyReceipt → ClaimFunds        │
│                       │                           │
│            ┌──────────▼──────────┐                │
│            │  External MCP       │                │
│            │  (商品/报价数据源)    │                │
│            └─────────────────────┘                │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│              On-Chain Layer                       │
│  NexusMerchantRegistry (RFC-001 DID)              │
│  NexusRouter + Escrow (Settlement)                │
│  NexusRiskController (Permit Verification)        │
│  Hub: PlatON | Spokes: Base, Ethereum             │
└──────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **MCP-First**: 所有组件间通过 MCP 协议通信，非 REST API
2. **Quote-to-Transaction**: 商户只生成报价，Core 负责编排链上交易
3. **Hub-and-Spoke**: PlatON 为结算主链，支持多链入金 (Base, ETH)
4. **Key Separation**: 签名密钥与收款地址分离 (RFC-001)
5. **Hybrid Risk**: 链下 AI 风控 + 链上 Permit 验证 (RFC-006)
6. **Draft-then-Finalize**: 用户先选链再生成 MPC 托管地址 (RFC-007)
