# NexusPay Core 系统设计文档

| 元数据 | 内容 |
| --- | --- |
| **版本** | 1.0.0 |
| **状态** | Draft |
| **作者** | 系统架构师 (基于 PRD-001 v1.1 + RFC-010) |
| **创建日期** | 2026-02-24 |
| **依赖文档** | PRD-001 v1.1, RFC-010, RFC-005v2 |

---

## 目录

1. [模块总览](#1-模块总览)
2. [各模块详细设计](#2-各模块详细设计)
3. [模块间交互协议](#3-模块间交互协议)
4. [分阶段开发计划](#4-分阶段开发计划)
5. [技术决策记录](#5-技术决策记录)

---

## 1. 模块总览

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    外部调用方                                         │
│  User Agent (UA)                    Merchant Agent (MA)             │
│  [search → quote → sign → track]   [webhook recv → fulfill]        │
└──────────────┬──────────────────────────────┬──────────────────────┘
               │ MCP (Stdio/SSE)              │ Webhook HTTP POST
               ▼                              │
┌──────────────────────────────────────────────────────────────────────┐
│                      NexusPay Core Service                           │
│                                                                      │
│  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │  M1: 安全模块    │   │ M2: 支付路由模块  │   │ M3: 指令构建模块  │  │
│  │  SecurityModule  │   │  PaymentRouter   │   │ InstructionBuilder│ │
│  │                  │   │                  │   │                  │  │
│  │ - EIP-712 验签   │   │ - 模式路由决策   │   │ - Escrow 指令    │  │
│  │ - DID 解析       │   │ - 金额阈值判断   │   │ - EIP-3009 参数  │  │
│  │ - 防重放 Nonce   │   │ - 商户偏好读取   │   │ - Nonce 生成     │  │
│  │ - 权限控制       │   │                  │   │                  │  │
│  └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘  │
│           │                      │                      │            │
│  ┌────────▼──────────────────────▼──────────────────────▼─────────┐  │
│  │                  M4: 订单状态机 (OrderStateMachine)              │  │
│  │                                                                 │  │
│  │  12 态状态机:  CREATED → AWAITING_TX → BROADCASTED              │  │
│  │                → SETTLED / ESCROWED / TX_FAILED / EXPIRED       │  │
│  │                → COMPLETED / REFUNDED / DISPUTE_OPEN            │  │
│  │                → DISPUTE_RESOLVED / RISK_REJECTED               │  │
│  │  事件溯源 (append-only payment_events)                           │  │
│  └────────┬───────────────────────────────────────────────────────┘  │
│           │                                                          │
│  ┌────────▼─────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │ M5: 链上监听模块  │   │  M6: Relayer 模块 │   │ M7: Webhook 模块 │  │
│  │  ChainWatcher    │   │  RelayerService   │   │ WebhookNotifier  │  │
│  │                  │   │                  │   │                  │  │
│  │ - USDC Transfer  │   │ - EIP-3009 转发   │   │ - HMAC 签名      │  │
│  │ - Escrow 事件    │   │ - Gas 代付        │   │ - 指数退避重试   │  │
│  │ - 交易确认追踪   │   │ - Nonce 管理      │   │ - 幂等投递       │  │
│  │ - 超时自动退款   │   │ - 余额监控        │   │ - 投递日志       │  │
│  └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘  │
│           │                      │                      │            │
│  ┌────────▼──────────────────────▼──────────────────────▼─────────┐  │
│  │                    M8: 数据持久层 (Repository)                    │  │
│  │    PaymentRepo | EventRepo | MerchantRepo | WebhookRepo         │  │
│  └────────────────────────────┬────────────────────────────────────┘  │
└───────────────────────────────┼──────────────────────────────────────┘
                                │
              ┌─────────────────▼──────────────────┐
              │        PostgreSQL (Neon)            │
              │  payments | payment_events          │
              │  merchant_registry | webhook_logs   │
              └─────────────────────────────────────┘

                           │ (另行并行开发)
              ┌────────────▼────────────────────────┐
              │      PlatON 链 (chain_id: 210425)   │
              │  NexusPayEscrow.sol (M9)             │
              │  USDC (ERC-20 + EIP-3009)            │
              └─────────────────────────────────────┘
```

### 1.2 模块一览表

| 编号 | 模块名 | 核心职责 | 可独立测试 | 主要依赖 |
| --- | --- | --- | --- | --- |
| M1 | SecurityModule | EIP-712 验签、DID 解析、防重放、权限 | 是 (纯函数) | viem |
| M2 | PaymentRouter | 支付模式决策（MVP 阶段固定路由到 Escrow，预留 Direct 扩展） | 是 (纯函数) | M8 (MerchantRepo) |
| M3 | InstructionBuilder | 生成 PaymentInstruction / EscrowInstruction | 是 (纯函数) | viem, M8 |
| M4 | OrderStateMachine | 12 态生命周期管理、事件溯源、超时调度 | 是 (含 mock DB) | M8, M7 |
| M5 | ChainWatcher | PlatON 链上事件轮询、交易追踪、自动退款触发 | 集成测试 | viem, M4, M6 |
| M6 | RelayerService | EIP-3009 转发上链、Gas 代付、nonce 管理 | 集成测试 | viem, M5 |
| M7 | WebhookNotifier | HMAC 签名、HTTP 投递、指数退避重试 | 是 (mock server) | M8 |
| M8 | Repository | DB CRUD 封装，Repository Pattern | 是 (mock DB) | PostgreSQL |
| M9 | EscrowContract | Solidity 合约: 存入/释放/退款/争议 | 是 (Foundry) | OpenZeppelin |

---

## 2. 各模块详细设计

### M1: SecurityModule (安全模块)

**职责**：所有进入系统的 Quote 必须经过此模块验证。任何验证失败直接拒绝，不进入后续流程。

**对外接口**：

```typescript
// 文件: src/modules/security/index.ts

export interface VerifyQuoteResult {
  readonly valid: boolean;
  readonly signer?: Address;       // 恢复的签名者地址
  readonly merchant?: MerchantRecord; // DID 解析出的商户信息
  readonly error?: string;
}

export interface SecurityModule {
  /**
   * 验证 NUPS Quote 的 EIP-712 签名
   * 同时完成: 验签 + DID 解析 + 防重放 + 过期检查
   * @returns VerifyQuoteResult, valid=false 时附带 error 原因
   */
  verifyQuote(
    quotePayload: NexusQuotePayload,
    existingQuoteHash?: string,    // 已存在则直接幂等返回
  ): Promise<VerifyQuoteResult>;

  /**
   * 检查 nexus_payment_id 操作权限
   */
  checkPermission(
    operation: 'get_status' | 'confirm_fulfillment' | 'dispute',
    paymentId: string,
    callerAddress: Address,
  ): Promise<boolean>;

  /**
   * 计算 EIP-712 structHash (用于防重放索引)
   */
  computeQuoteHash(quotePayload: NexusQuotePayload): Hex;
}
```

**内部子模块**：

```
security/
├── eip712-verifier.ts    # verifyTypedData (viem), EIP-1271 合约钱包支持
├── did-resolver.ts       # MVP: 本地 merchant_registry 查表；后期: 链上合约
├── nonce-guard.ts        # quote_hash 唯一性 + expiry 时间戳检查
└── access-control.ts     # 操作权限矩阵
```

**数据所有权**：不拥有独立表，读取 `merchant_registry`。

**可独立验证标准**：
- `verifyQuote` 在已知商户 + 合法签名时返回 `{ valid: true }`
- 签名篡改时返回 `{ valid: false, error: "signature_mismatch" }`
- 过期 Quote 返回 `{ valid: false, error: "quote_expired" }`
- 重放 Quote 返回 `{ valid: false, error: "duplicate_quote_hash" }`

---

### M2: PaymentRouter (支付路由模块)

**职责**：根据商户配置和 Quote 属性，无状态地决定使用哪种支付模式。

**对外接口**：

```typescript
// 文件: src/modules/payment/payment-router.ts

export type PaymentMethod = 'DIRECT_TRANSFER' | 'ESCROW_CONTRACT';

export interface RouterDecision {
  readonly method: PaymentMethod;
  readonly reason: string;   // 调试用: 说明为何选择此模式
}

export interface PaymentRouter {
  /**
   * 纯函数，无副作用，无 IO
   * 优先级: Quote 显式指定 > 商户默认 > 金额阈值
   */
  decide(
    quotePayload: NexusQuotePayload,
    merchant: MerchantRecord,
    config: RouterConfig,
  ): RouterDecision;
}

export interface RouterConfig {
  readonly escrowThresholdUsdc: number;  // 默认 100 USDC
}
```

**路由规则**：

MVP 阶段固定路由到 `ESCROW_CONTRACT`，类型定义预留 `DIRECT_TRANSFER` 供后续扩展。

| 优先级 | 条件 | 结果 | 备注 |
| --- | --- | --- | --- |
| 1 | MVP 阶段 | ESCROW_CONTRACT | 所有支付统一走 Escrow |

> 后续扩展时可恢复多规则路由（Quote 显式指定 > 商户偏好 > 金额阈值 > 默认）。

**数据所有权**：无，读取 MerchantRecord (来自 M8)。

**可独立验证标准**：纯函数，单元测试验证固定返回 ESCROW_CONTRACT 即可。

---

### M3: InstructionBuilder (指令构建模块)

**职责**：根据路由结果生成 UA 可直接使用的支付指令（含链上调用数据或 EIP-3009 签名参数）。

**对外接口**：

```typescript
// 文件: src/modules/payment/instruction-builder.ts

export interface InstructionBuilder {
  // buildDirectInstruction: 预留接口，MVP 阶段不实现
  // buildDirectInstruction(payment, merchant): PaymentInstruction;

  /**
   * 构建 Escrow 模式支付指令 (MVP 唯一实现)
   * 返回包含 EIP-3009 TypedData 的签名参数，供用户 eth_signTypedData_v4
   * 关键: 生成 bytes32 nonce 用于防重放
   */
  buildEscrowInstruction(
    payment: PaymentRecord,
    merchant: MerchantRecord,
    escrowConfig: EscrowConfig,
  ): EscrowInstruction;
}

export interface EscrowConfig {
  readonly escrowContractAddress: Address;
  readonly usdcContractAddress: Address;
  readonly releaseTimeoutSeconds: number;  // 默认 86400 (24h)
  readonly disputeWindowSeconds: number;   // 默认 259200 (72h)
}
```

**依赖**：viem (ABI 编码, keccak256), M8 (读取商户地址)。

**数据所有权**：不写库，仅生成内存中的指令对象。

**可独立验证标准**：
- `eip3009_sign_data.message.to` 等于 escrowContractAddress
- `eip3009_sign_data.message.nonce` 每次调用产生唯一的 bytes32
- `eip3009_sign_data.message.value` 等于支付金额 (uint256)

---

### M4: OrderStateMachine (订单状态机)

**职责**：支付订单的完整生命周期管理，是系统的核心协调模块。强制状态转换合法性，写入不可变事件日志，调度超时处理。

**对外接口**：

```typescript
// 文件: src/modules/payment/state-machine.ts

export interface OrderStateMachine {
  /**
   * 创建新支付订单 (初始状态: CREATED)
   * 写入 payments 表 + payment_events 表
   */
  createPayment(params: CreatePaymentParams): Promise<PaymentRecord>;

  /**
   * 状态转换 (强制合法性校验)
   * 非法转换抛出 InvalidTransitionError
   */
  transition(
    nexusPaymentId: string,
    targetStatus: PaymentStatus,
    metadata: Record<string, unknown>,
  ): Promise<PaymentRecord>;

  /**
   * 定时任务: 扫描并处理超时订单
   * - AWAITING_TX 超时 30min → EXPIRED
   * - ESCROWED 超时 release_deadline → 触发 Relayer 自动退款
   */
  runTimeoutSweep(): Promise<void>;

  /**
   * 查询订单 (by nexus_payment_id 或 merchant_order_ref)
   */
  getPayment(
    by: { nexusPaymentId: string } | { merchantOrderRef: string },
  ): Promise<PaymentRecord | null>;
}

// 合法状态转换表 (编码为 Map<from, Set<to>>)
export const VALID_TRANSITIONS: ReadonlyMap<PaymentStatus, ReadonlySet<PaymentStatus>>;
```

**状态转换合法性表**：

```
CREATED        → [AWAITING_TX, EXPIRED, RISK_REJECTED]
AWAITING_TX    → [BROADCASTED, EXPIRED, RISK_REJECTED]
BROADCASTED    → [SETTLED, ESCROWED, TX_FAILED, RISK_REJECTED]
SETTLED        → [COMPLETED]
ESCROWED       → [SETTLED, REFUNDED, DISPUTE_OPEN]
DISPUTE_OPEN   → [DISPUTE_RESOLVED]
# 以下为终态，不可再转换:
COMPLETED, EXPIRED, TX_FAILED, RISK_REJECTED, REFUNDED, DISPUTE_RESOLVED
```

**数据所有权**：拥有 `payments` 表和 `payment_events` 表的写权限。

**超时任务调度策略**：

| 扫描任务 | 频率 | 逻辑 |
| --- | --- | --- |
| 等待超时扫描 | 每 30s | `AWAITING_TX` 且 `expires_at < NOW()` → EXPIRED |
| Escrow 退款扫描 | 每 60s | `ESCROWED` 且 `release_deadline < NOW()` → 通知 RelayerService 调用 `refund()` |
| 告警扫描 | 每 60s | `BROADCASTED` 且超 10min 未确认 → 告警日志 |

**可独立验证标准**：
- 合法转换成功，事件写入 `payment_events`
- 非法转换抛出 `InvalidTransitionError`，数据库未被修改
- 超时扫描准确触发 EXPIRED 和 Relayer 退款回调

---

### M5: ChainWatcher (链上监听模块)

**职责**：持续轮询 PlatON 链，捕获 USDC Transfer 事件和 NexusPayEscrow 合约事件，驱动订单状态更新。

**对外接口**：

```typescript
// 文件: src/modules/chain/chain-watcher.ts

export interface ChainWatcher {
  /**
   * 启动轮询 (每 3 秒)
   * 内部维护 lastProcessedBlock，断点续传
   */
  start(): Promise<void>;

  /**
   * 主动追踪单笔交易 (Direct 模式: UA 提交 tx_hash 后调用)
   * 轮询直到 receipt 确认或超时
   */
  trackTransaction(
    nexusPaymentId: string,
    txHash: Hex,
    mode: 'direct' | 'escrow',
  ): Promise<void>;

  stop(): void;
}

// ChainWatcher 内部触发的回调 (注入到 OrderStateMachine)
export interface ChainEventHandler {
  onDirectTransferConfirmed(event: UsdcTransferEvent): Promise<void>;
  onEscrowDeposited(event: EscrowDepositedEvent): Promise<void>;
  onEscrowReleased(event: EscrowReleasedEvent): Promise<void>;
  onEscrowRefunded(event: EscrowRefundedEvent): Promise<void>;
  onEscrowDisputed(event: EscrowDisputedEvent): Promise<void>;
  onDisputeResolved(event: DisputeResolvedEvent): Promise<void>;
  onTransactionFailed(nexusPaymentId: string, txHash: Hex): Promise<void>;
}
```

**内部子模块**：

```
chain/
├── platon-client.ts       # createPublicClient (viem), PlatON RPC
├── usdc-watcher.ts        # 过滤 USDC Transfer logs
├── escrow-watcher.ts      # 过滤 NexusPayEscrow 事件 logs
├── tx-tracker.ts          # 单笔交易追踪 (轮询 receipt)
└── chain-watcher.ts       # 编排以上子模块
```

**数据所有权**：不拥有表，调用 M4 触发状态转换。

**可独立验证标准**：
- 检测到 USDC Transfer 后，对应 payment 状态变为 SETTLED
- 检测到 PaymentDeposited 后，对应 payment 状态变为 ESCROWED
- Relayer 退款后，检测到 PaymentRefunded，状态变为 REFUNDED

---

### M6: RelayerService (Relayer 代付模块)

**职责**：持有 LAT，代用户将 EIP-3009 签名提交到 NexusPayEscrow 合约，并代 Core 调用 release/refund。

**对外接口**：

```typescript
// 文件: src/modules/relayer/relayer-service.ts

export interface RelayerService {
  /**
   * 提交 EIP-3009 授权，调用 Escrow.depositWithAuthorization()
   * 内部: nonce 管理 + Gas 估算 + 发送 + 等待确认
   * @returns deposit 交易的 tx_hash
   */
  submitDeposit(params: DepositParams): Promise<Hex>;

  /**
   * 调用 Escrow.release() 释放资金给商户
   */
  submitRelease(paymentId: string, paymentIdBytes32: Hex): Promise<Hex>;

  /**
   * 调用 Escrow.refund() 超时退款 (超时扫描器触发)
   */
  submitRefund(paymentId: string, paymentIdBytes32: Hex): Promise<Hex>;

  /**
   * 查询 Relayer 钱包 LAT 余额
   */
  getLatBalance(): Promise<bigint>;
}

export interface DepositParams {
  readonly paymentIdBytes32: Hex;
  readonly payer: Address;
  readonly merchant: Address;
  readonly amount: bigint;
  readonly orderRef: Hex;         // keccak256(merchant_order_ref)
  readonly merchantDid: Hex;      // keccak256(merchant_did)
  readonly contextHash: Hex;
  // EIP-3009 签名参数
  readonly validAfter: bigint;
  readonly validBefore: bigint;
  readonly nonce: Hex;
  readonly v: number;
  readonly r: Hex;
  readonly s: Hex;
}
```

**内部子模块**：

```
relayer/
├── relayer-wallet.ts      # WalletClient (viem), 私钥安全注入
├── tx-queue.ts            # 串行队列 + nonce 自增管理 + 重试 (最多 3 次)
├── balance-monitor.ts     # 定时查询 LAT 余额, 低于阈值时告警/暂停
└── gas-estimator.ts       # estimateGas, 加 20% buffer
```

**安全约束**：
- Relayer 私钥通过环境变量注入，绝不硬编码
- 单笔交易上限：由合约 `coreOperators` 权限控制
- LAT 余额告警阈值：可配置（默认 0.1 LAT）

**可独立验证标准**：
- 测试网 submitDeposit 成功，返回有效 tx_hash
- nonce 管理正确（并发场景下不产生 nonce 冲突）
- LAT 不足时拒绝新任务并告警

---

### M7: WebhookNotifier (Webhook 通知模块)

**职责**：将支付状态变更以 HMAC 签名的 HTTP POST 推送给商户，保证至少投递一次。

**对外接口**：

```typescript
// 文件: src/modules/webhook/notifier.ts

export interface WebhookNotifier {
  /**
   * 异步触发投递 (非阻塞，写入队列后立即返回)
   * 幂等：同一 event_id 不会重复投递
   */
  notify(
    payment: PaymentRecord,
    eventType: WebhookEventType,
  ): Promise<void>;

  /**
   * 定时重试未成功投递 (由调度器触发)
   * 读取 webhook_delivery_logs 中 delivered_at IS NULL 且 attempt < 5 的记录
   */
  retryPending(): Promise<void>;
}

export type WebhookEventType =
  | 'payment.created'
  | 'payment.escrowed'    // Escrow 模式: 资金锁定
  | 'payment.settled'     // 资金到账 (Direct 确认 或 Escrow release)
  | 'payment.expired'
  | 'payment.failed'
  | 'payment.refunded'    // Escrow 模式: 超时退款
  | 'dispute.opened'      // Escrow 模式: 用户发起争议
  | 'dispute.resolved';   // Escrow 模式: 仲裁完成
```

**重试策略**（指数退避）：

| 次数 | 延迟 |
| --- | --- |
| 1 (首次) | 立即 |
| 2 | 10s |
| 3 | 30s |
| 4 | 2min |
| 5 | 10min |
| > 5 | 放弃，人工处理 |

**HMAC 签名计算**：
```
signature = HMAC-SHA256(merchant.webhook_secret, unix_timestamp + "." + json_body)
Header: X-Nexus-Signature: sha256=<hex>
```

**数据所有权**：拥有 `webhook_delivery_logs` 表。

**可独立验证标准**：
- HTTP 200 → `delivered_at` 更新
- HTTP 5xx → 写入 `next_retry_at`，下次执行时重试
- HMAC 签名可由商户端独立验证

---

### M8: Repository (数据持久层)

**职责**：封装所有数据库操作，向上层模块提供类型安全的接口，屏蔽 SQL 细节。

**对外接口**：

```typescript
// 文件: src/db/

// payment-repo.ts
export interface PaymentRepository {
  insert(params: CreatePaymentParams): Promise<PaymentRecord>;
  findById(id: string): Promise<PaymentRecord | null>;
  findByOrderRef(ref: string): Promise<PaymentRecord | null>;
  findByQuoteHash(hash: string): Promise<PaymentRecord | null>;
  updateStatus(id: string, status: PaymentStatus, extraFields?: Partial<PaymentRecord>): Promise<PaymentRecord>;
  findExpiredAwaiting(before: Date): Promise<PaymentRecord[]>;
  findExpiredEscrowed(before: Date): Promise<PaymentRecord[]>;  // 超时退款扫描
}

// event-repo.ts
export interface EventRepository {
  append(event: CreateEventParams): Promise<PaymentEvent>;  // append-only
  findByPaymentId(id: string): Promise<PaymentEvent[]>;
}

// merchant-repo.ts
export interface MerchantRepository {
  findByDid(did: string): Promise<MerchantRecord | null>;
  listAll(): Promise<MerchantRecord[]>;
}

// webhook-repo.ts
export interface WebhookRepository {
  insert(log: CreateWebhookLogParams): Promise<WebhookDeliveryLog>;
  markDelivered(logId: string, responseStatus: number): Promise<void>;
  markFailed(logId: string, nextRetryAt: Date): Promise<void>;
  findPendingRetries(): Promise<WebhookDeliveryLog[]>;
}
```

**数据库 Schema**（完整定义见 PRD-001 v1.1 §子功能 C.4，此处仅列迁移文件规划）：

```
db/migrations/
├── 001_initial_schema.sql        # 已有: orders, flight/hotel templates
├── 002_add_payer_wallet.sql      # 已有: orders.payer_wallet
├── 003_nexus_core_schema.sql     # 新增: payments, payment_events,
│                                 #        merchant_registry, webhook_delivery_logs
└── 004_escrow_fields.sql         # 新增: payments 表 Escrow 专用字段
```

**可独立验证标准**：
- 每个 Repository 有对应的集成测试，使用测试数据库或 in-memory mock
- `append-only` 约束：EventRepository 不暴露 update/delete 接口

---

### M9: EscrowContract (智能合约模块)

**职责**：部署在 PlatON 链上的 NexusPayEscrow.sol，独立于 Core Service 开发，通过链上事件与 Core 交互。

**合约接口（已由 RFC-010 完整定义）**：

```solidity
// 核心函数签名
function depositWithAuthorization(
    bytes32 _paymentId, address _from, address _merchant,
    uint256 _amount, bytes32 _orderRef, bytes32 _merchantDid, bytes32 _contextHash,
    uint256 _validAfter, uint256 _validBefore, bytes32 _nonce,
    uint8 _v, bytes32 _r, bytes32 _s
) external nonReentrant;

function release(bytes32 _paymentId) external nonReentrant onlyCoreOrMerchant(_paymentId);
function refund(bytes32 _paymentId) external nonReentrant;           // 公开，超时后任何人可调用
function dispute(bytes32 _paymentId, string calldata _reason) external nonReentrant onlyPayer(_paymentId);
function resolve(bytes32 _paymentId, bool _toMerchant, uint256 _merchantAmount)
    external nonReentrant onlyArbiter;
```

**合约项目结构**：

```
src/contracts/
├── src/
│   └── NexusPayEscrow.sol         # 合约主体
├── test/
│   ├── NexusPayEscrow.t.sol       # 单元 + 集成测试
│   ├── NexusPayEscrow.fuzz.t.sol  # 模糊测试
│   └── NexusPayEscrow.inv.t.sol   # 不变量测试
├── script/
│   ├── Deploy.s.sol               # 部署脚本
│   └── Verify.s.sol               # 验证脚本
└── foundry.toml
```

**安全保障清单**：
- ReentrancyGuard：所有状态变更函数
- checks-effects-interactions 模式
- SafeERC20：所有 ERC-20 操作
- 状态机严格约束（NONE → DEPOSITED 是唯一入口）
- Slither 静态分析 + Foundry fuzz/invariant 测试

**可独立验证标准**：
- `forge test --gas-report` 全部通过
- 不变量：合约 USDC 余额 = 所有 DEPOSITED 状态的 amount 之和
- Slither 无 HIGH 级别告警

---

## 3. 模块间交互协议

### 3.1 核心数据流：Escrow 模式完整调用链

```
UA 调用: nexus_orchestrate_payment(quote, payer_wallet)
  │
  ▼
M1.SecurityModule.verifyQuote(quote)
  → 成功: { merchant: MerchantRecord }
  → 失败: throw SecurityError
  │
  ▼
M2.PaymentRouter.decide(quote, merchant, config)
  → { method: 'ESCROW_CONTRACT' }
  │
  ▼
M4.OrderStateMachine.createPayment(...)     ← 写 payments 表
  → PaymentRecord { status: CREATED }
  │
  ▼
M3.InstructionBuilder.buildEscrowInstruction(payment, merchant, escrowConfig)
  → EscrowInstruction (含 eip3009_sign_data)
  │
  ▼ 返回给 UA
  [UA 调用用户钱包 eth_signTypedData_v4(eip3009_sign_data) → 获得 (v, r, s)]

UA 调用: nexus_submit_eip3009_signature(paymentId, v, r, s)
  │
  ▼
M4.transition(paymentId, 'BROADCASTED', { v, r, s })  ← 写 payment_events
  │
  ▼
M6.RelayerService.submitDeposit(params with v,r,s)
  → deposit_tx_hash
  │
  ▼ (等待链上事件)
M5.ChainWatcher 检测到 PaymentDeposited 事件
  │
  ▼
M4.transition(paymentId, 'ESCROWED', { deposit_tx_hash, ... })
  │
  ▼
M7.WebhookNotifier.notify(payment, 'payment.escrowed')
  → HTTP POST 到 merchant webhook_url

[商户履约后调用]: nexus_confirm_fulfillment(paymentId, merchantDid, proof)
  │
  ▼
M6.RelayerService.submitRelease(paymentId, paymentIdBytes32)
  → release_tx_hash
  │
  ▼
M5.ChainWatcher 检测到 PaymentReleased 事件
  │
  ▼
M4.transition(paymentId, 'SETTLED', { release_tx_hash, ... })
  │
  ▼
M7.WebhookNotifier.notify(payment, 'payment.settled')
```

### 3.2 模块间接口约定

**错误处理约定**：

```typescript
// 所有模块抛出的错误必须继承自 NexusError
export class NexusError extends Error {
  constructor(
    public readonly code: string,   // 机器可读，如 "SIGNATURE_MISMATCH"
    message: string,                // 人类可读
    public readonly context?: Record<string, unknown>,
  ) { super(message); }
}

// 具体错误类型
export class SecurityError extends NexusError {}
export class InvalidTransitionError extends NexusError {}
export class RelayerError extends NexusError {}
export class ChainError extends NexusError {}
```

**不可变数据约定**：

```typescript
// 所有传递的对象必须是 readonly 的
// 状态更新通过 Repository 产生新记录，不修改原对象
// 错误示例 (禁止):
payment.status = 'SETTLED';  // 违反不可变原则

// 正确示例:
const updated = await orderStateMachine.transition(payment.id, 'SETTLED', meta);
// payment 对象不变，updated 是新的 PaymentRecord
```

**模块依赖注入**：

```typescript
// 通过构造函数注入依赖，便于测试替换 Mock
// 文件: src/container.ts

export function createContainer(config: Config) {
  const db = createDbPool(config.databaseUrl);

  const merchantRepo = new MerchantRepository(db);
  const paymentRepo = new PaymentRepository(db);
  const eventRepo = new EventRepository(db);
  const webhookRepo = new WebhookRepository(db);

  const securityModule = new SecurityModule(merchantRepo);
  const paymentRouter = new PaymentRouter();
  const instructionBuilder = new InstructionBuilder(config);
  const webhookNotifier = new WebhookNotifier(webhookRepo);
  const relayerService = new RelayerService(config.relayerPrivateKey, config.escrowContractAddress);
  const chainWatcher = new ChainWatcher(config.platonRpcUrl, paymentRepo, orderStateMachine);
  const orderStateMachine = new OrderStateMachine(paymentRepo, eventRepo, webhookNotifier, relayerService);

  return { securityModule, paymentRouter, instructionBuilder, orderStateMachine, chainWatcher, relayerService };
}
```

### 3.3 MCP Tool 与模块的映射关系

| MCP Tool | 调用路径 |
| --- | --- |
| `nexus_orchestrate_payment` | M1 → M2 → M4.create → M3.build → 返回 |
| `nexus_submit_tx` | M4.transition(BROADCASTED) → M5.trackTransaction |
| `nexus_submit_eip3009_signature` | M4.transition(BROADCASTED) → M6.submitDeposit |
| `nexus_get_payment_status` | M4.getPayment → 返回 |
| `nexus_confirm_fulfillment` | M1.checkPermission → M6.submitRelease → M5 等待事件 |
| `nexus_release_payment` | M1.checkPermission → M6.submitRelease |
| `nexus_dispute_payment` | M1.checkPermission → M6.submitDispute |

---

## 4. 分阶段开发计划

### 总体原则

- 每个阶段结束后必须有可独立运行和验证的产物
- 模块间通过接口和 Mock 解耦，允许并行开发
- **仅实现 Escrow 合约模式**，不实现 Direct Transfer 链上集成（已取消）
- Escrow 合约 (M9) 与 Core 服务 (M1~M8) 并行开发
- 先完成核心路径，再补充异常场景

### Phase 0: 基础设施准备（预估 2-3 天）

**目标**：建立开发环境和共享基础，后续所有 Phase 都依赖此基础。

**任务**：

| 编号 | 任务 | 负责模块 |
| --- | --- | --- |
| P0-1 | 初始化 `src/nexus-core/` 目录，配置 TypeScript + ESLint + Vitest | 基础 |
| P0-2 | 定义全量类型文件 `types.ts`（含 PaymentStatus, PaymentRecord, MerchantRecord, 所有 Instruction 类型） | 基础 |
| P0-3 | 编写 Migration 003：payments, payment_events, merchant_registry, webhook_delivery_logs | M8 |
| P0-4 | 编写 Migration 004：payments 表的 Escrow 专用字段 | M8 |
| P0-5 | 实现 M8 Repository 层（含单元测试用 mock） | M8 |
| P0-6 | 写入测试商户数据（flight-agent, hotel-agent 对应的 MerchantRecord） | M8 |
| P0-7 | 初始化 Foundry 项目 `src/contracts/`（并行，不阻塞后续） | M9 |

**阶段验证标准**：
- `npm run migrate` 成功，数据库表结构正确
- `npm test src/db/` 全部通过
- 测试商户数据可查询

**衔接后续阶段**：P0 完成后，P1 和 M9 合约开发可同时启动。

---

### Phase 1: 安全验签 + 订单创建（预估 4-5 天）

**目标**：实现支付流程的"入口关卡"。UA 能调用 `nexus_orchestrate_payment` 成功创建订单并拿到支付指令（此阶段先返回 mock 指令）。

**任务**：

| 编号 | 任务 | 负责模块 |
| --- | --- | --- |
| P1-1 | 实现 M1 SecurityModule（EIP-712 验签 + DID 解析 + 防重放） | M1 |
| P1-2 | 为 M1 编写完整单元测试（正常签名 / 篡改签名 / 过期 / 重放） | M1 |
| P1-3 | 实现 M2 PaymentRouter（5 条路由规则） | M2 |
| P1-4 | 为 M2 编写单元测试（覆盖所有分支） | M2 |
| P1-5 | 实现 M4 OrderStateMachine（createPayment + transition + VALID_TRANSITIONS 校验） | M4 |
| P1-6 | 为 M4 编写单元测试（合法/非法转换，事件写入验证） | M4 |
| P1-7 | 实现 MCP Server 骨架 + `nexus_orchestrate_payment` Tool（返回 mock 指令） | MCP |
| P1-8 | 实现 `nexus_get_payment_status` Tool | MCP |

**阶段验证标准**：
```bash
# 以下命令可执行且通过
curl -X POST .../nexus_orchestrate_payment \
  -d '{ "quote_payload": <有效Quote>, "payer_wallet": "0x..." }'
# 返回: { nexus_payment_id, status: "AWAITING_TX", payment_method: "DIRECT_TRANSFER/ESCROW_CONTRACT", ... }

npm test src/modules/security/  # 全部通过
npm test src/modules/payment/   # 全部通过
```

**与 Phase 0 的衔接**：P0 的 types.ts 和 M8 Repository 直接被 P1 使用。

---

### Phase 2: Escrow 智能合约（预估 5-7 天，与 Phase 1 可部分并行）

**目标**：NexusPayEscrow.sol 在 PlatON 测试网部署完毕，通过 Foundry 全量测试。

**任务**：

| 编号 | 任务 | 负责模块 |
| --- | --- | --- |
| P2-1 | 实现 NexusPayEscrow.sol 核心逻辑（depositWithAuthorization, release, refund, dispute, resolve） | M9 |
| P2-2 | 编写 Foundry 单元测试（每个函数的正常路径 + 权限校验 + 状态机非法转换） | M9 |
| P2-3 | 编写 fuzz 测试（金额边界、任意地址、任意 nonce） | M9 |
| P2-4 | 编写 invariant 测试（合约余额 = sum(DEPOSITED.amount)） | M9 |
| P2-5 | Slither 静态分析，修复所有 HIGH/MEDIUM 告警 | M9 |
| P2-6 | PlatON 测试网部署 + 验证合约功能 | M9 |
| P2-7 | 输出合约 ABI 文件，供 Core 服务使用 | M9 |

**阶段验证标准**：
```bash
cd src/contracts
forge test -vvv              # 全部通过
forge coverage              # 覆盖率 > 90%
slither src/NexusPayEscrow.sol  # 无 HIGH 告警
# PlatON 测试网合约地址: 0x...（记录在配置文件中）
```

---

### Phase 3: Relayer + Escrow Core 集成（预估 5-7 天）

**目标**：Escrow 模式完整闭环。用户仅需签名，Relayer 代为上链，Core 自动监听合约事件驱动状态机。

**前置条件**：Phase 1 和 Phase 2 均完成。

**任务**：

| 编号 | 任务 | 负责模块 |
| --- | --- | --- |
| P3-1 | 实现 M3 EscrowInstruction Builder（EIP-3009 签名参数生成，nonce 唯一性） | M3 |
| P3-2 | 为 M3 编写单元测试 | M3 |
| P3-3 | 实现 M5 PlatON 客户端 + Escrow 合约事件监听（PaymentDeposited/Released/Refunded/Disputed/Resolved） | M5 |
| P3-4 | 实现 M5 交易追踪（trackTransaction for Escrow deposit/release tx） | M5 |
| P3-5 | 实现 M6 RelayerService（submitDeposit + submitRelease + submitRefund） | M6 |
| P3-6 | 实现 M6 Transaction Queue（串行队列 + nonce 管理 + 3 次重试） | M6 |
| P3-7 | 实现 M6 Balance Monitor（定时查询 LAT 余额 + 低余额告警） | M6 |
| P3-8 | 实现 M4 超时扫描（AWAITING_TX 30min → EXPIRED；ESCROWED + release_deadline 过期 → 触发 M6.submitRefund） | M4 |
| P3-9 | 实现 MCP Tool: `nexus_submit_eip3009_signature` | MCP |
| P3-10 | 实现 MCP Tool: `nexus_release_payment` | MCP |
| P3-11 | 实现 MCP Tool: `nexus_dispute_payment` | MCP |
| P3-12 | 端到端集成测试（Escrow 完整流程） | 集成 |

**阶段验证标准**（完整 Escrow 流程可执行）：
```
1. nexus_orchestrate_payment → 得到 EscrowInstruction (含 eip3009_sign_data)
2. 用户钱包签名 eth_signTypedData_v4 → 获得 (v, r, s)
3. nexus_submit_eip3009_signature(paymentId, v, r, s)
4. Relayer 自动上链，等待约 5s
5. nexus_get_payment_status → { status: "ESCROWED" }
6. nexus_confirm_fulfillment(paymentId, merchantDid)
7. Relayer 调用 release()，等待约 5s
8. nexus_get_payment_status → { status: "SETTLED" }

# 超时退款测试 (设置极短 release timeout):
5b. 等待 release_deadline 过期
6b. 超时扫描器触发 Relayer.submitRefund()
7b. nexus_get_payment_status → { status: "REFUNDED" }
```

---

### Phase 4: Webhook 通知（预估 3-4 天）

**目标**：所有状态变更都能可靠地推送给商户，flight-agent 和 hotel-agent 能收到并处理。

**任务**：

| 编号 | 任务 | 负责模块 |
| --- | --- | --- |
| P4-1 | 实现 M7 WebhookNotifier（HTTP POST + HMAC 签名） | M7 |
| P4-2 | 实现 M7 重试调度器（读取 pending 记录 + 指数退避） | M7 |
| P4-3 | 为 M7 编写单元测试（mock HTTP server，验证 HMAC 签名 + 重试逻辑） | M7 |
| P4-4 | 在 M4 所有 transition 回调中接入 M7.notify() | M4+M7 |
| P4-5 | flight-agent / hotel-agent 增加 Webhook 接收端点 | Merchant |
| P4-6 | ISO 20022 元数据组装（iso_metadata 字段填充） | M4 |

**阶段验证标准**：
```
1. 完成 Escrow 支付流程
2. 观察 flight-agent/hotel-agent 日志，收到 payment.escrowed / payment.settled Webhook
3. 验证 X-Nexus-Signature Header 签名正确
4. 模拟 Webhook 接收方返回 500 → 确认 next_retry_at 被写入
5. 等待重试 → 确认最终成功投递
```

---

### Phase 5: 质量收尾（预估 3-4 天）

**目标**：系统达到生产可用标准，PlatON 主网合约部署就绪。

**任务**：

| 编号 | 任务 |
| --- | --- |
| P5-1 | 实现 MCP Tool: `nexus_confirm_fulfillment`（Escrow 模式触发 release） |
| P5-2 | Portal Dashboard 扩展（Escrow 状态显示、Relayer 余额监控） |
| P5-3 | 端到端全流程测试（Escrow 正常 + Escrow 超时退款 + Escrow 争议裁决 三条完整路径） |
| P5-4 | ISO 20022 数据映射验证（所有字段正确填充） |
| P5-5 | 安全清单最终复查（PRD-001 §十 安全清单逐项确认） |
| P5-6 | PlatON 主网合约部署（基于 Phase 2 已验证代码） |
| P5-7 | 性能验证（验签 < 50ms，状态机转换 < 100ms） |
| P5-8 | 更新 flight-agent / hotel-agent 的 webhook_url 到商户注册表 |

**阶段验证标准（最终上线标准）**：
- 所有单元测试通过，覆盖率 > 80%
- 三条端到端流程无报错：Escrow 正常、Escrow 超时退款、Escrow 争议裁决
- PlatON 主网合约已部署，地址记录在配置文件
- Portal Dashboard 可显示实时数据
- Relayer 钱包已充值足量 LAT（≥ 10 LAT 初始量）

---

### 阶段里程碑总结

```
Phase 0 ────────────────────────────── Day 3
  ↓ 基础设施 + 数据库 Schema + 类型定义
Phase 1 ────────────────── Day 8       Phase 2 (并行) ─── Day 10
  ↓ 安全验签 + 订单创建 (无链上)        ↓ Escrow 合约部署+测试
Phase 3 ────────────────────────────── Day 17
  ↓ Escrow + Relayer 完整集成
Phase 4 ────────────────────────────── Day 21
  ↓ Webhook 通知 + 商户接收
Phase 5 ────────────────────────────── Day 25
  ↓ 质量收尾 + 主网部署
```

---

## 5. 技术决策记录

### ADR-001: Repository Pattern 强制分离数据访问

**决策**：所有数据库操作通过 Repository 接口访问，禁止在业务逻辑中直接写 SQL。

**背景**：现有 flight-agent 的 `order-store.ts` 已经体现了此模式（内存 + DB 双实现），证明了其可测试性价值。

**理由**：
- 单元测试可替换 mock Repository，无需真实数据库
- 数据库迁移（如从 Neon 换到其他 Postgres）只需修改实现层
- 强制分离防止业务逻辑中出现 SQL 注入风险

**替代方案**：直接使用 Drizzle/Prisma ORM。暂不引入，因为项目已有 `pg` 直连模式，引入 ORM 增加学习成本。

---

### ADR-002: EIP-3009 而非 EIP-2612 (Permit)

**决策**：Escrow 模式采用 EIP-3009 `transferWithAuthorization` 而非 EIP-2612 `permit`。

**背景**：由 PRD-001 v1.1 §11.2 第 1 项决策记录，用户已确认。

**理由**：
- PlatON 链上 USDC 已支持 EIP-3009
- EIP-3009 的 `validAfter/validBefore` 时间窗口比 EIP-2612 更灵活
- `nonce` 为 bytes32 随机值，比 EIP-2612 的顺序 nonce 更安全（无顺序推断问题）

**影响**：EscrowInstruction 中的签名参数使用 `TransferWithAuthorization` TypedData，而非 `Permit` TypedData。

---

### ADR-003: Relayer 作为 Core 子模块而非独立服务

**决策**：Relayer 以模块形式嵌入 NexusPay Core 进程，不作为独立微服务部署。

**理由**：
- MVP 阶段复杂度控制：避免引入服务间通信、认证等新问题
- 单进程内依赖注入更简单，测试更容易
- Relayer 负载在 MVP 阶段极低，不需要水平扩展

**风险**：Core 进程重启会中断进行中的 Relayer 交易。缓解：Transaction Queue 状态持久化到数据库，重启后可从数据库恢复。

**后续扩展路径**：当 Escrow 交易量增大时，可将 Relayer 独立为微服务，通过消息队列（如 Redis Streams）与 Core 解耦。

---

### ADR-004: 状态机转换表编码为常量

**决策**：合法状态转换编码为 `Map<PaymentStatus, Set<PaymentStatus>>` 常量，而非 if-else 或 switch。

**理由**：
- 转换规则一目了然，新增状态时只需修改一处
- 非法转换的错误处理统一：`if (!VALID_TRANSITIONS.get(current)?.has(target)) throw InvalidTransitionError`
- 易于生成状态图文档

---

### ADR-005: ChainWatcher 采用轮询而非 WebSocket 订阅

**决策**：使用 3 秒定时轮询 (`getLogs`) 而非 WebSocket `eth_subscribe`。

**理由**：
- PlatON RPC 的 WebSocket 稳定性在生产环境下不如 HTTP 可靠
- 轮询可精确控制 `fromBlock/toBlock`，避免漏块
- 3 秒间隔已足够（PlatON 出块约 1 秒，对于支付确认 3 秒可接受）
- 轮询实现更简单，断点续传（记录 `lastProcessedBlock`）天然支持

**风险**：轮询产生更多 RPC 调用。缓解：使用批量 `getLogs` 而非逐块查询。

---

### ADR-006: EscrowInstruction 中 nonce 由 Core 生成

**决策**：EIP-3009 的 `nonce`（bytes32 随机值）由 Core 在构建 EscrowInstruction 时生成，存储在 `payments.eip3009_nonce` 列，而非由用户自行提供。

**理由**：
- 防止用户复用 nonce 导致意外重放
- Core 可在数据库层保证 nonce 的唯一性
- 用户无需理解 nonce 管理细节，降低接入门槛

**安全约束**：`eip3009_nonce` 使用 `crypto.getRandomValues(new Uint8Array(32))` 生成，确保不可预测。

---

### ADR-007: Merchant Registry MVP 使用本地数据库而非链上合约

**决策**：MVP 阶段使用 PostgreSQL `merchant_registry` 表存储商户信息，而非 PlatON 链上的 NexusMerchantRegistry 合约。

**理由**：
- 链上合约部署增加 MVP 复杂度
- flight-agent 和 hotel-agent 是已知内部商户，不需要去中心化注册
- 后续可通过接口替换（`MerchantRepository` 接口不变，实现层改为链上调用）

**升级路径**：当需要支持第三方商户自注册时，实现 `OnchainMerchantRepository`，实现相同接口，通过依赖注入替换。

---

*文档结束。版本 1.0.0 - 2026-02-24*

**变更记录**：

| 版本 | 日期 | 变更内容 |
| --- | --- | --- |
| 1.0.0 | 2026-02-24 | 初始系统设计，基于 PRD-001 v1.1 + RFC-010 |
