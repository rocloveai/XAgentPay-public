# PRD-001: XAgent Pay Core 支付系统产品需求文档

| 元数据 | 内容 |
| --- | --- |
| **产品名称** | XAgent Pay Core |
| **版本** | 1.1.0 (MVP) |
| **状态** | Draft |
| **作者** | Cipher & XAgent Pay Product Team |
| **创建日期** | 2026-02-24 |
| **更新日期** | 2026-02-24 |
| **目标链** | XLayer 主网 (chain_id: 210425) |
| **支付币种** | USDC (ERC-20, 支持 EIP-3009) |
| **依赖 RFC** | RFC-001 (DID), RFC-002 (NUPS), RFC-003 (NAIS), RFC-005 (Payment Core), RFC-006 (Risk Gatekeeper), **RFC-010 (Escrow Contract)** |

---

## 一、概述

### 1.1 项目背景

XAgent Pay 已有 Merchant Agent Demo（flight-agent、hotel-agent），实现了基于 MCP 协议的 AI Agent 商品搜索与报价生成流程。然而，从 "商户生成报价" 到 "链上完成支付" 之间缺少核心的支付编排层。

当前存在以下关键缺口：

| 缺口 | 当前状态 | 目标状态 |
| --- | --- | --- |
| Quote 签名 | 硬编码 `PENDING_NEXUS_CORE` | EIP-712 TypedData 真实签名 |
| 支付路由 | 无链上交互 | **双模式**: Direct Transfer + Escrow 智能合约 |
| 资金安全 | 无担保，资金直达商户 | **Escrow 合约担保**: 锁定 → 履约 → 释放 |
| Gas 体验 | 用户需持有 LAT 支付 Gas | **EIP-3009 + Relayer 代付**: 用户零 Gas |
| 状态管理 | 仅 UNPAID/PAID/EXPIRED | 完整 12 态状态机 (含 Escrow 专用状态) |
| 支付确认 | 无链上事件监听 | 自动监听 + Webhook 回调 |
| 安全机制 | 无验证 | 签名验证 + 防重放 + 权限控制 |
| 纠纷处理 | 无 | **链上仲裁**: 超时退款 + 争议裁决 |
| 会计标准 | 无 | ISO 20022 映射 + 对账事件 |

### 1.2 设计目标

1. **构建 XAgent Pay Core 编排服务**：连接 User Agent 和 Merchant Agent，完成支付闭环
2. **双模式支付架构**：支持 Direct Transfer（小额即时）和 **Escrow 智能合约**（高价值担保）两种支付模式
3. **零 Gas 用户体验**：通过 EIP-3009 + Relayer 代付，用户无需持有 LAT 即可完成支付
4. **严格模块化设计**：安全、支付合约、订单逻辑、Webhook 通知、**Relayer 代付**五大模块独立解耦
5. **链上担保与纠纷仲裁**：Escrow 合约作为资金担保人，支持超时退款和争议仲裁
6. **符合国际会计标准**：ISO 20022 数据映射、ISO 4217 货币编码、ISO 24165 数字资产标识

### 1.3 设计原则

- **Dual Payment Mode（双模式支付）**：Direct Transfer 与 Escrow Contract 并行，按场景路由
- **Escrow-First（担保优先）**：高价值交易默认使用 Escrow 模式，资金经合约担保
- **Gasless UX（无 Gas 体验）**：EIP-3009 签名 + Relayer 代付，用户仅需签名
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
│         PreparePayment → SignEIP3009 → TrackOrder                 │
└────────────────────────┬──────────────────────────────────────────┘
                         │ MCP Protocol (Stdio/SSE)
┌────────────────────────▼──────────────────────────────────────────┐
│                     XAgent Pay Core Service                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐ │
│  │   Security   │ │  Order State │ │  Chain       │ │  Webhook  │ │
│  │   Module     │ │  Machine     │ │  Watcher     │ │  Notifier │ │
│  │             │ │              │ │              │ │           │ │
│  │ - EIP-712   │ │ - 12 States  │ │ - Event      │ │ - HTTP    │ │
│  │   Verify    │ │ - Dual Mode  │ │   Listener   │ │   POST    │ │
│  │ - Nonce     │ │ - Timeout    │ │ - Escrow     │ │ - Retry   │ │
│  │   Guard     │ │   Handler    │ │   Events     │ │ - HMAC    │ │
│  │ - DID       │ │ - Escrow     │ │ - Tx         │ │   Signed  │ │
│  │   Resolver  │ │   States     │ │   Tracker    │ │           │ │
│  └─────────────┘ └──────────────┘ └──────────────┘ └───────────┘ │
│                                                                   │
│  ┌──────────────────────────┐  ┌────────────────────────────────┐ │
│  │   Relayer 代付服务        │  │   Payment Router               │ │
│  │                          │  │                                │ │
│  │ - EIP-3009 签名转发       │  │ - DIRECT_TRANSFER 路由         │ │
│  │ - Gas 代付 (LAT)         │  │ - ESCROW_CONTRACT 路由          │ │
│  │ - Nonce 管理             │  │ - 商户偏好 + 金额阈值           │ │
│  │ - 余额监控               │  │                                │ │
│  └──────────────────────────┘  └────────────────────────────────┘ │
│                         │                                         │
│             ┌───────────▼───────────┐                             │
│             │   PostgreSQL (Neon)   │                              │
│             │   - payments          │                              │
│             │   - payment_events    │                              │
│             │   - merchant_registry │                              │
│             │   - webhook_logs      │                              │
│             └───────────────────────┘                              │
└─────────┬──────────────────────────────────────┬─────────────────┘
          │ Webhook HTTP                          │ MCP Protocol
┌─────────▼─────────────────────┐  ┌─────────────▼─────────────────┐
│     Merchant Agent (MA)       │  │    XLayer Blockchain           │
│  flight / hotel / 其他         │  │    chain_id: 210425            │
│  SignQuote → Webhook → Fulfill │  │                               │
└───────────────────────────────┘  │  ┌───────────────────────────┐ │
                                   │  │ XAgent PayEscrow Contract   │ │
                                   │  │ - depositWithAuthorization│ │
                                   │  │ - release / refund        │ │
                                   │  │ - dispute / resolve       │ │
                                   │  └───────────────────────────┘ │
                                   │                               │
                                   │  USDC (ERC-20 + EIP-3009)     │
                                   └───────────────────────────────┘
```

### 2.2 模块职责矩阵

| 模块 | 核心职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| **Security Module** | 验签、防重放、DID 解析、权限控制 | Quote + Signature | Verified/Rejected |
| **Order State Machine** | 订单生命周期管理、12 态状态转换、超时处理 | Payment Events | State Updates |
| **Chain Watcher** | 链上事件监听、Escrow 合约事件、USDC 转账确认 | XLayer RPC | Transfer/Escrow Events |
| **Webhook Notifier** | 支付结果回调、重试策略、HMAC 签名 | State Changes | HTTP POST |
| **Relayer 代付服务** | EIP-3009 签名转发、Gas 代付、nonce 管理、余额监控 | User Signatures | On-chain Tx |
| **Payment Router** | 根据商户偏好/金额阈值路由到 Direct 或 Escrow 模式 | Quote + Config | Payment Method |

---

## 三、功能模块详细设计

### 模块 A: 安全模块 (Security Module)

#### 功能名称
XAgent Pay Security Module

#### 需求描述
提供端到端的交易安全保障，包括商户报价签名验证、防重放攻击、DID 身份解析与权限访问控制。确保每笔支付请求都经过严格的身份与数据完整性校验。

#### 子功能 A.1: EIP-712 签名验证

**用户故事：**
作为 XAgent Pay Core，当收到 UA 提交的商户 Quote 时，我需要验证该 Quote 确实由合法商户签发且未被篡改，以保障支付路由到真实债权人。

**实现逻辑：**

1. 接收 UA 提交的 NUPS Quote Payload（含 signature 字段）
2. 从 quote 中提取 `merchant_did`，调用 DID Resolver 获取 signer 地址
3. 构造 EIP-712 TypedData 结构：

```typescript
// EIP-712 Domain
const NEXUS_DOMAIN = {
  name: "XAgent Pay",
  version: "1",
  chainId: 210425, // XLayer mainnet
  verifyingContract: "0XAgent PayCoreContractAddress..."
} as const;

// EIP-712 Type Definition
const NEXUS_QUOTE_TYPES = {
  XAgent PayQuote: [
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
作为 XAgent Pay Core，我需要确保同一份 Quote 不会被重复用于发起多笔支付，防止重放攻击造成资金损失。

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
作为 XAgent Pay Core，我需要将 `did:xagent:210425:demo_flight` 解析为链上注册的商户信息（signer 地址、payment 地址），确保资金流向经过验证的真实收款方。

**实现逻辑（MVP 阶段）：**

MVP 阶段尚未部署 XAgent PayMerchantRegistry 合约，采用本地注册表：

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

后续升级路径：连接 XLayer 链上 `XAgent PayMerchantRegistry` 合约。

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
XLayer USDC Dual-Mode Payment (Direct Transfer + Escrow Contract)

#### 需求描述
在 XLayer 主网上实现两种 USDC 支付模式：**Direct Transfer**（小额即时）和 **Escrow Contract**（高价值担保）。Core 根据商户偏好和交易金额自动路由到对应模式。Escrow 模式采用 EIP-3009 + Relayer 代付，用户零 Gas。

#### 子功能 B.0: 支付模式路由 (Payment Router)

**用户故事：**
作为 XAgent Pay Core，当收到 Quote 时，我需要根据商户配置和交易特征自动选择最合适的支付模式。

**路由规则：**

| 条件 | 路由结果 | 说明 |
| --- | --- | --- |
| Quote 中 `payment_method: "ESCROW"` | ESCROW_CONTRACT | 商户明确要求担保 |
| Quote 中 `payment_method: "DIRECT"` | DIRECT_TRANSFER | 商户明确要求直付 |
| 商户默认偏好为 Escrow | ESCROW_CONTRACT | 商户注册时配置 |
| 金额 > 阈值 (默认 100 USDC) | ESCROW_CONTRACT | 高价值交易自动使用担保 |
| 其他情况 | DIRECT_TRANSFER | 小额即时支付 |

#### 子功能 B.1: 支付指令生成 (Payment Instruction Builder)

**用户故事：**
作为 User Agent，当我获得经过 Core 验证的 Quote 后，我需要收到一份清晰的支付指令。Direct 模式返回 transfer calldata；Escrow 模式返回 EIP-3009 签名参数（用户仅需签名，无需链上交易）。

**Direct Transfer 模式 - PaymentInstruction：**

```typescript
interface PaymentInstruction {
  // 链信息
  readonly chain_id: 210425;
  readonly chain_name: "XLayer";
  readonly payment_method: "DIRECT_TRANSFER";

  // 转账目标
  readonly target_address: Address;  // 商户 paymentAddress (从 DID 解析)
  readonly token_address: Address;   // XLayer 上的 USDC 合约地址
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

**Escrow 模式 - EscrowInstruction (EIP-3009 + Relayer 代付)：**

```typescript
interface EscrowInstruction {
  // 链信息
  readonly chain_id: 210425;
  readonly chain_name: "XLayer";
  readonly payment_method: "ESCROW_CONTRACT";

  // Escrow 合约信息
  readonly escrow_contract: Address;   // XAgent PayEscrow 合约地址
  readonly token_address: Address;     // USDC 合约地址 (支持 EIP-3009)
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;

  // 金额
  readonly amount_uint256: string;     // e.g. "530000000" (530 USDC)
  readonly amount_display: string;     // e.g. "530.00"

  // EIP-3009 签名参数 (用户需签署此 TypedData，无链上交易)
  readonly eip3009_sign_data: {
    readonly domain: {
      readonly name: string;           // USDC 合约的 EIP-712 domain name
      readonly version: string;
      readonly chainId: 210425;
      readonly verifyingContract: Address;  // USDC 合约地址
    };
    readonly types: {
      readonly TransferWithAuthorization: readonly [
        { readonly name: "from"; readonly type: "address" },
        { readonly name: "to"; readonly type: "address" },
        { readonly name: "value"; readonly type: "uint256" },
        { readonly name: "validAfter"; readonly type: "uint256" },
        { readonly name: "validBefore"; readonly type: "uint256" },
        { readonly name: "nonce"; readonly type: "bytes32" }
      ];
    };
    readonly primaryType: "TransferWithAuthorization";
    readonly message: {
      readonly from: Address;          // 用户钱包地址
      readonly to: Address;            // Escrow 合约地址
      readonly value: string;          // USDC 金额 (uint256)
      readonly validAfter: string;     // 签名生效时间
      readonly validBefore: string;    // 签名过期时间
      readonly nonce: Hex;             // 唯一 nonce (bytes32)
    };
  };

  // Escrow 业务参数
  readonly nexus_payment_id: string;
  readonly payment_id_bytes32: Hex;    // keccak256(nexus_payment_id)
  readonly merchant_address: Address;
  readonly order_ref_hash: Hex;        // keccak256(merchant_order_ref)
  readonly merchant_did_hash: Hex;     // keccak256(merchant_did)
  readonly context_hash: Hex;          // 订单上下文 hash

  // 超时信息
  readonly release_deadline: string;   // ISO 8601, 商户必须在此前履约
  readonly dispute_deadline: string;   // ISO 8601, 用户可在此前发起争议

  // 用户操作指引
  readonly user_action: "SIGN_EIP3009"; // 用户仅需签名，无需链上交易
  readonly gas_paid_by: "RELAYER";      // Gas 由 Relayer 承担
}
```

**Escrow 模式签名流程：**
```
1. Core 返回 EscrowInstruction (包含 eip3009_sign_data)
2. UA 调用用户钱包的 eth_signTypedData_v4(eip3009_sign_data)
3. 用户在钱包中确认签名 (仅签名，不发送交易，不消耗 Gas)
4. UA 获得签名 (v, r, s)
5. UA 调用 nexus_submit_eip3009_signature(payment_id, v, r, s)
6. Core 将签名转发给 Relayer
7. Relayer 调用 XAgent PayEscrow.depositWithAuthorization(...) 上链
8. 链上确认后 Core 更新状态为 ESCROWED
```

**功能细节：**

| 项目 | 说明 |
| --- | --- |
| XLayer RPC | `https://openapi2.platon.network/rpc` (主网) |
| USDC 合约地址 | XLayer 主网 USDC (支持 EIP-3009) |
| Escrow 合约 | XAgent PayEscrow (待部署) |
| Gas 模型 | Direct: 用户自付 ~65,000 gas; Escrow: Relayer 代付 ~220,000 gas |
| 金额精度 | 6 位小数 (USDC standard) |

#### 子功能 B.1.5: Relayer 代付服务

**用户故事：**
作为用户，我不想持有 LAT 来支付 Gas 费。我只需要签署一个授权签名，Relayer 帮我把交易提交到链上。

**架构设计：**

Relayer 作为 XAgent Pay Core 的子模块，包含三个核心组件：

| 组件 | 职责 |
| --- | --- |
| **Relayer Wallet** | 持有 LAT，签名并提交链上交易 |
| **Transaction Queue** | 排队 + 重试 + nonce 管理 |
| **Balance Monitor** | LAT 余额监控 + 低余额告警 |

**Gas 成本核算：**

| 操作 | Gas 消耗 | 成本 (LAT) |
| --- | --- | --- |
| depositWithAuthorization | ~140,000 | ~0.00014 |
| release | ~80,000 | ~0.00008 |
| refund | ~75,000 | ~0.000075 |
| **单笔 Escrow 总成本** | **~220,000** | **~0.00022** |

> 协议手续费 0.3% 完全覆盖 Relayer Gas 成本。例：530 USDC × 0.3% = 1.59 USDC >> Gas 成本

**安全设计：**
- 最小权限：Relayer 只能调用 Escrow 合约的指定函数
- 签名验证：所有 EIP-3009 签名在提交前验证
- 金额上限：单笔交易限额，超额需审批
- 速率限制：防止 Relayer 被滥用
- 密钥管理：Relayer 私钥通过 KMS 管理

#### 子功能 B.2: 交易追踪 (Transaction Tracker)

**用户故事：**
作为 XAgent Pay Core，当 UA 广播了链上交易后，我需要监听该交易的确认状态，并在确认后更新订单状态。

**实现逻辑：**

1. UA 广播交易后，将 `tx_hash` 提交给 Core
2. Core 通过 XLayer RPC 轮询交易 receipt
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
作为 XAgent Pay Core，我需要持续监听 XLayer 链上的 USDC Transfer 事件和 XAgent PayEscrow 合约事件，确保所有支付状态变更都被及时捕获。

**实现逻辑：**

```
Chain Watcher 运行模式：

Direct Transfer 模式：
1. 主动模式：UA 提交 tx_hash -> 直接查询该 tx
2. 被动模式：轮询 USDC Transfer events -> 匹配 pending payments

Escrow 模式 (新增)：
3. 监听 XAgent PayEscrow 合约事件：
   - PaymentDeposited -> ESCROWED (资金已锁定)
   - PaymentReleased  -> SETTLED (资金已释放给商户)
   - PaymentRefunded  -> REFUNDED (资金已退还用户)
   - PaymentDisputed  -> DISPUTE_OPEN (用户发起争议)
   - DisputeResolved  -> DISPUTE_RESOLVED (仲裁完成)

轮询策略：
- 每 3 秒查询最新区块
- Direct 模式：过滤 USDC Transfer logs (to IN 商户地址集合)
- Escrow 模式：过滤 XAgent PayEscrow 合约 event logs
- XLayer 出块时间约 1 秒，3 秒间隔足够及时

超时退款自动触发 (Escrow 模式)：
- 每 60 秒扫描 status = 'ESCROWED' 且 release_deadline 已过的订单
- 通过 Relayer 调用 XAgent PayEscrow.refund(paymentId)
- Gas 由 Relayer 承担
```

**ISO 20022 事件映射：**

当检测到支付成功时，生成符合 ISO 20022 语义的事件记录：

| XAgent Pay 字段 | ISO 20022 标签 | 说明 |
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

XAgent Pay Core 支持两种支付模式，共享前半段状态，后半段根据模式分叉。

**Direct Transfer 模式状态图：**

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
```

**Escrow 模式状态图 (新增)：**

```
                    ┌───────────────┐
                    │    CREATED    │ ← orchestrate_payment (payment_method: ESCROW)
                    └───────┬───────┘
                            │ UA 获取 EscrowInstruction (EIP-3009 签名参数)
                    ┌───────▼───────┐
                    │  AWAITING_TX  │ ← UA 签署 EIP-3009 授权
                    └───┬───────┬───┘
                        │       │ 超时 30 min
                ┌───────▼──┐  ┌─▼────────┐
                │BROADCASTED│  │  EXPIRED  │
                └───────┬───┘  └──────────┘
                        │ Relayer 上链确认
                ┌───────▼───────┐
                │   ESCROWED    │ ← PaymentDeposited event (资金锁定在合约中)
                └───┬─────┬───┬─┘
                    │     │   │
            release │     │   │ dispute()
                    │     │   │
            ┌───────▼──┐  │  ┌▼───────────┐
            │ SETTLED  │  │  │DISPUTE_OPEN │
            └────┬─────┘  │  └──────┬──────┘
                 │        │         │ resolve()
            ┌────▼─────┐  │  ┌──────▼──────────┐
            │COMPLETED │  │  │DISPUTE_RESOLVED  │
            └──────────┘  │  └─────────────────┘
                          │ 超时 refund()
                   ┌──────▼──────┐
                   │  REFUNDED   │
                   └─────────────┘

         异常路径：
         AWAITING_TX / BROADCASTED → TX_FAILED (链上 revert)
         任意活跃状态 → RISK_REJECTED (风控拦截)
```

**完整状态转换规则（12 态）：**

| 当前状态 | 目标状态 | 触发条件 | 支付模式 | 执行动作 |
| --- | --- | --- | --- | --- |
| (无) | CREATED | Core 收到有效 Quote 并验签通过 | 共用 | 生成 nexus_payment_id，存储 payment |
| CREATED | AWAITING_TX | UA 获取支付指令 | 共用 | 生成链上交易数据/EIP-3009 签名参数 |
| AWAITING_TX | BROADCASTED | UA 提交 tx_hash 或 EIP-3009 签名 | 共用 | 开始链上交易追踪 |
| AWAITING_TX | EXPIRED | 超过 30 分钟未提交 | 共用 | 释放资源，通知商户 |
| BROADCASTED | SETTLED | Direct: Transfer event 确认 | Direct | 记录结算信息，通知商户 |
| BROADCASTED | ESCROWED | Escrow: PaymentDeposited event | **Escrow** | 资金锁定，通知商户履约 |
| BROADCASTED | TX_FAILED | 链上交易 revert | 共用 | 记录失败原因，通知商户 |
| ESCROWED | SETTLED | Core/Relayer 调用 release() | **Escrow** | 资金释放给商户 |
| ESCROWED | REFUNDED | 超时后 Relayer 调用 refund() | **Escrow** | 资金退还用户 |
| ESCROWED | DISPUTE_OPEN | 用户调用 dispute() | **Escrow** | 资金冻结，等待仲裁 |
| DISPUTE_OPEN | DISPUTE_RESOLVED | 仲裁人调用 resolve() | **Escrow** | 按比例分配资金 |
| SETTLED | COMPLETED | 商户调用 confirm_fulfillment | 共用 | 标记履约完成 |
| 任意活跃状态 | RISK_REJECTED | 风控拦截 | 共用 | 记录拒绝原因 |

#### 子功能 C.2: 超时处理

**实现逻辑：**

| 超时场景 | 超时时间 | 处理方式 | 支付模式 |
| --- | --- | --- | --- |
| Quote 过期 | quote.expiry 时间戳 | CREATED -> EXPIRED | 共用 |
| 等待交易 | 30 分钟（从 AWAITING_TX 开始） | AWAITING_TX -> EXPIRED | 共用 |
| 交易确认超时 | 10 分钟（从 BROADCASTED 开始） | 告警，人工介入 | 共用 |
| 商户履约超时 (Direct) | 24 小时（从 SETTLED 开始） | 告警，纠纷流程 | Direct |
| **Escrow 履约超时** | **releaseDeadline (默认 24h)** | **ESCROWED -> REFUNDED (链上自动退款)** | **Escrow** |
| **争议窗口** | **disputeDeadline (默认 72h)** | **窗口内用户可发起 dispute** | **Escrow** |
| **仲裁超时** | **7 天（从 DISPUTE_OPEN 开始）** | **告警，升级处理** | **Escrow** |

超时检测采用定时任务：
- Direct 模式：每 30 秒扫描活跃订单
- Escrow 模式：每 60 秒扫描 ESCROWED 订单，超时后通过 Relayer 调用合约 `refund()` 自动退款

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
  | "WEBHOOK_FAILED"
  // Escrow 模式新增事件
  | "EIP3009_SIGNATURE_RECEIVED"  // UA 提交 EIP-3009 签名
  | "RELAYER_TX_SUBMITTED"        // Relayer 提交链上交易
  | "ESCROW_DEPOSITED"            // 资金存入 Escrow 合约
  | "ESCROW_RELEASED"             // 资金从 Escrow 释放给商户
  | "ESCROW_REFUNDED"             // 资金从 Escrow 退还用户
  | "DISPUTE_OPENED"              // 用户发起争议
  | "DISPUTE_RESOLVED";           // 仲裁人裁决
```

#### 子功能 C.4: 数据库 Schema

```sql
-- payments: 支付订单主表 (v1.1: 新增 Escrow 字段)
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
  payment_method      TEXT NOT NULL DEFAULT 'DIRECT_TRANSFER', -- v1.1: 支付模式
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

  -- v1.1: Escrow 模式专用字段 (全部 nullable，仅 Escrow 模式使用)
  escrow_contract     TEXT,                   -- XAgent PayEscrow 合约地址
  payment_id_bytes32  TEXT,                   -- keccak256(nexus_payment_id)
  eip3009_nonce       TEXT,                   -- EIP-3009 唯一 nonce (bytes32)
  deposit_tx_hash     TEXT,                   -- Relayer deposit 交易 hash
  release_tx_hash     TEXT,                   -- Relayer release 交易 hash
  refund_tx_hash      TEXT,                   -- 退款交易 hash
  release_deadline    TIMESTAMPTZ,            -- 商户履约截止时间
  dispute_deadline    TIMESTAMPTZ,            -- 争议窗口截止时间
  protocol_fee        TEXT,                   -- 协议手续费 (uint256)
  dispute_reason      TEXT,                   -- 争议原因

  CONSTRAINT chk_status CHECK (status IN (
    'CREATED', 'AWAITING_TX', 'BROADCASTED',
    'SETTLED', 'COMPLETED', 'EXPIRED',
    'TX_FAILED', 'RISK_REJECTED',
    -- v1.1: Escrow 模式新增状态
    'ESCROWED', 'REFUNDED', 'DISPUTE_OPEN', 'DISPUTE_RESOLVED'
  )),
  CONSTRAINT chk_payment_method CHECK (payment_method IN (
    'DIRECT_TRANSFER', 'ESCROW_CONTRACT'
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

| 事件类型 | 触发时机 | 商户预期行为 | 支付模式 |
| --- | --- | --- | --- |
| `payment.created` | 支付订单创建 | 可选：更新内部状态 | 共用 |
| `payment.settled` | 链上交易确认 (Direct) 或资金释放 (Escrow) | 发货/出票/提供服务 | 共用 |
| `payment.expired` | 支付超时未完成 | 释放库存、取消预订 | 共用 |
| `payment.failed` | 链上交易失败 | 释放库存、通知用户重试 | 共用 |
| **`payment.escrowed`** | **资金存入 Escrow 合约** | **开始履约 (出票/发货)** | **Escrow** |
| **`payment.refunded`** | **超时退款，资金退还用户** | **取消订单、释放库存** | **Escrow** |
| **`dispute.opened`** | **用户发起争议** | **准备申诉材料** | **Escrow** |
| **`dispute.resolved`** | **仲裁人裁决完成** | **根据裁决结果处理** | **Escrow** |

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
  X-XAgent Pay-Signature: sha256=<hmac_hex>
  X-XAgent Pay-Event: payment.settled
  X-XAgent Pay-Delivery-Id: <event_id>
  X-XAgent Pay-Timestamp: <unix_timestamp>
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

XAgent Pay Core 作为 MCP Server 运行，暴露以下标准接口。

### 4.1 MCP Tools (给 UA 调用)

#### Tool: `xagent_orchestrate_payment`

验证商户 Quote，创建支付订单，根据支付模式返回 PaymentInstruction 或 EscrowInstruction。

**Input Schema:**
```json
{
  "quote_payload": {
    "type": "object",
    "description": "NUPS v1.5 标准商户报价 Payload (含签名和 payment_method)",
    "required": true
  },
  "payer_wallet": {
    "type": "string",
    "description": "付款人 EVM 地址 (0x...)",
    "required": true
  }
}
```

**Output Schema (Direct Transfer 模式):**
```json
{
  "nexus_payment_id": "NEX-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "AWAITING_TX",
  "payment_method": "DIRECT_TRANSFER",
  "payment_instruction": {
    "chain_id": 210425,
    "chain_name": "XLayer",
    "payment_method": "DIRECT_TRANSFER",
    "target_address": "0xMerchantPaymentAddress",
    "token_address": "0xXLayer_USDC_Address",
    "amount_uint256": "530000000",
    "amount_display": "530.00",
    "method": "erc20_transfer",
    "tx_data": {
      "to": "0xXLayer_USDC_Address",
      "data": "0xa9059cbb000000...",
      "value": "0"
    }
  },
  "expires_at": "2026-02-24T11:00:00Z"
}
```

**Output Schema (Escrow 模式 - EIP-3009 签名参数):**
```json
{
  "nexus_payment_id": "NEX-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "AWAITING_TX",
  "payment_method": "ESCROW_CONTRACT",
  "escrow_instruction": {
    "chain_id": 210425,
    "chain_name": "XLayer",
    "payment_method": "ESCROW_CONTRACT",
    "escrow_contract": "0xXAgentPayEscrowAddress",
    "token_address": "0xXLayer_USDC_Address",
    "amount_uint256": "530000000",
    "amount_display": "530.00",
    "eip3009_sign_data": {
      "domain": { "name": "USDC", "version": "1", "chainId": 210425, "verifyingContract": "0xUSDC" },
      "types": { "TransferWithAuthorization": [/* ... */] },
      "primaryType": "TransferWithAuthorization",
      "message": {
        "from": "0xPayerWallet",
        "to": "0xXAgentPayEscrowAddress",
        "value": "530000000",
        "validAfter": "0",
        "validBefore": "1740412800",
        "nonce": "0xRandomNonce..."
      }
    },
    "user_action": "SIGN_EIP3009",
    "gas_paid_by": "RELAYER",
    "release_deadline": "2026-02-25T10:30:00Z",
    "dispute_deadline": "2026-02-27T10:30:00Z"
  },
  "expires_at": "2026-02-24T11:00:00Z"
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

#### Tool: `xagent_get_payment_status`

查询支付订单状态（对 UA 和 MA 均可用）。

**Input Schema:**
```json
{
  "nexus_payment_id": {
    "type": "string",
    "description": "XAgent Pay 支付订单 ID",
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

#### Tool: `nexus_submit_eip3009_signature` (Escrow 模式新增)

UA 提交用户的 EIP-3009 签名，Core 转发给 Relayer 代为上链。

**Input Schema:**
```json
{
  "nexus_payment_id": {
    "type": "string",
    "required": true
  },
  "v": {
    "type": "number",
    "description": "签名 v (27 或 28)",
    "required": true
  },
  "r": {
    "type": "string",
    "description": "签名 r (bytes32 hex)",
    "required": true
  },
  "s": {
    "type": "string",
    "description": "签名 s (bytes32 hex)",
    "required": true
  }
}
```

**Output Schema:**
```json
{
  "nexus_payment_id": "NEX-xxx",
  "status": "BROADCASTED",
  "deposit_tx_hash": "0x...",
  "relayer_address": "0x...",
  "gas_paid_by": "RELAYER",
  "message": "Signature received. Relayer is submitting deposit transaction."
}
```

#### Tool: `xagent_release_payment` (Escrow 模式新增)

Core 通过 Relayer 调用 Escrow 合约释放资金给商户。

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
    "description": "履约凭证",
    "required": false
  }
}
```

**Output Schema:**
```json
{
  "nexus_payment_id": "NEX-xxx",
  "status": "SETTLED",
  "release_tx_hash": "0x...",
  "merchant_amount": "528.41",
  "protocol_fee": "1.59",
  "gas_paid_by": "RELAYER"
}
```

#### Tool: `xagent_dispute_payment` (Escrow 模式新增)

UA 代用户发起争议（通过 Relayer 代为提交 dispute 交易）。

**Input Schema:**
```json
{
  "nexus_payment_id": {
    "type": "string",
    "required": true
  },
  "payer_wallet": {
    "type": "string",
    "required": true
  },
  "reason": {
    "type": "string",
    "description": "争议原因",
    "required": true
  }
}
```

**Output Schema:**
```json
{
  "nexus_payment_id": "NEX-xxx",
  "status": "DISPUTE_OPEN",
  "dispute_tx_hash": "0x...",
  "dispute_deadline": "2026-02-27T10:30:00Z",
  "message": "Dispute filed. Funds frozen in escrow. Arbiter will review."
}
```

### 4.2 MCP Tools (给 MA 调用)

#### Tool: `xagent_confirm_fulfillment`

商户确认已履约（出票、发货等）。Escrow 模式下，此操作将触发 Core 通过 Relayer 调用合约 `release()` 释放资金。

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
  "merchant_did": "did:xagent:210425:demo_flight",
  "merchant_order_ref": "FLT-xxx",
  "settlement": { "tx_hash": "0x...", "block_number": 12345678 },
  "iso_end_to_end_id": "NEX-xxx",
  "last_updated": "2026-02-24T10:35:00Z"
}
```

---

## 五、用户旅程

### 5.1 Direct Transfer 模式支付流程

```
User Agent (UA)          XAgent Pay Core             Merchant Agent (MA)         XLayer Chain
     │                        │                           │                        │
     │  1. 搜索+报价           │                           │                        │
     │ ──────────────────────────────────────────────────► │                        │
     │ ◄────────────────────── │  Quote (payment_method: DIRECT)                   │
     │                        │                           │                        │
     │  2. 编排支付             │                           │                        │
     │ ──────────────────────► │ 验签 + DID 解析 + 路由     │                        │
     │ ◄────────────────────── │ PaymentInstruction        │                        │
     │                        │                           │                        │
     │  3. 链上支付             │                           │                        │
     │ ─────────────────────────────────────────────────────────────────────────────►│
     │  USDC.transfer(merchant_addr, amount)                                        │
     │ ◄──────────────────────────────────────────────────────────────── tx_hash ────│
     │                        │                           │                        │
     │  4. 提交 tx_hash        │                           │                        │
     │ ──────────────────────► │ status: BROADCASTED       │                        │
     │                        │ ◄──────────────────────────────────── Transfer event │
     │                        │ status: SETTLED            │                        │
     │                        │ ──────────────────────────►│ payment.settled         │
     │                        │                           │ 商户出票/发货             │
```

### 5.2 Escrow 模式支付流程 (EIP-3009 + Relayer 代付)

```
User Agent (UA)       XAgent Pay Core        Relayer         XAgent PayEscrow       Merchant Agent (MA)
     │                     │              (Core子模块)      (Smart Contract)           │
     │  1. 搜索+报价        │                   │                │                    │
     │ ─────────────────────────────────────────────────────────────────────────────► │
     │ ◄───────────────────│  Quote (payment_method: ESCROW)    │                    │
     │                     │                   │                │                    │
     │  2. 编排支付          │                   │                │                    │
     │ ───────────────────►│ 验签+DID+路由       │                │                    │
     │ ◄───────────────────│ EscrowInstruction   │                │                    │
     │                     │ (eip3009_sign_data) │                │                    │
     │                     │                   │                │                    │
     │  3. 用户签名 EIP-3009  │                   │                │                    │
     │  (链下签名，零 Gas)    │                   │                │                    │
     │                     │                   │                │                    │
     │  4. 提交签名          │                   │                │                    │
     │ ───────────────────►│                   │                │                    │
     │  nexus_submit_eip3009_signature(v,r,s)  │                │                    │
     │                     │ ────────────────►  │                │                    │
     │                     │ 转发给 Relayer      │                │                    │
     │                     │                   │ ──────────────►│                    │
     │                     │                   │ depositWithAuth │                    │
     │                     │                   │ (Relayer付Gas)  │                    │
     │                     │                   │ ◄──────────────│ PaymentDeposited    │
     │ ◄───────────────────│ status: ESCROWED   │                │                    │
     │                     │                   │                │                    │
     │                     │  5. Webhook         │                │                    │
     │                     │ ──────────────────────────────────────────────────────► │
     │                     │ payment.escrowed    │                │                    │
     │                     │                   │                │                    │
     │                     │                   │                │   6. 商户履约 (出票)  │
     │                     │ ◄─────────────────────────────────────────────────────  │
     │                     │ xagent_confirm_fulfillment(proof)    │                    │
     │                     │                   │                │                    │
     │                     │  7. 释放 Escrow     │                │                    │
     │                     │ ────────────────►  │                │                    │
     │                     │                   │ ──────────────►│                    │
     │                     │                   │ release()       │                    │
     │                     │                   │ (Relayer付Gas)  │                    │
     │                     │                   │ ◄──────────────│ PaymentReleased     │
     │                     │ status: SETTLED    │                │                    │
     │                     │ ──────────────────────────────────────────────────────► │
     │                     │ payment.settled    │                │                    │
```

> **用户零 Gas 体验**：用户在步骤 3 中仅进行链下签名 (EIP-3009 TypedData)，不发送任何链上交易，不需要持有 LAT。Relayer 代为提交并支付所有 Gas。

### 5.3 异常路径

**Direct Transfer 模式异常：**
1. 用户 30 分钟内未完成支付 -> Core 自动标记 EXPIRED -> Webhook 通知 MA 释放库存
2. 链上交易 10 分钟未确认 -> Core 发出告警 -> 人工介入
3. 用户余额不足导致链上 revert -> Core 检测到 `receipt.status === 0` -> 标记 TX_FAILED -> Webhook 通知 MA

**Escrow 模式异常 (新增)：**
1. 用户签名后 Relayer 提交失败 -> Core 重试 3 次 -> 仍失败则标记 TX_FAILED -> 通知用户重试
2. 商户超时未履约 (release_deadline 过期) -> Core 通过 Relayer 自动调用 `refund()` -> 资金退还用户 -> Webhook `payment.refunded`
3. 用户发起争议 -> 资金冻结 -> 仲裁人在 7 天内裁决 -> 按比例分配资金
4. Relayer LAT 余额不足 -> Balance Monitor 触发告警 -> 暂停新的 Escrow 支付 -> 管理员充值后恢复

---

## 六、会计标准合规

### 6.1 ISO 标准映射

XAgent Pay Core 严格遵循以下国际会计标准：

| 标准 | 映射字段 | 用途 |
| --- | --- | --- |
| **ISO 4217** (货币代码) | `instructed_currency: "USD"` | 报价的法币价值锚定 |
| **ISO 24165** (数字资产标识) | `dti_code: "4H95J0R2X"` | USDC 的 DTI 标识符 |
| **ISO 20022** (支付消息) | 见下表 | ERP/银行系统对账 |

### 6.2 ISO 20022 Payment Message 映射

| XAgent Pay 字段 | ISO 20022 XML Element | 业务含义 |
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
src/xagent-core/
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
│   │   │   ├── payment-router.ts       # v1.1: 支付模式路由
│   │   │   ├── instruction-builder.ts  # Direct 模式指令生成
│   │   │   ├── escrow-builder.ts       # v1.1: Escrow 模式指令生成 (EIP-3009)
│   │   │   ├── state-machine.ts        # 12 态状态机
│   │   │   └── timeout-handler.ts      # 超时处理 (含 Escrow 自动退款)
│   │   │
│   │   ├── chain/
│   │   │   ├── platon-client.ts     # XLayer RPC 客户端
│   │   │   ├── chain-watcher.ts     # 链上事件监听 (Transfer + Escrow)
│   │   │   ├── tx-tracker.ts        # 交易追踪
│   │   │   ├── usdc.ts             # USDC 合约交互
│   │   │   └── escrow-contract.ts   # v1.1: XAgent PayEscrow 合约交互
│   │   │
│   │   ├── relayer/                  # v1.1: Relayer 代付服务
│   │   │   ├── relayer-wallet.ts    # Relayer 钱包管理
│   │   │   ├── tx-queue.ts          # 交易队列 + nonce 管理
│   │   │   ├── balance-monitor.ts   # LAT 余额监控 + 告警
│   │   │   └── gas-estimator.ts     # Gas 估算
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
│       ├── orchestrate-payment.ts    # MCP Tool: 编排支付 (双模式路由)
│       ├── submit-tx.ts              # MCP Tool: 提交 tx_hash (Direct)
│       ├── submit-eip3009-sig.ts     # v1.1: MCP Tool: 提交 EIP-3009 签名 (Escrow)
│       ├── release-payment.ts        # v1.1: MCP Tool: 释放 Escrow 资金
│       ├── dispute-payment.ts        # v1.1: MCP Tool: 发起争议
│       ├── get-payment-status.ts     # MCP Tool: 查询状态
│       └── confirm-fulfillment.ts    # MCP Tool: 确认履约
│
├── package.json
├── tsconfig.json
└── skill.md                         # Core 能力描述

src/contracts/                        # v1.1: 智能合约 (Foundry 项目)
├── src/
│   └── XAgent PayEscrow.sol           # Escrow 合约
├── test/
│   └── XAgent PayEscrow.t.sol         # 合约测试
├── script/
│   └── Deploy.s.sol                 # 部署脚本
└── foundry.toml
```

### 7.2 技术栈

| 组件 | 技术选型 | 说明 |
| --- | --- | --- |
| Runtime | Node.js + TypeScript | 与现有 agent 一致 |
| MCP SDK | @modelcontextprotocol/sdk | MCP Server 实现 |
| 区块链交互 | viem | EIP-712 签名、ABI 编码、RPC 调用、EIP-3009 |
| 智能合约 | Solidity + Foundry | XAgent PayEscrow 合约开发与测试 |
| 合约依赖 | OpenZeppelin v5 | ReentrancyGuard, Ownable, SafeERC20 |
| 数据库 | Neon PostgreSQL | 与现有 agent 共用 |
| HTTP Client | 原生 fetch | Webhook 发送 |
| 定时任务 | node-cron 或 setInterval | 超时检测、链上轮询、自动退款 |

### 7.3 开发分期

#### Phase 1: 核心编排 + Direct Transfer (1-2 周)
- [ ] 数据库 migration (payments, payment_events, merchant_registry)
- [ ] 类型定义 (types.ts) — 含 Escrow 类型预留
- [ ] 安全模块：EIP-712 验签 + DID 解析（本地注册表）
- [ ] 12 态状态机实现 (支持双模式)
- [ ] Payment Router (支付模式路由)
- [ ] MCP Tool: `xagent_orchestrate_payment` (先实现 Direct 模式)
- [ ] MCP Tool: `xagent_get_payment_status`

#### Phase 2: 链上集成 (1-2 周)
- [ ] XLayer RPC 客户端
- [ ] USDC 合约交互（transfer calldata 编码）
- [ ] PaymentInstruction Builder (Direct 模式)
- [ ] Chain Watcher（USDC Transfer 事件监听）
- [ ] Transaction Tracker
- [ ] MCP Tool: `nexus_submit_tx`

#### Phase 3: Escrow 智能合约 (1-2 周) — v1.1 新增
- [ ] Foundry 项目搭建 (`src/contracts/`)
- [ ] XAgent PayEscrow.sol 合约实现 (EIP-3009 + 担保状态机)
- [ ] 合约测试 (Foundry test + fuzz + invariant)
- [ ] AI 审计 (Slither 静态分析)
- [ ] XLayer 测试网部署 + 验证
- [ ] EscrowInstruction Builder (EIP-3009 签名参数生成)
- [ ] Escrow 合约交互模块 (escrow-contract.ts)
- [ ] Chain Watcher 扩展 (监听 Escrow 合约事件)

#### Phase 4: Relayer 代付服务 (1 周) — v1.1 新增
- [ ] Relayer Wallet 管理 + 密钥安全
- [ ] Transaction Queue + nonce 管理
- [ ] Balance Monitor (LAT 余额监控 + 告警)
- [ ] MCP Tool: `nexus_submit_eip3009_signature`
- [ ] MCP Tool: `xagent_release_payment`
- [ ] MCP Tool: `xagent_dispute_payment`
- [ ] 超时自动退款定时任务 (通过 Relayer 调用 refund())

#### Phase 5: Webhook 通知 (1 周)
- [ ] Webhook Notifier 实现
- [ ] HMAC 签名
- [ ] 重试调度器
- [ ] Webhook 日志存储
- [ ] 新增事件: payment.escrowed, payment.refunded, dispute.opened, dispute.resolved
- [ ] Merchant Agent 接收端适配

#### Phase 6: 完善与测试 (1 周)
- [ ] MCP Tool: `xagent_confirm_fulfillment` (Escrow 模式触发 release)
- [ ] 端到端测试（UA -> Core -> Escrow Contract -> MA -> XLayer）
- [ ] ISO 20022 数据映射验证 (含 IFRS 15 Escrow 会计)
- [ ] Portal Dashboard（Core 管理界面）
- [ ] XLayer 主网合约部署

---

## 八、相关页面设计

### 8.1 XAgent Pay Core Portal Dashboard

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
| Tx Hash | 链上交易哈希（链接到 XLayer explorer） |
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
| **(v1.1) Escrow 使用率** | Escrow 支付数 / 总支付数 | 比率计算 | payments 表 payment_method |
| **(v1.1) 自动退款率** | REFUNDED 数 / Escrow 总数 | 比率计算 | payments 表 |
| **(v1.1) 争议率** | DISPUTE_OPEN 数 / Escrow 总数 | 比率计算 (目标 < 1%) | payments 表 |
| **(v1.1) Relayer 可用性** | Relayer 服务正常运行时间 | 99.9% SLA | Balance Monitor |
| **(v1.1) Relayer LAT 余额** | Relayer 钱包 LAT 余额 | 实时监控 | 链上查询 |

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
- [ ] **(v1.1)** Escrow 合约经过 AI 审计 (Slither + Foundry fuzz/invariant)
- [ ] **(v1.1)** Relayer 私钥通过 KMS 管理，最小权限原则
- [ ] **(v1.1)** EIP-3009 签名在 Relayer 提交前验证有效性
- [ ] **(v1.1)** Relayer 单笔交易限额，超额需审批
- [ ] **(v1.1)** Escrow 合约 ReentrancyGuard 防重入

### 10.2 威胁模型

| 威胁 | 影响 | 缓解措施 |
| --- | --- | --- |
| Quote 伪造 | 用户被引导支付到攻击者地址 | EIP-712 验签 + DID 解析收款地址 |
| 重放攻击 | 同一 Quote 被多次用于支付 | quote_hash 唯一约束 + expiry 检查 |
| Webhook 伪造 | 商户被虚假的支付成功通知欺骗 | HMAC 签名 + 时间戳验证 |
| 中间人攻击 | 篡改支付金额或地址 | EIP-712 签名覆盖所有关键字段 |
| DDoS | 服务不可用 | Rate limiting + 输入验证 |
| **(v1.1)** Escrow 合约重入攻击 | 资金被窃取 | ReentrancyGuard + checks-effects-interactions |
| **(v1.1)** Relayer 私钥泄露 | Relayer 被恶意控制 | KMS 管理 + 最小权限 + 速率限制 |
| **(v1.1)** EIP-3009 签名重放 | 用户资金被重复扣款 | bytes32 nonce 唯一性 + USDC 合约内置防重放 |
| **(v1.1)** 仲裁人串通 | 不公正裁决 | 初始 = nexusOperator，后续可升级为 DAO 多签 |
| **(v1.1)** Relayer 拒绝服务 | 无法提交链上交易 | Balance Monitor + 告警 + 备用 Relayer |

---

## 十一、改进建议与后续规划

### 11.1 MVP 后续优化

1. **链上 DID 注册表**：将 merchant_registry 迁移到 XLayer 链上 XAgent PayMerchantRegistry 合约
2. **完整风控系统**：部署 RFC-006 定义的 RiskGatekeeper（链下 AI + 链上 Permit）
3. **跨链支持**：实现 RFC-007 的 Hub-Spoke 架构，支持从 Base/Ethereum 入金；Escrow 合约地址可作为跨链 bridge 的 settlement 终点
4. **仲裁人去中心化**：从 nexusOperator 单人仲裁升级为 DAO 多签投票仲裁
5. **批量支付**：在 Escrow 合约基础上扩展 batch deposit/release
6. **ERP 集成**：提供 ISO 20022 XML 导出功能，直接对接银行系统；Escrow 模式遵循 IFRS 15 收入确认准则

### 11.2 已决策事项 (v1.1)

| 编号 | 议题 | 决策 | 来源 |
| --- | --- | --- | --- |
| 1 | XLayer USDC 支持哪种签名标准 | **EIP-3009** (transferWithAuthorization) | 用户确认 |
| 2 | Gas 费由谁承担 | **Relayer 代付**，从协议手续费 (0.3%) 覆盖 | 用户决策 |
| 3 | 仲裁人初始设置 | **arbiter = nexusOperator** (XAgent Pay 管理钱包)，后续可 `setArbiter()` 更换 | 用户决策 |
| 4 | 合约安全审计方式 | **AI 审计** + Slither + Foundry fuzz/invariant，不做外部审计 | 用户决策 |
| 5 | 支付模式 | **双模式并行**: Direct Transfer + Escrow Contract | RFC-010 |

### 11.3 待讨论项

1. XLayer 主网 USDC 合约地址需要确认
2. 是否需要 Quote 价格波动保护（锁价机制）？
3. 商户结算频率：Escrow 模式实时结算 vs 批量结算
4. Relayer 的 LAT 初始充值量和自动充值阈值
5. 争议仲裁的链下证据收集流程标准化

---

*文档结束。版本 1.1.0 - 2026-02-24*

**变更记录：**
| 版本 | 日期 | 变更内容 |
| --- | --- | --- |
| 1.0.0 | 2026-02-24 | 初始版本：Direct Transfer 模式 |
| 1.1.0 | 2026-02-24 | 新增 Escrow 智能合约模式、EIP-3009 + Relayer 代付、纠纷仲裁机制 (RFC-010) |
