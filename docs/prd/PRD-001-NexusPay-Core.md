# PRD-001: NexusPay Core 支付系统产品需求文档

| 元数据 | 内容 |
| --- | --- |
| **产品名称** | NexusPay Core |
| **版本** | 1.0.0 (MVP) |
| **状态** | Draft |
| **作者** | Cipher & Nexus Product Team |
| **创建日期** | 2026-02-24 |
| **目标链** | PlatON 主网 (chain_id: 210425) |
| **支付币种** | USDC (ERC-20) |
| **依赖 RFC** | RFC-001 (DID), RFC-002 (NUPS), RFC-003 (NAIS), RFC-005 (Payment Core), RFC-006 (Risk Gatekeeper) |

---

## 一、概述

### 1.1 项目背景

NexusPay 已有 Merchant Agent Demo（flight-agent、hotel-agent），实现了基于 MCP 协议的 AI Agent 商品搜索与报价生成流程。然而，从 "商户生成报价" 到 "链上完成支付" 之间缺少核心的支付编排层。

当前存在以下关键缺口：

| 缺口 | 当前状态 | 目标状态 |
| --- | --- | --- |
| Quote 签名 | 硬编码 `PENDING_NEXUS_CORE` | EIP-712 TypedData 真实签名 |
| 支付路由 | 无链上交互 | PlatON 链上 USDC 直接转账 |
| 状态管理 | 仅 UNPAID/PAID/EXPIRED | 完整 6 态状态机 |
| 支付确认 | 无链上事件监听 | 自动监听 + Webhook 回调 |
| 安全机制 | 无验证 | 签名验证 + 防重放 + 权限控制 |
| 会计标准 | 无 | ISO 20022 映射 + 对账事件 |

### 1.2 设计目标

1. **构建 NexusPay Core 编排服务**：连接 User Agent 和 Merchant Agent，完成支付闭环
2. **PlatON 链上直付模式**：用户通过 ERC-20 transfer 将 USDC 直接支付到商户地址
3. **严格模块化设计**：安全、支付合约、订单逻辑、Webhook 通知四大模块独立解耦
4. **符合国际会计标准**：ISO 20022 数据映射、ISO 4217 货币编码、ISO 24165 数字资产标识

### 1.3 设计原则

- **Direct Settlement（直接结算）**：不做资金托管，Core 不触碰资金
- **Event-Driven（事件驱动）**：状态变更基于链上事件，非人工干预
- **MCP-First（智能体优先）**：所有能力通过 MCP 协议暴露
- **Fail-Safe（安全优先）**：签名无效或风控异常时拒绝交易
- **Immutability（不可变数据）**：所有状态变更生成新记录，不修改历史

---

## 二、系统架构

### 2.1 整体架构图

```
┌───────────────────────────────────────────────────────────────────┐
│                        User Agent (UA)                            │
│                   @nexus/buyer-skills (NBSS)                      │
│         PreparePayment → ExecutePayment → TrackOrder              │
└────────────────────────┬──────────────────────────────────────────┘
                         │ MCP Protocol (Stdio/SSE)
┌────────────────────────▼──────────────────────────────────────────┐
│                     NexusPay Core Service                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐ │
│  │   Security   │ │  Order State │ │  Chain       │ │  Webhook  │ │
│  │   Module     │ │  Machine     │ │  Watcher     │ │  Notifier │ │
│  │             │ │              │ │              │ │           │ │
│  │ - EIP-712   │ │ - 6 States   │ │ - Event      │ │ - HTTP    │ │
│  │   Verify    │ │ - Transition │ │   Listener   │ │   POST    │ │
│  │ - Nonce     │ │ - Timeout    │ │ - Tx         │ │ - Retry   │ │
│  │   Guard     │ │   Handler    │ │   Tracker    │ │ - HMAC    │ │
│  │ - DID       │ │              │ │              │ │   Signed  │ │
│  │   Resolver  │ │              │ │              │ │           │ │
│  └─────────────┘ └──────────────┘ └──────────────┘ └───────────┘ │
│                         │                                         │
│             ┌───────────▼───────────┐                             │
│             │   PostgreSQL (Neon)   │                              │
│             │   - payments          │                              │
│             │   - payment_events    │                              │
│             │   - merchant_registry │                              │
│             │   - webhook_logs      │                              │
│             └───────────────────────┘                              │
└────────────────────────┬──────────────────────────────────────────┘
                         │ MCP Protocol / Webhook HTTP
┌────────────────────────▼──────────────────────────────────────────┐
│                    Merchant Agent (MA)                             │
│          flight-agent / hotel-agent / 其他                         │
│     SignQuote → ReceiveWebhook → ConfirmFulfillment               │
└────────────────────────┬──────────────────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────────────────┐
│                    PlatON Blockchain                               │
│                    chain_id: 210425                                │
│         USDC (ERC-20) Direct Transfer                             │
│         PaymentProcessed Event Emission                           │
└───────────────────────────────────────────────────────────────────┘
```

### 2.2 模块职责矩阵

| 模块 | 核心职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| **Security Module** | 验签、防重放、DID 解析、权限控制 | Quote + Signature | Verified/Rejected |
| **Order State Machine** | 订单生命周期管理、状态转换、超时处理 | Payment Events | State Updates |
| **Chain Watcher** | 链上事件监听、交易追踪、USDC 转账确认 | PlatON RPC | Transfer Events |
| **Webhook Notifier** | 支付结果回调、重试策略、HMAC 签名 | State Changes | HTTP POST |

---

## 三、功能模块详细设计

### 模块 A: 安全模块 (Security Module)

#### 功能名称
NexusPay Security Module

#### 需求描述
提供端到端的交易安全保障，包括商户报价签名验证、防重放攻击、DID 身份解析与权限访问控制。确保每笔支付请求都经过严格的身份与数据完整性校验。

#### 子功能 A.1: EIP-712 签名验证

**用户故事：**
作为 NexusPay Core，当收到 UA 提交的商户 Quote 时，我需要验证该 Quote 确实由合法商户签发且未被篡改，以保障支付路由到真实债权人。

**实现逻辑：**

1. 接收 UA 提交的 NUPS Quote Payload（含 signature 字段）
2. 从 quote 中提取 `merchant_did`，调用 DID Resolver 获取 signer 地址
3. 构造 EIP-712 TypedData 结构：

```typescript
// EIP-712 Domain
const NEXUS_DOMAIN = {
  name: "NexusPay",
  version: "1",
  chainId: 210425, // PlatON mainnet
  verifyingContract: "0xNexusCoreContractAddress..."
} as const;

// EIP-712 Type Definition
const NEXUS_QUOTE_TYPES = {
  NexusQuote: [
    { name: "merchant_did", type: "string" },
    { name: "merchant_order_ref", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "currency", type: "string" },
    { name: "chain_id", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "context_hash", type: "bytes32" },
  ],
} as const;
```

4. 使用 `viem` 的 `verifyTypedData` 恢复签名者地址
5. 比对恢复地址与 DID Document 中的 signer 地址
6. 支持 EOA (ecrecover) 与合约钱包 (EIP-1271 isValidSignature)

**功能细节：**

| 项目 | 说明 |
| --- | --- |
| 输入 | NUPS Quote Payload (含 signature) |
| 输出 | `{ valid: boolean, signer: Address, error?: string }` |
| 边界条件 | 签名为空 -> 拒绝；merchant_did 未注册 -> 拒绝；签名恢复地址不匹配 -> 拒绝 |
| 性能要求 | 验签延迟 < 50ms（纯计算，无网络） |

#### 子功能 A.2: 防重放保护 (Nonce Guard)

**用户故事：**
作为 NexusPay Core，我需要确保同一份 Quote 不会被重复用于发起多笔支付，防止重放攻击造成资金损失。

**实现逻辑：**

1. 每个 payment 创建时生成唯一 `nexus_payment_id` (UUID v7，时间序)
2. 使用 `quote_hash` (EIP-712 structHash) 作为幂等键
3. 检查 `quote_hash` 是否已存在于 `payments` 表
4. 检查 `expiry` 是否已过期（`block.timestamp > expiry` -> 拒绝）
5. 同一 `merchant_order_ref` 只允许一个 active payment（状态非 FAILED/EXPIRED）

**数据结构：**

```sql
-- 防重放索引
CREATE UNIQUE INDEX idx_payments_quote_hash
  ON payments (quote_hash)
  WHERE status NOT IN ('FAILED', 'EXPIRED');
```

#### 子功能 A.3: DID 解析器 (DID Resolver)

**用户故事：**
作为 NexusPay Core，我需要将 `did:nexus:210425:demo_flight` 解析为链上注册的商户信息（signer 地址、payment 地址），确保资金流向经过验证的真实收款方。

**实现逻辑（MVP 阶段）：**

MVP 阶段尚未部署 NexusMerchantRegistry 合约，采用本地注册表：

```typescript
interface MerchantRecord {
  readonly did: string;
  readonly name: string;
  readonly signer: Address;        // 签名密钥（热钱包）
  readonly paymentAddress: Address; // 收款地址（可以是冷钱包/多签）
  readonly webhookUrl: string;     // Webhook 回调 URL
  readonly isActive: boolean;
}
```

后续升级路径：连接 PlatON 链上 `NexusMerchantRegistry` 合约。

#### 子功能 A.4: 权限控制 (Access Control)

**实现逻辑：**

| 操作 | 权限要求 |
| --- | --- |
| `orchestrate_payment` | 任何 UA 可调用，需提供有效 Quote |
| `get_payment_status` | 支付参与方（payer 或 merchant）可查询 |
| `confirm_fulfillment` | 仅 merchant signer 可调用，需签名 |
| 管理类操作 | 需 Core admin 密钥签名 |

---

### 模块 B: 支付合约模块 (Payment Contract Module)

#### 功能名称
PlatON USDC Direct Payment

#### 需求描述
在 PlatON 主网上实现 USDC (ERC-20) 的直接转账支付。MVP 阶段采用用户直接 `transfer` USDC 到商户 paymentAddress 的模式，不经过中间合约。

#### 子功能 B.1: 支付指令生成 (Payment Instruction Builder)

**用户故事：**
作为 User Agent，当我获得经过 Core 验证的 Quote 后，我需要收到一份清晰的链上交易指令，告诉我向哪个地址转多少 USDC。

**实现逻辑：**

```typescript
interface PaymentInstruction {
  // 链信息
  readonly chain_id: 210425;
  readonly chain_name: "PlatON";

  // 转账目标
  readonly target_address: Address;  // 商户 paymentAddress (从 DID 解析)
  readonly token_address: Address;   // PlatON 上的 USDC 合约地址
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;

  // 金额
  readonly amount_uint256: string;   // e.g. "530000000" (530 USDC)
  readonly amount_display: string;   // e.g. "530.00"

  // 交易数据（ERC-20 transfer calldata）
  readonly method: "erc20_transfer";
  readonly tx_data: {
    readonly to: Address;      // USDC 合约地址
    readonly data: Hex;        // transfer(address,uint256) calldata
    readonly value: "0";       // 不发送原生代币
    readonly gas_limit: string; // 建议 gas limit
  };

  // 引用
  readonly nexus_payment_id: string;
  readonly memo: string;  // 商户 order_ref，写入 tx memo（可选）
}
```

生成流程：
1. 从 DID 解析商户 `paymentAddress`
2. 编码 ERC-20 `transfer(paymentAddress, amount)` 的 calldata
3. 估算 gas limit
4. 组装 PaymentInstruction 返回给 UA

**功能细节：**

| 项目 | 说明 |
| --- | --- |
| PlatON RPC | `https://openapi2.platon.network/rpc` (主网) |
| USDC 合约地址 | 待确认（PlatON 主网 USDC 地址） |
| Gas 估算 | 调用 `eth_estimateGas` + 20% buffer |
| 金额精度 | 6 位小数 (USDC standard) |

#### 子功能 B.2: 交易追踪 (Transaction Tracker)

**用户故事：**
作为 NexusPay Core，当 UA 广播了链上交易后，我需要监听该交易的确认状态，并在确认后更新订单状态。

**实现逻辑：**

1. UA 广播交易后，将 `tx_hash` 提交给 Core
2. Core 通过 PlatON RPC 轮询交易 receipt
3. 确认条件：
   - `receipt.status === 1` (交易成功)
   - ERC-20 Transfer event log 存在
   - Transfer `to` 地址匹配商户 paymentAddress
   - Transfer `value` 匹配 payment amount
4. 确认后触发状态转换：`BROADCASTED -> SETTLED`

```typescript
interface TransferEvent {
  readonly token: Address;
  readonly from: Address;   // payer
  readonly to: Address;     // merchant paymentAddress
  readonly amount: bigint;
  readonly txHash: Hex;
  readonly blockNumber: number;
  readonly blockTimestamp: number;
}
```

#### 子功能 B.3: 链上事件监听 (Chain Watcher)

**用户故事：**
作为 NexusPay Core，我需要持续监听 PlatON 链上的 USDC Transfer 事件，以便即使 UA 没有主动报告 tx_hash，也能通过链上事件匹配发现付款。

**实现逻辑：**

```
Chain Watcher 运行模式：
1. 主动模式：UA 提交 tx_hash -> 直接查询该 tx
2. 被动模式：轮询 USDC Transfer events -> 匹配 pending payments

轮询策略：
- 每 3 秒查询最新区块的 USDC Transfer logs
- 过滤条件：to IN (已注册商户地址集合)
- 匹配逻辑：to + amount -> 找到对应 payment
- PlatON 出块时间约 1 秒，3 秒间隔足够及时
```

**ISO 20022 事件映射：**

当检测到支付成功时，生成符合 ISO 20022 语义的事件记录：

| Nexus 字段 | ISO 20022 标签 | 说明 |
| --- | --- | --- |
| `nexus_payment_id` | `<EndToEndId>` | 端到端唯一标识 |
| `merchant_order_ref` | `<RmtInf><Ustrd>` | 商户 ERP 销账单号 |
| `amount_display` | `<InstdAmt>` | 入账金额 |
| `iso_currency "USD"` | `<InstdAmt Ccy>` | ISO 4217 货币代码 |
| `usdc_dti "4H95J0R2X"` | `<AddtlRmtInf>` | ISO 24165 数字资产标识 |
| `merchant_did` | `<CdtrId>` | 债权人标识 |

---

### 模块 C: 支付订单逻辑模块 (Order State Machine)

#### 功能名称
Payment Order Lifecycle Manager

#### 需求描述
管理支付订单的完整生命周期，通过有限状态机确保状态转换的严格性与可追溯性。每次状态变更都生成不可变的事件记录。

#### 子功能 C.1: 状态机定义

**状态图：**

```
                    ┌───────────────┐
                    │    CREATED    │ ← orchestrate_payment 成功
                    └───────┬───────┘
                            │ UA 获取 PaymentInstruction
                    ┌───────▼───────┐
                    │  AWAITING_TX  │ ← finalize (UA 准备支付)
                    └───┬───────┬───┘
                        │       │ 超时 30 min
                ┌───────▼──┐  ┌─▼────────┐
                │BROADCASTED│  │  EXPIRED  │
                └───────┬───┘  └──────────┘
                        │ 链上确认
                ┌───────▼───────┐
                │    SETTLED    │ ← Transfer event 确认
                └───────┬───────┘
                        │ 商户确认履约
                ┌───────▼───────┐
                │   COMPLETED   │ ← confirm_fulfillment
                └───────────────┘

         异常路径：
         AWAITING_TX / BROADCASTED → TX_FAILED (链上 revert)
         任意活跃状态 → RISK_REJECTED (风控拦截)
```

**状态转换规则：**

| 当前状态 | 目标状态 | 触发条件 | 执行动作 |
| --- | --- | --- | --- |
| (无) | CREATED | Core 收到有效 Quote 并验签通过 | 生成 nexus_payment_id，存储 payment |
| CREATED | AWAITING_TX | UA 调用 finalize，获取 PaymentInstruction | 生成链上交易数据，启动超时计时器 |
| AWAITING_TX | BROADCASTED | UA 提交 tx_hash | 开始链上交易追踪 |
| AWAITING_TX | EXPIRED | 超过 30 分钟未提交 tx_hash | 释放资源，通知商户 |
| BROADCASTED | SETTLED | 链上交易确认且金额/地址匹配 | 记录结算信息，通知商户 |
| BROADCASTED | TX_FAILED | 链上交易 revert | 记录失败原因，通知商户 |
| SETTLED | COMPLETED | 商户调用 confirm_fulfillment | 标记履约完成 |
| 任意活跃状态 | RISK_REJECTED | 风控拦截 | 记录拒绝原因 |

#### 子功能 C.2: 超时处理

**实现逻辑：**

| 超时场景 | 超时时间 | 处理方式 |
| --- | --- | --- |
| Quote 过期 | quote.expiry 时间戳 | CREATED -> EXPIRED |
| 等待交易 | 30 分钟（从 AWAITING_TX 开始） | AWAITING_TX -> EXPIRED |
| 交易确认超时 | 10 分钟（从 BROADCASTED 开始） | 告警，人工介入 |
| 商户履约超时 | 24 小时（从 SETTLED 开始） | 告警，纠纷流程 |

超时检测采用定时任务，每 30 秒扫描一次活跃订单。

#### 子功能 C.3: 事件溯源 (Event Sourcing)

每次状态变更都写入 `payment_events` 表，不可变。

```typescript
interface PaymentEvent {
  readonly event_id: string;          // UUID v7
  readonly nexus_payment_id: string;  // 外键
  readonly event_type: PaymentEventType;
  readonly from_status: PaymentStatus | null;
  readonly to_status: PaymentStatus;
  readonly metadata: Record<string, unknown>;  // 事件附加数据
  readonly created_at: string;        // ISO 8601
}

type PaymentEventType =
  | "PAYMENT_CREATED"
  | "PAYMENT_FINALIZED"
  | "TX_SUBMITTED"
  | "TX_CONFIRMED"
  | "TX_FAILED"
  | "PAYMENT_EXPIRED"
  | "FULFILLMENT_CONFIRMED"
  | "RISK_REJECTED"
  | "WEBHOOK_SENT"
  | "WEBHOOK_FAILED";
```

#### 子功能 C.4: 数据库 Schema

```sql
-- payments: 支付订单主表
CREATE TABLE IF NOT EXISTS payments (
  nexus_payment_id    TEXT PRIMARY KEY,      -- UUID v7
  quote_hash          TEXT NOT NULL,          -- EIP-712 structHash (hex)
  merchant_did        TEXT NOT NULL,
  merchant_order_ref  TEXT NOT NULL,
  payer_wallet        TEXT,                   -- 0x... EVM 地址
  payment_address     TEXT NOT NULL,          -- 商户收款地址
  amount              TEXT NOT NULL,          -- uint256 字符串
  amount_display      TEXT NOT NULL,          -- 人类可读 (e.g. "530.00")
  currency            TEXT NOT NULL DEFAULT 'USDC',
  chain_id            INTEGER NOT NULL DEFAULT 210425,
  status              TEXT NOT NULL DEFAULT 'CREATED',
  tx_hash             TEXT,                   -- 链上交易 hash
  block_number        BIGINT,
  block_timestamp     TIMESTAMPTZ,
  quote_payload       JSONB NOT NULL,         -- 完整 NUPS payload
  iso_metadata        JSONB,                  -- ISO 20022 映射数据
  expires_at          TIMESTAMPTZ NOT NULL,
  settled_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_status CHECK (status IN (
    'CREATED', 'AWAITING_TX', 'BROADCASTED',
    'SETTLED', 'COMPLETED', 'EXPIRED',
    'TX_FAILED', 'RISK_REJECTED'
  ))
);

CREATE UNIQUE INDEX idx_payments_quote_hash_active
  ON payments (quote_hash) WHERE status NOT IN ('EXPIRED', 'TX_FAILED');
CREATE INDEX idx_payments_merchant ON payments (merchant_did);
CREATE INDEX idx_payments_status ON payments (status);
CREATE INDEX idx_payments_payer ON payments (payer_wallet);
CREATE INDEX idx_payments_expires ON payments (expires_at) WHERE status IN ('CREATED', 'AWAITING_TX');

-- payment_events: 事件溯源表（append-only）
CREATE TABLE IF NOT EXISTS payment_events (
  event_id            TEXT PRIMARY KEY,       -- UUID v7
  nexus_payment_id    TEXT NOT NULL REFERENCES payments(nexus_payment_id),
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_payment ON payment_events (nexus_payment_id);
CREATE INDEX idx_events_type ON payment_events (event_type);

-- merchant_registry: 商户注册表（MVP 本地版）
CREATE TABLE IF NOT EXISTS merchant_registry (
  merchant_did        TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  signer_address      TEXT NOT NULL,          -- 签名密钥地址
  payment_address     TEXT NOT NULL,          -- 收款地址
  webhook_url         TEXT,                   -- 回调 URL
  webhook_secret      TEXT,                   -- HMAC 密钥
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- webhook_delivery_logs: Webhook 投递日志
CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  log_id              TEXT PRIMARY KEY,       -- UUID v7
  nexus_payment_id    TEXT NOT NULL REFERENCES payments(nexus_payment_id),
  merchant_did        TEXT NOT NULL,
  webhook_url         TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  request_body        JSONB NOT NULL,
  response_status     INTEGER,
  response_body       TEXT,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  next_retry_at       TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_payment ON webhook_delivery_logs (nexus_payment_id);
CREATE INDEX idx_webhook_retry ON webhook_delivery_logs (next_retry_at)
  WHERE delivered_at IS NULL AND attempt_number < 5;
```

---

### 模块 D: Webhook 通知模块 (Webhook Notifier)

#### 功能名称
Payment Webhook Notification Service

#### 需求描述
当支付状态发生关键变更（SETTLED、TX_FAILED、EXPIRED）时，通过 HTTP POST 回调通知 Merchant Agent，确保商户及时获知支付结果并执行后续业务逻辑（如出票、退款）。

#### 子功能 D.1: Webhook 事件类型

| 事件类型 | 触发时机 | 商户预期行为 |
| --- | --- | --- |
| `payment.settled` | 链上交易确认 | 发货/出票/提供服务 |
| `payment.expired` | 支付超时未完成 | 释放库存、取消预订 |
| `payment.failed` | 链上交易失败 | 释放库存、通知用户重试 |
| `payment.created` | 支付订单创建 | 可选：更新内部状态 |

#### 子功能 D.2: Webhook Payload 格式

```typescript
interface WebhookPayload {
  // 事件元数据
  readonly event_id: string;           // 幂等键
  readonly event_type: WebhookEventType;
  readonly created_at: string;         // ISO 8601

  // 支付数据
  readonly data: {
    readonly nexus_payment_id: string;
    readonly merchant_order_ref: string;
    readonly merchant_did: string;
    readonly status: PaymentStatus;
    readonly amount: string;           // uint256
    readonly amount_display: string;   // e.g. "530.00"
    readonly currency: string;         // "USDC"
    readonly chain_id: number;         // 210425
    readonly payer_wallet: string;

    // 仅 settled 事件包含
    readonly settlement?: {
      readonly tx_hash: string;
      readonly block_number: number;
      readonly block_timestamp: string;
      readonly payment_address: string;
    };

    // ISO 20022 语义数据（供 ERP 对账）
    readonly iso_metadata?: {
      readonly end_to_end_id: string;   // nexus_payment_id
      readonly remittance_info: string; // merchant_order_ref
      readonly instructed_amount: string;
      readonly instructed_currency: string; // "USD" (ISO 4217)
      readonly creditor_id: string;     // merchant_did
      readonly settlement_asset: string; // "DTI:4H95J0R2X" (ISO 24165)
    };
  };
}
```

#### 子功能 D.3: HMAC 签名验证

每个 Webhook 请求都携带 HMAC-SHA256 签名，商户可验证请求来源。

```
HTTP Headers:
  X-Nexus-Signature: sha256=<hmac_hex>
  X-Nexus-Event: payment.settled
  X-Nexus-Delivery-Id: <event_id>
  X-Nexus-Timestamp: <unix_timestamp>
  Content-Type: application/json
```

签名计算：
```
signature = HMAC-SHA256(webhook_secret, timestamp + "." + request_body)
```

商户验证伪代码：
```
expected = HMAC-SHA256(my_secret, header_timestamp + "." + raw_body)
if (expected !== header_signature) reject
if (now - header_timestamp > 300) reject  // 5 分钟窗口
```

#### 子功能 D.4: 重试策略

| 参数 | 值 |
| --- | --- |
| 最大重试次数 | 5 次 |
| 重试间隔（指数退避） | 10s, 30s, 2min, 10min, 30min |
| 超时时间 | 每次请求 10 秒 |
| 成功判定 | HTTP 2xx 响应 |
| 失败判定 | HTTP 4xx/5xx 或超时 |
| 幂等保障 | 商户根据 event_id 去重 |

---

## 四、MCP 接口设计

NexusPay Core 作为 MCP Server 运行，暴露以下标准接口。

### 4.1 MCP Tools (给 UA 调用)

#### Tool: `nexus_orchestrate_payment`

验证商户 Quote，创建支付订单，返回 PaymentInstruction。

**Input Schema:**
```json
{
  "quote_payload": {
    "type": "object",
    "description": "NUPS v1.5 标准商户报价 Payload (含签名)",
    "required": true
  },
  "payer_wallet": {
    "type": "string",
    "description": "付款人 EVM 地址 (0x...)",
    "required": true
  }
}
```

**Output Schema:**
```json
{
  "nexus_payment_id": "NEX-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "AWAITING_TX",
  "payment_instruction": {
    "chain_id": 210425,
    "chain_name": "PlatON",
    "target_address": "0xMerchantPaymentAddress",
    "token_address": "0xPlatON_USDC_Address",
    "amount_uint256": "530000000",
    "amount_display": "530.00",
    "method": "erc20_transfer",
    "tx_data": {
      "to": "0xPlatON_USDC_Address",
      "data": "0xa9059cbb000000...",
      "value": "0"
    }
  },
  "expires_at": "2026-02-24T11:00:00Z",
  "iso_metadata": {
    "end_to_end_id": "NEX-xxxxxxxx",
    "instructed_currency": "USD",
    "settlement_asset": "DTI:4H95J0R2X"
  }
}
```

#### Tool: `nexus_submit_tx`

UA 广播交易后，提交 tx_hash 给 Core 追踪。

**Input Schema:**
```json
{
  "nexus_payment_id": {
    "type": "string",
    "required": true
  },
  "tx_hash": {
    "type": "string",
    "description": "链上交易哈希 (0x...)",
    "required": true
  }
}
```

**Output Schema:**
```json
{
  "nexus_payment_id": "NEX-xxx",
  "status": "BROADCASTED",
  "message": "Transaction submitted. Core is tracking confirmation."
}
```

#### Tool: `nexus_get_payment_status`

查询支付订单状态（对 UA 和 MA 均可用）。

**Input Schema:**
```json
{
  "nexus_payment_id": {
    "type": "string",
    "description": "Nexus 支付订单 ID",
    "required": false
  },
  "merchant_order_ref": {
    "type": "string",
    "description": "商户订单号（可替代 nexus_payment_id 查询）",
    "required": false
  }
}
```

**Output Schema:**
```json
{
  "nexus_payment_id": "NEX-xxx",
  "merchant_order_ref": "FLT-xxx",
  "status": "SETTLED",
  "amount_display": "530.00",
  "currency": "USDC",
  "payer_wallet": "0x...",
  "settlement": {
    "tx_hash": "0x...",
    "block_number": 12345678,
    "confirmed_at": "2026-02-24T10:35:00Z"
  },
  "created_at": "2026-02-24T10:30:00Z",
  "updated_at": "2026-02-24T10:35:00Z"
}
```

### 4.2 MCP Tools (给 MA 调用)

#### Tool: `nexus_confirm_fulfillment`

商户确认已履约（出票、发货等）。

**Input Schema:**
```json
{
  "nexus_payment_id": {
    "type": "string",
    "required": true
  },
  "merchant_did": {
    "type": "string",
    "required": true
  },
  "fulfillment_proof": {
    "type": "string",
    "description": "履约凭证（如电子票号、运单号）",
    "required": false
  }
}
```

### 4.3 MCP Resources

#### Resource: `nexus://core/payments/{nexus_payment_id}`

实时支付状态查询（MCP Resource 协议）。

```json
{
  "nexus_payment_id": "NEX-xxx",
  "status": "SETTLED",
  "amount_display": "530.00",
  "currency": "USDC",
  "merchant_did": "did:nexus:210425:demo_flight",
  "merchant_order_ref": "FLT-xxx",
  "settlement": { "tx_hash": "0x...", "block_number": 12345678 },
  "iso_end_to_end_id": "NEX-xxx",
  "last_updated": "2026-02-24T10:35:00Z"
}
```

---

## 五、用户旅程

### 5.1 完整支付流程时序

```
User Agent (UA)          NexusPay Core             Merchant Agent (MA)         PlatON Chain
     │                        │                           │                        │
     │  1. 搜索商品             │                           │                        │
     │ ──────────────────────────────────────────────────► │                        │
     │  search_flights         │                           │                        │
     │ ◄────────────────────── │                           │                        │
     │  返回航班列表             │                           │                        │
     │                        │                           │                        │
     │  2. 生成报价             │                           │                        │
     │ ──────────────────────────────────────────────────► │                        │
     │  nexus_generate_quote   │                           │                        │
     │ ◄────────────────────── │  NUPS Quote (含 EIP-712 签名)                      │
     │                        │                           │                        │
     │  3. 编排支付             │                           │                        │
     │ ──────────────────────► │                           │                        │
     │  nexus_orchestrate_payment(quote, payer_wallet)     │                        │
     │                        │ ── 验签 ──                 │                        │
     │                        │ ── DID 解析 ──             │                        │
     │                        │ ── 创建 payment ──         │                        │
     │ ◄────────────────────── │                           │                        │
     │  PaymentInstruction     │                           │                        │
     │  (target_addr, amount,  │                           │                        │
     │   calldata)             │                           │                        │
     │                        │                           │                        │
     │  4. 链上支付             │                           │                        │
     │ ─────────────────────────────────────────────────────────────────────────────►│
     │  USDC.transfer(merchant_addr, amount)                                        │
     │ ◄──────────────────────────────────────────────────────────────── tx_hash ────│
     │                        │                           │                        │
     │  5. 提交交易哈希         │                           │                        │
     │ ──────────────────────► │                           │                        │
     │  nexus_submit_tx(id, tx_hash)                      │                        │
     │ ◄────────────────────── │                           │                        │
     │  status: BROADCASTED    │                           │                        │
     │                        │                           │                        │
     │                        │  6. 链上确认               │                        │
     │                        │ ◄──────────────────────────────────── Transfer event │
     │                        │  验证 to/amount 匹配       │                        │
     │                        │  status: SETTLED           │                        │
     │                        │                           │                        │
     │                        │  7. Webhook 通知           │                        │
     │                        │ ──────────────────────────►│                        │
     │                        │  payment.settled           │                        │
     │                        │ ◄──────────────────────────│ HTTP 200               │
     │                        │                           │                        │
     │                        │                           │  8. 商户出票             │
     │                        │                           │ (内部业务逻辑)           │
     │                        │                           │                        │
     │  9. 查询状态             │                           │                        │
     │ ──────────────────────► │                           │                        │
     │  nexus_get_payment_status                           │                        │
     │ ◄────────────────────── │                           │                        │
     │  status: SETTLED        │                           │                        │
     │  "支付成功，商户已出票"   │                           │                        │
```

### 5.2 异常路径

**超时场景：**
1. 用户 30 分钟内未完成支付 -> Core 自动标记 EXPIRED -> Webhook 通知 MA 释放库存
2. 链上交易 10 分钟未确认 -> Core 发出告警 -> 人工介入

**失败场景：**
1. 用户余额不足导致链上 revert -> Core 检测到 `receipt.status === 0` -> 标记 TX_FAILED -> Webhook 通知 MA
2. 用户转账金额不匹配 -> Chain Watcher 不匹配任何 pending payment -> 金额直接到达商户地址（不在 Core 管理范围内）

---

## 六、会计标准合规

### 6.1 ISO 标准映射

NexusPay Core 严格遵循以下国际会计标准：

| 标准 | 映射字段 | 用途 |
| --- | --- | --- |
| **ISO 4217** (货币代码) | `instructed_currency: "USD"` | 报价的法币价值锚定 |
| **ISO 24165** (数字资产标识) | `dti_code: "4H95J0R2X"` | USDC 的 DTI 标识符 |
| **ISO 20022** (支付消息) | 见下表 | ERP/银行系统对账 |

### 6.2 ISO 20022 Payment Message 映射

| Nexus 字段 | ISO 20022 XML Element | 业务含义 |
| --- | --- | --- |
| `nexus_payment_id` | `CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/PmtId/EndToEndId` | 端到端标识符 |
| `merchant_order_ref` | `CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/RmtInf/Ustrd` | 汇款附言/销账单号 |
| `amount_display` | `CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/Amt/InstdAmt` | 指示金额 |
| `"USD"` | `CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/Amt/InstdAmt@Ccy` | 货币代码 |
| `merchant_did` | `CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/Cdtr/Id/OrgId/Othr/Id` | 债权人标识 |
| `payer_wallet` | `CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/Dbtr/Id/OrgId/Othr/Id` | 债务人标识 |
| `tx_hash` | `CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/PmtId/TxId` | 交易标识 |
| `"DTI:4H95J0R2X"` | `CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/RmtInf/Strd/AddtlRmtInf` | 数字资产标识 |

### 6.3 对账流程

```
商户 ERP 对账步骤：
1. 接收 payment.settled Webhook
2. 提取 iso_metadata 中的字段
3. 根据 merchant_order_ref 匹配内部应收账款
4. 验证 amount_display 与预期金额一致
5. 核对 instructed_currency (USD) 与会计科目
6. 记录 settlement_asset (DTI:4H95J0R2X) 表明以 USDC 结算
7. 标记应收账款为已核销
8. 可选：生成 ISO 20022 XML 导入银行 ERP
```

---

## 七、技术实现计划

### 7.1 目录结构

```
src/nexus-core/
├── src/
│   ├── server.ts                    # MCP Server 入口
│   ├── config.ts                    # 环境配置
│   ├── types.ts                     # 核心类型定义
│   │
│   ├── modules/
│   │   ├── security/
│   │   │   ├── eip712-verifier.ts   # EIP-712 签名验证
│   │   │   ├── nonce-guard.ts       # 防重放保护
│   │   │   ├── did-resolver.ts      # DID 解析器
│   │   │   └── access-control.ts    # 权限控制
│   │   │
│   │   ├── payment/
│   │   │   ├── instruction-builder.ts  # 支付指令生成
│   │   │   ├── state-machine.ts        # 状态机
│   │   │   └── timeout-handler.ts      # 超时处理
│   │   │
│   │   ├── chain/
│   │   │   ├── platon-client.ts     # PlatON RPC 客户端
│   │   │   ├── chain-watcher.ts     # 链上事件监听
│   │   │   ├── tx-tracker.ts        # 交易追踪
│   │   │   └── usdc.ts             # USDC 合约交互
│   │   │
│   │   └── webhook/
│   │       ├── notifier.ts          # Webhook 发送
│   │       ├── hmac-signer.ts       # HMAC 签名
│   │       └── retry-scheduler.ts   # 重试调度
│   │
│   ├── db/
│   │   ├── pool.ts                  # 数据库连接
│   │   ├── payment-repo.ts          # 支付订单仓储
│   │   ├── event-repo.ts           # 事件仓储
│   │   ├── merchant-repo.ts         # 商户仓储
│   │   └── webhook-repo.ts          # Webhook 日志仓储
│   │
│   └── tools/
│       ├── orchestrate-payment.ts    # MCP Tool 实现
│       ├── submit-tx.ts
│       ├── get-payment-status.ts
│       └── confirm-fulfillment.ts
│
├── package.json
├── tsconfig.json
└── skill.md                         # Core 能力描述
```

### 7.2 技术栈

| 组件 | 技术选型 | 说明 |
| --- | --- | --- |
| Runtime | Node.js + TypeScript | 与现有 agent 一致 |
| MCP SDK | @modelcontextprotocol/sdk | MCP Server 实现 |
| 区块链交互 | viem | EIP-712 签名、ABI 编码、RPC 调用 |
| 数据库 | Neon PostgreSQL | 与现有 agent 共用 |
| HTTP Client | 原生 fetch | Webhook 发送 |
| 定时任务 | node-cron 或 setInterval | 超时检测、链上轮询 |

### 7.3 开发分期

#### Phase 1: 核心编排 (1-2 周)
- [ ] 数据库 migration (payments, payment_events, merchant_registry)
- [ ] 类型定义 (types.ts)
- [ ] 安全模块：EIP-712 验签 + DID 解析（本地注册表）
- [ ] 状态机实现
- [ ] MCP Tool: `nexus_orchestrate_payment`
- [ ] MCP Tool: `nexus_get_payment_status`

#### Phase 2: 链上集成 (1-2 周)
- [ ] PlatON RPC 客户端
- [ ] USDC 合约交互（transfer calldata 编码）
- [ ] PaymentInstruction Builder
- [ ] Chain Watcher（USDC Transfer 事件监听）
- [ ] Transaction Tracker
- [ ] MCP Tool: `nexus_submit_tx`

#### Phase 3: Webhook 通知 (1 周)
- [ ] Webhook Notifier 实现
- [ ] HMAC 签名
- [ ] 重试调度器
- [ ] Webhook 日志存储
- [ ] Merchant Agent 接收端适配

#### Phase 4: 完善与测试 (1 周)
- [ ] 超时处理定时任务
- [ ] MCP Tool: `nexus_confirm_fulfillment`
- [ ] 端到端测试（UA -> Core -> MA -> PlatON）
- [ ] ISO 20022 数据映射验证
- [ ] Portal Dashboard（Core 管理界面）

---

## 八、相关页面设计

### 8.1 NexusPay Core Portal Dashboard

参照现有 flight-agent portal 设计风格（暗色主题），增加以下内容：

**统计卡片：**
- Total Payments
- Pending (CREATED + AWAITING_TX)
- Settled
- Completed
- Failed / Expired
- Total Volume (USDC)

**支付列表表格：**

| 列 | 说明 |
| --- | --- |
| Payment ID | nexus_payment_id (可点击展开详情) |
| Merchant | merchant_did + name |
| Order Ref | merchant_order_ref |
| Payer | payer_wallet (截断显示) |
| Amount | amount_display + currency |
| Status | 带颜色的状态标签 |
| Tx Hash | 链上交易哈希（链接到 PlatON explorer） |
| Created | 创建时间 |

**详情面板：**
- 完整 NUPS Quote JSON
- 事件时间线 (所有 payment_events)
- Webhook 投递记录
- ISO 20022 数据映射

---

## 九、功能价值分析

### 9.1 价值评估框架

| 指标 | 定义 | 统计方法 | 数据来源 |
| --- | --- | --- | --- |
| **支付成功率** | SETTLED 订单数 / 总创建订单数 | 比率计算，按日/周/月统计 | payments 表 status 字段 |
| **平均结算时间** | 从 CREATED 到 SETTLED 的平均耗时 | 中位数 + P95 | payment_events 时间差 |
| **Webhook 送达率** | 成功投递数 / 总发送数 | 比率计算，区分首次成功与重试成功 | webhook_delivery_logs |
| **超时率** | EXPIRED 订单数 / 总创建订单数 | 比率计算 | payments 表 |
| **交易失败率** | TX_FAILED 数 / 总 BROADCASTED 数 | 比率计算 | payments 表 |
| **商户活跃度** | 有交易的商户数 / 总注册商户数 | DAU/MAU | payments + merchant_registry |
| **总交易量 (GMV)** | SETTLED 订单的 amount_display 总和 | 求和，按日/周/月 | payments 表 |
| **平均客单价** | GMV / SETTLED 订单数 | 均值 | payments 表 |
| **风控拦截率** | RISK_REJECTED 数 / 总请求数 | 比率计算 | payments 表 |
| **系统可用性** | Core 服务正常运行时间 / 总时间 | 99.9% SLA 目标 | 监控系统 |

### 9.2 输入指标 vs 结果指标

**输入指标（可直接优化）：**
- Quote 验签延迟
- Chain Watcher 轮询频率
- Webhook 重试策略参数
- 超时阈值设置

**结果指标（反映产品价值）：**
- 支付成功率（目标 > 95%）
- 平均结算时间（目标 < 30 秒）
- Webhook 送达率（目标 > 99.5%）
- 系统可用性（目标 99.9%）

### 9.3 指标关系链

```
Quote 验签延迟 ──► 编排响应时间 ──► 用户支付体验 ──► 支付成功率
Chain Watcher 频率 ──► 结算确认速度 ──► 平均结算时间 ──► 商户满意度
Webhook 送达率 ──► 商户及时感知 ──► 履约效率 ──► 用户体验
超时率 ──► 库存锁定效率 ──► 商户运营成本
```

---

## 十、安全考量

### 10.1 安全清单

- [ ] 所有 Quote 必须经过 EIP-712 签名验证
- [ ] 防重放：quote_hash 唯一约束
- [ ] 收款地址来源：仅信任 DID 解析结果，不信任前端传入
- [ ] Webhook 请求携带 HMAC 签名
- [ ] 私钥通过环境变量注入，不硬编码
- [ ] RPC URL 不暴露在前端
- [ ] 数据库连接使用 SSL
- [ ] 所有 API 输入进行 schema 验证 (Zod)
- [ ] 错误消息不泄露内部实现细节
- [ ] Rate limiting 应用于所有 MCP Tools

### 10.2 威胁模型

| 威胁 | 影响 | 缓解措施 |
| --- | --- | --- |
| Quote 伪造 | 用户被引导支付到攻击者地址 | EIP-712 验签 + DID 解析收款地址 |
| 重放攻击 | 同一 Quote 被多次用于支付 | quote_hash 唯一约束 + expiry 检查 |
| Webhook 伪造 | 商户被虚假的支付成功通知欺骗 | HMAC 签名 + 时间戳验证 |
| 中间人攻击 | 篡改支付金额或地址 | EIP-712 签名覆盖所有关键字段 |
| DDoS | 服务不可用 | Rate limiting + 输入验证 |

---

## 十一、改进建议与后续规划

### 11.1 MVP 后续优化

1. **智能合约版本**：部署 NexusRouter 合约，支持批量支付和原子化分账
2. **链上 DID 注册表**：将 merchant_registry 迁移到 PlatON 链上 NexusMerchantRegistry 合约
3. **完整风控系统**：部署 RFC-006 定义的 RiskGatekeeper（链下 AI + 链上 Permit）
4. **跨链支持**：实现 RFC-007 的 Hub-Spoke 架构，支持从 Base/Ethereum 入金
5. **MPC 托管**：引入 MPC 临时地址，实现 Escrow 模式
6. **ERP 集成**：提供 ISO 20022 XML 导出功能，直接对接银行系统

### 11.2 头脑风暴待讨论项

1. PlatON 主网 USDC 合约地址需要确认
2. 是否需要支持原生 LAT (PlatON 原生代币) 支付？
3. Gas 费由谁承担？用户自行支付 LAT Gas
4. 是否需要 Quote 价格波动保护（锁价机制）？
5. 商户结算频率：实时结算 vs 批量结算
6. 纠纷处理机制的详细设计

---

*文档结束。版本 1.0.0 - 2026-02-24*
