# RFC-010: xNexus Escrow 智能合约规范

| 元数据 | 内容 |
| --- | --- |
| **标题** | xNexus Escrow 智能合约规范 |
| **版本** | 2.0.0 |
| **状态** | Standards Track (Draft) |
| **作者** | Cipher & Nexus Architect Team |
| **创建日期** | 2026-02-24 |
| **更新日期** | 2026-02-26 |
| **依赖** | RFC-005v3 (Payment Core MVP), RFC-009 (Webhook Standard), RFC-001 (DID) |
| **目标链** | PlatON Devnet (chain_id: 20250407) |
| **支付币种** | USDC (ERC-20, 6 decimals) |
| **合约标准** | ERC-20 (IERC20), EIP-3009 (transferWithAuthorization), OpenZeppelin v5 |
| **Gas 模型** | Relayer 代付 (用户零 Gas) |

---

## 1. 摘要 (Abstract)

本 RFC 定义 xNexus Escrow 智能合约的完整规范。合约作为支付担保人，实现"用户付款 -> 资金锁定 -> 商户履约 -> 资金释放"的担保交易流程。与 RFC-005v2 的 Direct Transfer 模式互补，为高价值交易、跨链支付和纠纷仲裁提供链上安全保障。

**v1.1 核心变更**：采用 EIP-3009 (`transferWithAuthorization`) 替代 EIP-2612 Permit，配合 Relayer 代付服务，实现用户完全无 Gas 的支付体验。用户只需签署 EIP-3009 授权签名，由 Relayer 代为提交链上交易，Gas 费用由 Relayer 承担并从协议手续费中覆盖。

核心升级价值：

1. **零 Gas 支付体验**：通过 EIP-3009 + Relayer 代付，用户无需持有 LAT 即可完成 Escrow 支付
2. **链上参数携带**：自定义事件携带 order_ref、merchant_did、payment_id 等完整业务数据
3. **资金担保**：用户付款后资金锁定在合约中，商户确认履约后才能提取
4. **自动退款**：超时未履约自动退还用户资金
5. **争议仲裁**：引入仲裁人角色，链上强制执行纠纷裁决
6. **跨链就绪**：合约地址可作为跨链 bridge 的 settlement 终点

---

## 2. 动机 (Motivation)

### 2.1 当前方案的局限性

RFC-005v2 定义的 Direct Transfer 模式存在以下根本性局限：

| 问题 | 说明 | 影响 |
| --- | --- | --- |
| **无链上上下文** | ERC-20 `transfer(to, amount)` 只有 2 个参数 | 链上无法关联订单号、商户身份等业务数据 |
| **无追索权** | 资金转出即不可逆 | 商户不履约时，用户在链上无追索手段 |
| **无担保能力** | 资金直达商户 | 无法实现"先付款、后发货、再放款"的安全交易 |
| **跨链不兼容** | 普通 transfer 无法携带 calldata | 跨链 bridge relayer 无法将业务参数传递到目标链 |
| **审计困难** | 链上只有 Transfer 事件 | 审计员无法从链上数据重建完整支付上下文 |

### 2.2 Escrow 合约的价值

```
Direct Transfer (现状)              Escrow Contract (提案)
---------------------              ----------------------
User --transfer--> Merchant        User --deposit--> Contract --release--> Merchant
                                                        |
                                                   超时? --refund--> User
                                                   争议? --arbitrate--> 仲裁裁决
```

---

## 3. 对比分析：Direct Transfer vs Smart Contract Escrow

### 3.1 多维度对比矩阵

| 维度 | Direct Transfer (RFC-005v2) | Smart Contract Escrow (本 RFC) | 评估 |
| --- | --- | --- | --- |
| **安全性** | 资金直达商户，不可逆转；商户不履约时用户无链上追索权 | 资金锁定在合约中，支持超时退款和仲裁强制执行 | Escrow 显著优于 |
| **链上数据完整性** | 仅 `Transfer(from, to, value)` 三个字段 | 自定义事件携带 `paymentId`, `orderRef`, `merchantDid` 等 | Escrow 显著优于 |
| **可扩展性** | 添加分账、退款等需要全新设计 | 合约支持升级代理模式，可扩展新功能 | Escrow 优于 |
| **跨链兼容性** | 无法作为跨链 settlement 终点 | 合约地址 + calldata 可对接跨链 bridge | Escrow 显著优于 |
| **Gas 成本** | transfer 约 ~65,000 gas | deposit 约 ~120,000 gas + release ~80,000 gas | Direct 优于 |
| **用户体验 (操作步骤)** | 一步完成 (transfer) | 用户仅签名 (EIP-3009)，Relayer 代为上链，零 Gas | Escrow 优于 (用户零链上操作) |
| **纠纷处理** | 完全依赖链下协商，无强制力 | 链上自动退款 + 仲裁人机制，可强制执行 | Escrow 显著优于 |
| **会计审计合规** | 链下事件溯源，链上仅普通转账 | 链上事件完整记录生命周期，满足 ISO 20022 审计 | Escrow 优于 |
| **部署复杂度** | 无需部署合约 | 需要合约部署、安全审计 | Direct 优于 |
| **适用场景** | 小额即时支付、信任度高的交易 | 高价值交易、跨境支付、需要担保的服务类交易 | 互补 |

### 3.2 Gas 成本详细估算 (PlatON 主网)

| 操作 | Gas 消耗 | 用户承担 | Relayer 承担 | 说明 |
| --- | --- | --- | --- | --- |
| ERC-20 `transfer` | ~65,000 | 65,000 | 0 | Direct Transfer 模式 |
| EIP-3009 签名 | 0 | 0 | 0 | 用户链下签名，无链上交易 |
| Escrow `depositWithAuthorization` | ~140,000 | 0 | 140,000 | Relayer 调用，含 transferWithAuthorization + 状态写入 + 事件发射 |
| Escrow `release` | ~80,000 | 0 | 80,000 | Core operator 调用 |
| Escrow `refund` | ~75,000 | 0 | 75,000 | 超时退款，任何人触发 (Relayer 自动执行) |
| **Direct Transfer 用户成本** | **~65,000** | **65,000** | **0** | 用户自行发送链上交易 |
| **Escrow 用户成本** | **0** | **0** | **~220,000** | 用户仅签名，Relayer 承担全部 Gas |

> 注意：Escrow 模式下用户不需要持有任何 LAT (PlatON 原生代币)，所有链上交易费用由 Relayer 承担，成本从协议手续费 (0.3%) 中覆盖。

### 3.3 战略决策：渐进式双模式架构

**结论**：不替换 Direct Transfer，而是将 Escrow 作为第二种支付模式并行运行。

```
xNexus Core (RFC-005v2 升级)
├── PaymentMethod: DIRECT_TRANSFER  (原有模式，保持不变)
│   └── 适用：小额即时支付、高信任商户
│
└── PaymentMethod: ESCROW_CONTRACT  (新增模式，本 RFC)
    └── 适用：高价值交易、担保交易、跨链支付、服务类交易
```

商户在注册时选择支持的支付模式，Core 根据 Quote 中的 `payment_method` 字段路由到对应的支付通道。

---

## 4. xNexusEscrow 合约设计

### 4.1 合约状态机

```
                    ┌──────────────────┐
                    │     DEPOSITED    │ <-- 用户调用 deposit()
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐  ┌──▼──────────┐  ┌▼───────────────┐
     │   RELEASED     │  │  REFUNDED   │  │   DISPUTED     │
     │  (商户提取)     │  │ (超时退款)   │  │  (争议中)       │
     └────────────────┘  └─────────────┘  └───────┬────────┘
                                                   │
                                         ┌─────────┼────────────────┐
                                         │         │                │
                                  ┌──────▼──────┐ ┌▼────────────┐ ┌▼───────────────┐
                                  │ RESOLVED_    │ │ RESOLVED_   │ │ RESOLVED_      │
                                  │ TO_MERCHANT  │ │ SPLIT       │ │ TO_PAYER       │
                                  │ (裁决归商户)  │ │ (按比例分配) │ │ (裁决归用户)    │
                                  └─────────────┘ └─────────────┘ └────────────────┘
```

### 4.2 状态枚举与转换规则

| 状态 | 值 | 含义 | 可转换到 |
| --- | --- | --- | --- |
| `DEPOSITED` | 1 | 用户已存入资金，等待商户履约 | RELEASED, REFUNDED, DISPUTED |
| `RELEASED` | 2 | 商户已提取资金（履约完成） | 终态 |
| `REFUNDED` | 3 | 资金已退还用户（超时或主动退款） | 终态 |
| `DISPUTED` | 4 | 用户发起争议，等待仲裁 | RESOLVED_TO_MERCHANT, RESOLVED_TO_PAYER, RESOLVED_SPLIT |
| `RESOLVED_TO_MERCHANT` | 5 | 仲裁结果：资金归商户 | 终态 |
| `RESOLVED_TO_PAYER` | 6 | 仲裁结果：资金归用户 | 终态 |
| `RESOLVED_SPLIT` | 7 | 仲裁结果：资金按比例分配给双方 (v2.0.0 新增) | 终态 |

### 4.3 转换规则详细表

| 当前状态 | 目标状态 | 触发条件 | 调用者 |
| --- | --- | --- | --- |
| (无) | DEPOSITED | 用户调用 `deposit()` 并转入 USDC | payer (用户) |
| DEPOSITED | RELEASED | 商户调用 `release()` 提取资金 | Core 或 merchant |
| DEPOSITED | REFUNDED | 超过 `releaseDeadline` 后任何人调用 `refund()` | 任何人 (公开) |
| DEPOSITED | DISPUTED | 用户在 `disputeWindow` 内调用 `dispute()` | payer (用户) |
| DISPUTED | RESOLVED_TO_MERCHANT | 仲裁人调用 `resolve()` 裁决归商户 | arbiter (仲裁人) |
| DISPUTED | RESOLVED_TO_PAYER | 仲裁人调用 `resolve()` 裁决归用户 | arbiter (仲裁人) |

### 4.4 EIP-3009 接口定义

PlatON 链上的 USDC 支持 EIP-3009 (`transferWithAuthorization`)，其接口如下：

```solidity
/**
 * @title IERC3009 - Transfer With Authorization
 * @notice EIP-3009 标准接口，允许链下签名授权转账
 * @dev 用户签署 EIP-712 TypedData，授权任何人 (Relayer) 调用此函数执行转账
 *      签名参数: from, to, value, validAfter, validBefore, nonce
 */
interface IERC3009 is IERC20 {
    /**
     * @notice 使用链下签名执行转账
     * @param from        付款人地址 (签名者)
     * @param to          收款人地址
     * @param value       转账金额
     * @param validAfter  签名生效时间 (unix timestamp)
     * @param validBefore 签名过期时间 (unix timestamp)
     * @param nonce       唯一 nonce (防重放，bytes32)
     * @param v           签名 v
     * @param r           签名 r
     * @param s           签名 s
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice 检查授权 nonce 是否已使用
     */
    function authorizationState(
        address authorizer,
        bytes32 nonce
    ) external view returns (bool);
}
```

### 4.5 Solidity 合约接口

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IERC3009
 * @notice EIP-3009 transferWithAuthorization 接口
 */
interface IERC3009 is IERC20 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function authorizationState(
        address authorizer,
        bytes32 nonce
    ) external view returns (bool);
}

/**
 * @title xNexusEscrow
 * @notice 基于 USDC 的担保支付合约，支持 xNexus 支付协议
 * @dev 合约充当担保人角色：Relayer 代用户存入 -> 商户履约 -> Core 释放
 *      采用 EIP-3009 (transferWithAuthorization) 实现用户零 Gas 支付
 *      用户只需链下签名 EIP-3009 授权，Relayer 代为提交链上交易
 *
 * 关键设计决策：
 * - EIP-3009 替代 approve/permit：用户无需持有 LAT，零链上交易
 * - Relayer 代付模式：所有链上 Gas 由 Relayer 承担
 * - 初始仲裁人 = Nexus operator：部署时自动设置，后续可更换
 * - 每笔支付独立管理，通过 paymentId 索引
 * - 超时退款为公开函数，任何人均可触发（Relayer 自动执行）
 */
contract xNexusEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // 类型定义
    // =========================================================================

    enum EscrowStatus {
        NONE,                  // 0: 不存在
        DEPOSITED,             // 1: 用户已存入，等待履约
        RELEASED,              // 2: 商户已提取
        REFUNDED,              // 3: 已退款
        DISPUTED,              // 4: 争议中
        RESOLVED_TO_MERCHANT,  // 5: 仲裁归商户
        RESOLVED_TO_PAYER      // 6: 仲裁归用户
    }

    struct EscrowRecord {
        bytes32 paymentId;           // xNexus 支付 ID (keccak256)
        address payer;               // 付款人地址 (EIP-3009 签名者)
        address merchant;            // 商户收款地址
        uint256 amount;              // USDC 金额 (6 decimals)
        EscrowStatus status;         // 当前状态
        uint64 depositedAt;          // 存入时间戳
        uint64 releaseDeadline;      // 商户必须在此时间前调用 release
        uint64 disputeDeadline;      // 用户必须在此时间前发起争议
        bytes32 orderRef;            // 商户订单号 hash
        bytes32 merchantDid;         // 商户 DID hash
        bytes32 contextHash;         // 订单上下文 hash (航班/酒店等)
    }

    // =========================================================================
    // 状态变量
    // =========================================================================

    /// @notice USDC 代币合约地址 (支持 EIP-3009)
    IERC3009 public immutable usdc;

    /// @notice 默认履约超时时间 (商户必须在此时间内调用 release)
    uint64 public defaultReleaseTimeout;

    /// @notice 默认争议窗口 (用户可在存入后此时间内发起争议)
    uint64 public defaultDisputeWindow;

    /// @notice 仲裁人地址 -> 是否有效
    mapping(address => bool) public arbiters;

    /// @notice paymentId -> EscrowRecord
    mapping(bytes32 => EscrowRecord) public escrows;

    /// @notice 协议手续费率 (基点, 1 = 0.01%)
    uint16 public protocolFeeBps;

    /// @notice 协议手续费收款地址
    address public protocolFeeRecipient;

    /// @notice Core 服务地址 (可代表商户调用 release / 可作为 Relayer)
    mapping(address => bool) public coreOperators;

    // =========================================================================
    // 事件定义
    // =========================================================================

    /// @notice 用户存入资金 (通过 EIP-3009 授权)
    event PaymentDeposited(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        bytes32 orderRef,
        bytes32 merchantDid,
        bytes32 contextHash,
        uint64 releaseDeadline,
        uint64 disputeDeadline
    );

    /// @notice 商户提取资金（履约完成）
    event PaymentReleased(
        bytes32 indexed paymentId,
        address indexed merchant,
        uint256 merchantAmount,
        uint256 protocolFee
    );

    /// @notice 资金退还用户
    event PaymentRefunded(
        bytes32 indexed paymentId,
        address indexed payer,
        uint256 amount,
        string reason
    );

    /// @notice 用户发起争议
    event PaymentDisputed(
        bytes32 indexed paymentId,
        address indexed payer,
        string reason
    );

    /// @notice 仲裁人裁决
    event DisputeResolved(
        bytes32 indexed paymentId,
        address indexed arbiter,
        bool toMerchant,
        uint256 merchantAmount,
        uint256 payerAmount
    );

    /// @notice 仲裁人变更
    event ArbiterUpdated(address indexed arbiter, bool active);

    /// @notice Core 操作员变更
    event CoreOperatorUpdated(address indexed operator, bool active);

    // =========================================================================
    // 修饰符
    // =========================================================================

    modifier onlyArbiter() {
        require(arbiters[msg.sender], "NexusEscrow: not arbiter");
        _;
    }

    modifier onlyCoreOrMerchant(bytes32 _paymentId) {
        EscrowRecord storage record = escrows[_paymentId];
        require(
            msg.sender == record.merchant || coreOperators[msg.sender],
            "NexusEscrow: not authorized"
        );
        _;
    }

    modifier onlyPayer(bytes32 _paymentId) {
        require(
            msg.sender == escrows[_paymentId].payer,
            "NexusEscrow: not payer"
        );
        _;
    }

    // =========================================================================
    // 构造函数
    // =========================================================================

    /**
     * @notice 部署 xNexusEscrow 合约
     * @dev 构造函数自动将 _nexusOperator 设置为初始仲裁人和 Core 操作员
     *      后续可通过 setArbiter() 和 setCoreOperator() 更换
     * @param _usdc                  USDC 合约地址 (必须支持 EIP-3009)
     * @param _defaultReleaseTimeout 默认履约超时 (秒)
     * @param _defaultDisputeWindow  默认争议窗口 (秒)
     * @param _protocolFeeBps        协议手续费 (基点, 最高 500 = 5%)
     * @param _protocolFeeRecipient  手续费收款地址
     * @param _nexusOperator         Nexus 管理钱包 (初始仲裁人 + 操作员)
     */
    constructor(
        address _usdc,
        uint64 _defaultReleaseTimeout,
        uint64 _defaultDisputeWindow,
        uint16 _protocolFeeBps,
        address _protocolFeeRecipient,
        address _nexusOperator
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "NexusEscrow: zero USDC address");
        require(_defaultReleaseTimeout > 0, "NexusEscrow: zero timeout");
        require(_protocolFeeBps <= 500, "NexusEscrow: fee too high"); // max 5%
        require(
            _protocolFeeRecipient != address(0),
            "NexusEscrow: zero fee recipient"
        );
        require(_nexusOperator != address(0), "NexusEscrow: zero operator");

        usdc = IERC3009(_usdc);
        defaultReleaseTimeout = _defaultReleaseTimeout;
        defaultDisputeWindow = _defaultDisputeWindow;
        protocolFeeBps = _protocolFeeBps;
        protocolFeeRecipient = _protocolFeeRecipient;

        // 初始设置: Nexus operator 同时作为仲裁人和 Core 操作员
        arbiters[_nexusOperator] = true;
        coreOperators[_nexusOperator] = true;

        emit ArbiterUpdated(_nexusOperator, true);
        emit CoreOperatorUpdated(_nexusOperator, true);
    }

    // =========================================================================
    // 核心函数
    // =========================================================================

    /**
     * @notice 使用 EIP-3009 授权存入 USDC 到 Escrow (主要入口)
     * @dev Relayer 调用此函数，使用用户的 EIP-3009 签名将 USDC 从用户钱包转入合约
     *      用户无需任何链上交易，只需链下签名 EIP-3009 授权
     *      合约内部调用 USDC.transferWithAuthorization() 完成转账
     *
     *      流程：用户签署 EIP-3009 -> Relayer 调用本函数 -> 合约调用 USDC.transferWithAuthorization
     *
     * @param _paymentId     xNexus 支付 ID (bytes32, Core 生成)
     * @param _from          付款人地址 (EIP-3009 签名者，即用户钱包)
     * @param _merchant      商户收款地址 (从 DID 注册表解析)
     * @param _amount        USDC 金额 (6 decimals)
     * @param _orderRef      商户订单号 hash
     * @param _merchantDid   商户 DID hash
     * @param _contextHash   订单上下文 hash
     * @param _validAfter    EIP-3009 签名生效时间
     * @param _validBefore   EIP-3009 签名过期时间
     * @param _nonce         EIP-3009 唯一 nonce (防重放)
     * @param _v             签名 v
     * @param _r             签名 r
     * @param _s             签名 s
     */
    function depositWithAuthorization(
        bytes32 _paymentId,
        address _from,
        address _merchant,
        uint256 _amount,
        bytes32 _orderRef,
        bytes32 _merchantDid,
        bytes32 _contextHash,
        // EIP-3009 授权参数
        uint256 _validAfter,
        uint256 _validBefore,
        bytes32 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        require(
            escrows[_paymentId].status == EscrowStatus.NONE,
            "NexusEscrow: payment exists"
        );
        require(_from != address(0), "NexusEscrow: zero payer");
        require(_merchant != address(0), "NexusEscrow: zero merchant");
        require(_amount > 0, "NexusEscrow: zero amount");
        require(_merchant != _from, "NexusEscrow: self-payment");

        uint64 releaseDeadline = uint64(block.timestamp) + defaultReleaseTimeout;
        uint64 disputeDeadline = uint64(block.timestamp) + defaultDisputeWindow;

        escrows[_paymentId] = EscrowRecord({
            paymentId: _paymentId,
            payer: _from,
            merchant: _merchant,
            amount: _amount,
            status: EscrowStatus.DEPOSITED,
            depositedAt: uint64(block.timestamp),
            releaseDeadline: releaseDeadline,
            disputeDeadline: disputeDeadline,
            orderRef: _orderRef,
            merchantDid: _merchantDid,
            contextHash: _contextHash
        });

        // 使用 EIP-3009 从用户钱包直接转入合约
        // 用户已链下签署授权，Relayer (msg.sender) 代为提交
        usdc.transferWithAuthorization(
            _from,           // 付款人 (签名者)
            address(this),   // 收款人 (本合约)
            _amount,
            _validAfter,
            _validBefore,
            _nonce,
            _v,
            _r,
            _s
        );

        emit PaymentDeposited(
            _paymentId,
            _from,
            _merchant,
            _amount,
            _orderRef,
            _merchantDid,
            _contextHash,
            releaseDeadline,
            disputeDeadline
        );
    }

    /**
     * @notice 用户直接存入 USDC 到 Escrow (备用入口)
     * @dev 调用前需 approve USDC 给本合约
     *      适用于用户有 LAT 且愿意自行发送链上交易的场景
     *      paymentId 必须唯一 (防重放)
     * @param _paymentId     xNexus 支付 ID (bytes32, Core 生成)
     * @param _merchant      商户收款地址 (从 DID 注册表解析)
     * @param _amount        USDC 金额 (6 decimals)
     * @param _orderRef      商户订单号 hash
     * @param _merchantDid   商户 DID hash
     * @param _contextHash   订单上下文 hash
     */
    function deposit(
        bytes32 _paymentId,
        address _merchant,
        uint256 _amount,
        bytes32 _orderRef,
        bytes32 _merchantDid,
        bytes32 _contextHash
    ) external nonReentrant {
        require(
            escrows[_paymentId].status == EscrowStatus.NONE,
            "NexusEscrow: payment exists"
        );
        require(_merchant != address(0), "NexusEscrow: zero merchant");
        require(_amount > 0, "NexusEscrow: zero amount");
        require(_merchant != msg.sender, "NexusEscrow: self-payment");

        uint64 releaseDeadline = uint64(block.timestamp) + defaultReleaseTimeout;
        uint64 disputeDeadline = uint64(block.timestamp) + defaultDisputeWindow;

        escrows[_paymentId] = EscrowRecord({
            paymentId: _paymentId,
            payer: msg.sender,
            merchant: _merchant,
            amount: _amount,
            status: EscrowStatus.DEPOSITED,
            depositedAt: uint64(block.timestamp),
            releaseDeadline: releaseDeadline,
            disputeDeadline: disputeDeadline,
            orderRef: _orderRef,
            merchantDid: _merchantDid,
            contextHash: _contextHash
        });

        // 传统 approve + transferFrom 模式
        IERC20(address(usdc)).safeTransferFrom(msg.sender, address(this), _amount);

        emit PaymentDeposited(
            _paymentId,
            msg.sender,
            _merchant,
            _amount,
            _orderRef,
            _merchantDid,
            _contextHash,
            releaseDeadline,
            disputeDeadline
        );
    }

    /**
     * @notice 释放资金给商户 (商户履约后调用)
     * @dev 仅商户本人或 Core 操作员可调用
     *      扣除协议手续费后转给商户
     * @param _paymentId 支付 ID
     */
    function release(
        bytes32 _paymentId
    ) external nonReentrant onlyCoreOrMerchant(_paymentId) {
        EscrowRecord storage record = escrows[_paymentId];
        require(
            record.status == EscrowStatus.DEPOSITED,
            "NexusEscrow: invalid status"
        );

        record.status = EscrowStatus.RELEASED;

        // 计算手续费
        uint256 fee = (record.amount * protocolFeeBps) / 10000;
        uint256 merchantAmount = record.amount - fee;

        // 转账给商户
        IERC20(address(usdc)).safeTransfer(record.merchant, merchantAmount);

        // 转手续费给协议
        if (fee > 0) {
            IERC20(address(usdc)).safeTransfer(protocolFeeRecipient, fee);
        }

        emit PaymentReleased(_paymentId, record.merchant, merchantAmount, fee);
    }

    /**
     * @notice 超时退款 (任何人均可触发)
     * @dev 必须超过 releaseDeadline 且状态为 DEPOSITED
     *      设计为公开函数，Relayer 会自动调用此函数处理超时退款
     * @param _paymentId 支付 ID
     */
    function refund(
        bytes32 _paymentId
    ) external nonReentrant {
        EscrowRecord storage record = escrows[_paymentId];
        require(
            record.status == EscrowStatus.DEPOSITED,
            "NexusEscrow: invalid status"
        );
        require(
            block.timestamp > record.releaseDeadline,
            "NexusEscrow: not expired"
        );

        record.status = EscrowStatus.REFUNDED;

        IERC20(address(usdc)).safeTransfer(record.payer, record.amount);

        emit PaymentRefunded(
            _paymentId,
            record.payer,
            record.amount,
            "TIMEOUT"
        );
    }

    /**
     * @notice 用户发起争议
     * @dev 仅付款人可调用，且必须在争议窗口内
     *      注意：dispute 需要用户自己签名发送交易 (或通过 Relayer 中继)
     *      争议后资金冻结在合约中，等待仲裁人裁决
     * @param _paymentId 支付 ID
     * @param _reason    争议原因 (链上记录)
     */
    function dispute(
        bytes32 _paymentId,
        string calldata _reason
    ) external onlyPayer(_paymentId) {
        EscrowRecord storage record = escrows[_paymentId];
        require(
            record.status == EscrowStatus.DEPOSITED,
            "NexusEscrow: invalid status"
        );
        require(
            block.timestamp <= record.disputeDeadline,
            "NexusEscrow: dispute window closed"
        );

        record.status = EscrowStatus.DISPUTED;

        emit PaymentDisputed(_paymentId, msg.sender, _reason);
    }

    /**
     * @notice 仲裁人裁决争议
     * @dev 仅仲裁人可调用 (初始阶段为 Nexus 管理钱包)
     *      支持按比例分配：merchantBps 表示商户获得的比例 (基点)
     *      例如：merchantBps = 10000 全部归商户，0 全部归用户，5000 各半
     * @param _paymentId   支付 ID
     * @param _merchantBps 商户获得的比例 (基点, 0-10000)
     */
    function resolve(
        bytes32 _paymentId,
        uint16 _merchantBps
    ) external nonReentrant onlyArbiter {
        EscrowRecord storage record = escrows[_paymentId];
        require(
            record.status == EscrowStatus.DISPUTED,
            "NexusEscrow: not disputed"
        );
        require(_merchantBps <= 10000, "NexusEscrow: invalid bps");

        uint256 merchantAmount = (record.amount * _merchantBps) / 10000;
        uint256 payerAmount = record.amount - merchantAmount;

        if (_merchantBps >= 5000) {
            record.status = EscrowStatus.RESOLVED_TO_MERCHANT;
        } else {
            record.status = EscrowStatus.RESOLVED_TO_PAYER;
        }

        if (merchantAmount > 0) {
            IERC20(address(usdc)).safeTransfer(record.merchant, merchantAmount);
        }
        if (payerAmount > 0) {
            IERC20(address(usdc)).safeTransfer(record.payer, payerAmount);
        }

        emit DisputeResolved(
            _paymentId,
            msg.sender,
            _merchantBps >= 5000,
            merchantAmount,
            payerAmount
        );
    }

    // =========================================================================
    // 查询函数
    // =========================================================================

    /**
     * @notice 查询 Escrow 记录
     * @param _paymentId 支付 ID
     * @return EscrowRecord 完整记录
     */
    function getEscrow(
        bytes32 _paymentId
    ) external view returns (EscrowRecord memory) {
        return escrows[_paymentId];
    }

    /**
     * @notice 检查支付是否可退款 (超时)
     * @param _paymentId 支付 ID
     * @return 是否可退款
     */
    function isRefundable(bytes32 _paymentId) external view returns (bool) {
        EscrowRecord storage record = escrows[_paymentId];
        return record.status == EscrowStatus.DEPOSITED
            && block.timestamp > record.releaseDeadline;
    }

    /**
     * @notice 检查支付是否可发起争议
     * @param _paymentId 支付 ID
     * @return 是否可争议
     */
    function isDisputable(bytes32 _paymentId) external view returns (bool) {
        EscrowRecord storage record = escrows[_paymentId];
        return record.status == EscrowStatus.DEPOSITED
            && block.timestamp <= record.disputeDeadline;
    }

    // =========================================================================
    // 管理函数
    // =========================================================================

    /**
     * @notice 设置仲裁人
     * @dev 仅合约 owner 可调用。初始仲裁人在构造函数中设置为 nexusOperator
     *      后续可通过此函数更换或添加新仲裁人
     * @param _arbiter 仲裁人地址
     * @param _active  是否启用
     */
    function setArbiter(address _arbiter, bool _active) external onlyOwner {
        require(_arbiter != address(0), "NexusEscrow: zero address");
        arbiters[_arbiter] = _active;
        emit ArbiterUpdated(_arbiter, _active);
    }

    function setCoreOperator(
        address _operator,
        bool _active
    ) external onlyOwner {
        require(_operator != address(0), "NexusEscrow: zero address");
        coreOperators[_operator] = _active;
        emit CoreOperatorUpdated(_operator, _active);
    }

    function setDefaultReleaseTimeout(uint64 _timeout) external onlyOwner {
        require(_timeout > 0, "NexusEscrow: zero timeout");
        defaultReleaseTimeout = _timeout;
    }

    function setDefaultDisputeWindow(uint64 _window) external onlyOwner {
        defaultDisputeWindow = _window;
    }

    function setProtocolFee(
        uint16 _feeBps,
        address _recipient
    ) external onlyOwner {
        require(_feeBps <= 500, "NexusEscrow: fee too high");
        require(_recipient != address(0), "NexusEscrow: zero recipient");
        protocolFeeBps = _feeBps;
        protocolFeeRecipient = _recipient;
    }
}
```

### 4.6 合约部署参数 (PlatON 主网)

| 参数 | 建议值 | 说明 |
| --- | --- | --- |
| `_usdc` | PlatON USDC 合约地址 | 必须支持 EIP-3009 (transferWithAuthorization) |
| `_defaultReleaseTimeout` | 86400 (24 小时) | 商户必须在 24 小时内确认履约 |
| `_defaultDisputeWindow` | 259200 (72 小时) | 用户可在 72 小时内发起争议 |
| `_protocolFeeBps` | 30 (0.3%) | 协议手续费 (需覆盖 Relayer Gas 成本) |
| `_protocolFeeRecipient` | Nexus 多签钱包 | 手续费收款地址 |
| `_nexusOperator` | Nexus 管理钱包 | 初始仲裁人 + Core 操作员 + Relayer 地址 |

---

## 5. 支付流程重设计

### 5.1 Escrow 模式完整支付流程时序图 (EIP-3009 + Relayer)

```
User Agent (UA)       xNexus Core          Relayer            xNexusEscrow       Merchant Agent (MA)     PlatON Chain
     |                     |               (Core 子模块)       (Smart Contract)            |                     |
     |  1. 搜索商品          |                    |                    |                    |                     |
     | ──────────────────────────────────────────────────────────────────────────────────►  |                     |
     |  search_flights      |                    |                    |                    |                     |
     | ◄────────────────────|                    |                    |                    |                     |
     |  返回航班列表          |                    |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |  2. 生成报价          |                    |                    |                    |                     |
     | ──────────────────────────────────────────────────────────────────────────────────►  |                     |
     |  nexus_generate_quote |                    |                    |                    |                     |
     | ◄────────────────────|  Quote (EIP-712, payment_method: "ESCROW")                  |                     |
     |                     |                    |                    |                    |                     |
     |  3. 编排支付          |                    |                    |                    |                     |
     | ────────────────────►|                    |                    |                    |                     |
     |  nexus_orchestrate_payment(quote, payer_wallet)                |                    |                     |
     |                     | ─ 验签 ──           |                    |                    |                     |
     |                     | ─ DID 解析 ──       |                    |                    |                     |
     |                     | ─ 创建 payment ──   |                    |                    |                     |
     |                     | ─ 生成 EIP-3009 签名参数 ──               |                    |                     |
     | ◄────────────────────|                    |                    |                    |                     |
     |  EscrowInstruction   |                    |                    |                    |                     |
     |  (eip3009_sign_data) |                    |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |  4. 用户签署 EIP-3009  |                    |                    |                    |                     |
     |  (链下签名，无链上交易)  |                    |                    |                    |                     |
     |  用户钱包弹出签名请求   |                    |                    |                    |                     |
     |  签署 transferWithAuthorization TypedData                      |                    |                     |
     |                     |                    |                    |                    |                     |
     |  5. 提交签名          |                    |                    |                    |                     |
     | ────────────────────►|                    |                    |                    |                     |
     |  nexus_submit_eip3009_signature(id, v, r, s)                  |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |  6. 转发给 Relayer   |                    |                    |                     |
     |                     | ──────────────────►|                    |                    |                     |
     |                     |  depositWithAuth    |                    |                    |                     |
     |                     |  请求              |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |                    |  7. Relayer 构建交易并上链               |                     |
     |                     |                    | ──────────────────►|                    |                     |
     |                     |                    |  xNexusEscrow.depositWithAuthorization(...)                  |
     |                     |                    |  (Relayer 支付 Gas)  |                    |                     |
     |                     |                    | ◄──────────────────| deposit tx_hash    |                     |
     |                     |                    |                    |                    |                     |
     | ◄────────────────────|                    |                    |                    |                     |
     |  status: DEPOSITED   |                    |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |  8. 链上确认         |                    |                    |                     |
     |                     | ◄───────────────────────────────────────| PaymentDeposited   |                     |
     |                     |  验证 paymentId/amount                  |  event             |                     |
     |                     |  status: ESCROWED    |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |  9. Webhook 通知     |                    |                    |                     |
     |                     | ─────────────────────────────────────────────────────────────►|                     |
     |                     |  payment.escrowed    |                    |                    |                     |
     |                     | ◄────────────────────────────────────────────────────────────| HTTP 200            |
     |                     |                    |                    |                    |                     |
     |                     |                    |                    |                    |  10. 商户履约 (出票)  |
     |                     |                    |                    |                    | (内部业务逻辑)        |
     |                     |                    |                    |                    |                     |
     |                     |  11. 商户确认履约    |                    |                    |                     |
     |                     | ◄────────────────────────────────────────────────────────────|                     |
     |                     |  nexus_confirm_fulfillment(id, proof)   |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |  12. Relayer 调用合约释放资金             |                    |                     |
     |                     | ──────────────────►|                    |                    |                     |
     |                     |                    | ──────────────────►|                    |                     |
     |                     |                    |  xNexusEscrow.release(paymentId)      |                     |
     |                     |                    | ◄──────────────────| PaymentReleased    |                     |
     |                     |  status: SETTLED    |                    |  event             |                     |
     |                     |                    |                    |                    |                     |
     |                     |  13. Webhook: 已结算 |                    |                    |                     |
     |                     | ─────────────────────────────────────────────────────────────►|                     |
     |                     |  payment.settled     |                    |                    |                     |
     |                     | ◄────────────────────────────────────────────────────────────| HTTP 200            |
     |                     |                    |                    |                    |                     |
     |  14. 查询状态         |                    |                    |                    |                     |
     | ────────────────────►|                    |                    |                    |                     |
     |  nexus_get_payment_status                 |                    |                    |                     |
     | ◄────────────────────|                    |                    |                    |                     |
     |  status: SETTLED     |                    |                    |                    |                     |
     |  "支付成功,商户已出票" |                    |                    |                    |                     |
```

> 关键变化：用户在步骤 4 中仅进行链下签名 (EIP-3009 TypedData)，不发送任何链上交易，不需要持有 LAT。Relayer 在步骤 7 代为提交交易并支付 Gas。

### 5.2 状态机扩展（Escrow 模式新增状态）

在 RFC-005v2 原有 8 个状态基础上，增加 Escrow 模式专用状态：

```
原有状态 (保留):
  CREATED, AWAITING_TX, BROADCASTED, SETTLED, COMPLETED, EXPIRED, TX_FAILED, RISK_REJECTED

新增状态 (Escrow 模式):
  ESCROWED          -- 资金已存入合约 (对应合约 DEPOSITED 状态)
  DISPUTE_OPEN      -- 用户发起争议
  DISPUTE_RESOLVED  -- 仲裁完成
  REFUNDED          -- 已退款
```

完整 Escrow 模式状态流转：

```
(无) ─ orchestrate_payment ──► CREATED
CREATED ──► AWAITING_TX ──► BROADCASTED ──► ESCROWED
                                              │
                           ┌──────────────────┼──────────────────┐
                           │                  │                  │
                      SETTLED            REFUNDED          DISPUTE_OPEN
                      (release)          (超时退款)         (用户争议)
                           │                                     │
                      COMPLETED                          DISPUTE_RESOLVED
                      (履约确认)                           (仲裁裁决)
```

### 5.3 EscrowInstruction 接口（替代 PaymentInstruction）

当 `payment_method === "ESCROW"` 时，Core 返回 `EscrowInstruction`。

v1.1 变更：取消 `approve_tx` + `deposit_tx`，改为 EIP-3009 签名参数。用户只需签署 EIP-712 TypedData，无需发送任何链上交易。

```typescript
interface EscrowInstruction {
  // 链信息
  readonly chain_id: 210425;
  readonly chain_name: "PlatON";
  readonly payment_method: "ESCROW";

  // Escrow 合约信息
  readonly escrow_contract: Address;   // xNexusEscrow 合约地址
  readonly token_address: Address;     // USDC 合约地址 (支持 EIP-3009)
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;

  // 金额
  readonly amount_uint256: string;     // e.g. "530000000" (530 USDC)
  readonly amount_display: string;     // e.g. "530.00"

  // EIP-3009 签名参数 (用户需签署此 TypedData)
  readonly eip3009_sign_data: {
    readonly domain: {
      readonly name: string;           // USDC 合约的 EIP-712 domain name
      readonly version: string;        // USDC 合约的 EIP-712 domain version
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
      readonly validAfter: string;     // 签名生效时间 (unix timestamp)
      readonly validBefore: string;    // 签名过期时间 (unix timestamp)
      readonly nonce: Hex;             // 唯一 nonce (bytes32, Core 生成)
    };
  };

  // 引用
  readonly nexus_payment_id: string;
  readonly payment_id_bytes32: Hex;    // keccak256(nexus_payment_id)
  readonly merchant_address: Address;
  readonly order_ref_hash: Hex;        // keccak256(merchant_order_ref)
  readonly merchant_did_hash: Hex;     // keccak256(merchant_did)
  readonly context_hash: Hex;          // 订单上下文 hash

  // 超时信息
  readonly release_deadline: string;   // ISO 8601
  readonly dispute_deadline: string;   // ISO 8601
  readonly expires_at: string;         // ISO 8601

  // 用户操作指引 (UA 可展示给用户)
  readonly user_action: "SIGN_EIP3009"; // 用户仅需签名，无需链上交易
  readonly gas_paid_by: "RELAYER";      // Gas 由 Relayer 承担
}
```

#### EscrowInstruction 使用流程

```
1. Core 返回 EscrowInstruction (包含 eip3009_sign_data)
2. UA 调用用户钱包的 eth_signTypedData_v4(eip3009_sign_data)
3. 用户在钱包中确认签名 (仅签名，不发送交易，不消耗 Gas)
4. UA 获得签名 (v, r, s)
5. UA 调用 nexus_submit_eip3009_signature(payment_id, v, r, s)
6. Core 将签名转发给 Relayer
7. Relayer 调用 xNexusEscrow.depositWithAuthorization(...) 上链
8. 链上确认后 Core 更新状态为 ESCROWED
```

### 5.4 MCP Tool 变更

#### 新增 / 修改的 MCP Tools

| Tool | 变更类型 | 说明 |
| --- | --- | --- |
| `nexus_orchestrate_payment` | **修改** | 新增 `payment_method` 路由逻辑，Escrow 模式返回 `EscrowInstruction` (含 EIP-3009 签名参数) |
| `nexus_submit_eip3009_signature` | **新增** | UA 提交用户的 EIP-3009 签名，Core 转发给 Relayer 上链 |
| `nexus_submit_tx` | **修改** | 仍支持传统 tx_hash 提交 (Direct Transfer 模式)，Escrow 模式改用 `nexus_submit_eip3009_signature` |
| `nexus_release_payment` | **新增** | Core 通过 Relayer 调用合约 `release()`，释放 Escrow 资金 |
| `nexus_dispute_payment` | **新增** | UA 发起争议 (通过 Relayer 代为提交 dispute 交易) |
| `nexus_get_payment_status` | **修改** | 新增 Escrow 状态展示、合约地址、超时信息 |
| `nexus_confirm_fulfillment` | **修改** | 触发 Core 通过 Relayer 调用合约 `release()`，将 Escrow 转为 SETTLED |

#### 新增 Tool: `nexus_submit_eip3009_signature`

```json
{
  "name": "nexus_submit_eip3009_signature",
  "description": "UA 提交用户的 EIP-3009 签名，Core 将签名转发给 Relayer 代为上链",
  "input": {
    "nexus_payment_id": { "type": "string", "required": true },
    "v": { "type": "number", "required": true, "description": "签名 v (27 或 28)" },
    "r": { "type": "string", "required": true, "description": "签名 r (bytes32 hex)" },
    "s": { "type": "string", "required": true, "description": "签名 s (bytes32 hex)" }
  },
  "output": {
    "nexus_payment_id": "NEX-xxx",
    "status": "DEPOSITED",
    "deposit_tx_hash": "0x...",
    "relayer_address": "0x...",
    "gas_paid_by": "RELAYER"
  }
}
```

#### 新增 Tool: `nexus_release_payment`

```json
{
  "name": "nexus_release_payment",
  "description": "Core 通过 Relayer 调用 Escrow 合约释放资金给商户",
  "input": {
    "nexus_payment_id": { "type": "string", "required": true },
    "merchant_did": { "type": "string", "required": true },
    "fulfillment_proof": { "type": "string", "required": false }
  },
  "output": {
    "nexus_payment_id": "NEX-xxx",
    "status": "SETTLED",
    "release_tx_hash": "0x...",
    "merchant_amount": "528.41",
    "protocol_fee": "1.59",
    "gas_paid_by": "RELAYER"
  }
}
```

---

## 6. 纠纷处理机制

### 6.1 纠纷类型分类

| 纠纷类型 | 场景举例 | 处理方式 |
| --- | --- | --- |
| **超时未履约** | 商户收款后未出票/发货 | 合约自动退款 (refund) |
| **服务质量争议** | 航班取消、酒店条件不符 | 用户发起 dispute，仲裁人裁决 |
| **部分履约** | 部分商品已发货，部分未到 | 仲裁人按比例裁决 (merchantBps) |
| **欺诈行为** | 商户故意不发货 | 仲裁人裁决 100% 归用户 |

### 6.2 纠纷处理流程

```
           用户发现问题
                │
                ▼
     ┌─────────────────────┐
     │ 是否在争议窗口内？     │
     │ (disputeDeadline)    │
     └───────┬───────┬──────┘
             │Yes    │No
             ▼       ▼
     ┌───────────┐  ┌────────────────────┐
     │ dispute() │  │ 链下协商             │
     │ 发起争议   │  │ (联系客服/仲裁庭)    │
     └─────┬─────┘  └────────────────────┘
           │
           ▼
     ┌───────────────────┐
     │  DISPUTED 状态     │
     │  资金冻结在合约中   │
     └─────────┬─────────┘
               │
               ▼
     ┌───────────────────┐
     │  仲裁人调查取证     │
     │  - 链上交易记录     │
     │  - Webhook 日志    │
     │  - 履约凭证        │
     │  - 双方陈述        │
     └─────────┬─────────┘
               │
               ▼
     ┌───────────────────────────┐
     │  resolve(paymentId, bps)  │
     │  仲裁人裁决               │
     └─────┬──────────────┬─────┘
           │              │
           ▼              ▼
  ┌──────────────┐ ┌──────────────┐
  │ 归商户 (>=50%)│ │ 归用户 (<50%) │
  │ RESOLVED_TO_ │ │ RESOLVED_TO_ │
  │ MERCHANT     │ │ PAYER        │
  └──────────────┘ └──────────────┘
```

### 6.3 超时自动退款机制

```
Core Timeout Handler (定时任务, 通过 Relayer 执行):

1. 每 60 秒扫描 status = 'ESCROWED' 且 release_deadline 已过的订单
2. 对每个过期订单：
   a. 通过 Relayer 调用 xNexusEscrow.refund(paymentId) (Relayer 承担 Gas)
   b. 如果交易成功：
      - 更新 Core 状态: ESCROWED -> REFUNDED
      - 发送 Webhook: payment.refunded
   c. 如果交易失败 (已被商户 release 或用户 dispute):
      - 从链上查询最新状态
      - 同步 Core 状态
3. 记录退款事件到 payment_events 表
```

### 6.4 仲裁人 (Arbiter) 机制

**v1.1 决策：初始仲裁人 = Nexus 管理钱包 (nexusOperator)**

初始阶段，Nexus 管理钱包同时承担 operator (release 权限) 和 arbiter (dispute resolve 权限) 两个角色。这简化了部署和运营，后续可通过 `setArbiter()` 更换为独立的仲裁人地址。

| 规则 | 说明 |
| --- | --- |
| **初始仲裁人** | 合约 constructor 自动设置 `arbiter = nexusOperator` (Nexus 管理钱包) |
| **任命方式** | 合约 owner 通过 `setArbiter(address, bool)` 任命或撤销 |
| **后续更换** | 部署后可随时通过 `setArbiter()` 更换为独立仲裁人或多签钱包 |
| **仲裁人数量** | MVP 阶段 1 名 (= nexusOperator)，后续可扩展为 DAO 投票 |
| **裁决权限** | 仅可裁决 DISPUTED 状态的支付 |
| **裁决灵活性** | 支持 0-10000 基点的按比例分配 |
| **裁决时限** | 建议 7 天内完成裁决 (链下约束) |
| **仲裁人激励** | 后续版本引入仲裁费 (从 protocolFee 中分配) |

```
初始部署状态:
  nexusOperator 钱包
  ├── coreOperator: true   (可调用 release)
  ├── arbiter: true        (可调用 resolve)
  └── Relayer: 同一钱包     (代付 Gas)

后续可拆分为:
  nexusOperator  -> coreOperator (release)
  arbiterWallet  -> arbiter (resolve)
  relayerWallet  -> Relayer (代付 Gas)
```

### 6.5 争议窗口与释放窗口的关系

```
时间轴:
|──── depositedAt ────|──── disputeDeadline (72h) ────|
|──── depositedAt ────|────────── releaseDeadline (24h) ────|

关键约束:
- disputeDeadline > releaseDeadline (争议窗口长于释放窗口)
- 在 releaseDeadline 之前：商户可 release，用户可 dispute
- releaseDeadline ~ disputeDeadline 之间：用户仍可 dispute，但商户已无法 release (自动退款生效)
- disputeDeadline 之后：既不能 dispute 也不能 release，只能 refund

建议参数:
- defaultReleaseTimeout: 24 hours (86400 seconds)
- defaultDisputeWindow: 72 hours (259200 seconds)
```

---

## 7. 对现有架构的影响评估

### 7.1 受影响组件矩阵

| 组件 | 影响级别 | 变更范围 | 说明 |
| --- | --- | --- | --- |
| **RFC-005v2 (Payment Core)** | 中等 | 新增 Escrow 路由分支 | 不改动 Direct Transfer 逻辑，新增 Escrow 路径 |
| **PRD-001 (产品需求)** | 中等 | 新增模块 B2, 扩展模块 C | 新增 Escrow 合约模块，扩展状态机 |
| **状态机 (Module C)** | 高 | 新增 4 个状态 + 转换规则 | ESCROWED, DISPUTE_OPEN, DISPUTE_RESOLVED, REFUNDED |
| **Chain Watcher (Module B)** | 高 | 新增合约事件监听 | 监听 PaymentDeposited / PaymentReleased / PaymentRefunded / DisputeResolved |
| **Relayer 服务** | 新增 | 全新子模块 | 钱包管理、交易队列、余额监控、EIP-3009 签名转发 |
| **MCP Tools** | 中等 | 修改 2 个, 新增 3 个 | orchestrate_payment 路由, 新增 submit_eip3009_signature/release/dispute |
| **Webhook (RFC-009)** | 低 | 新增 3 个事件类型 | payment.escrowed, payment.refunded, dispute.opened |
| **数据库 Schema** | 中等 | 新增字段 + 索引 | payments 表新增 escrow 相关字段 |
| **Merchant Agent** | 低 | 调整 Webhook 处理 | 处理新增的 Webhook 事件类型 |
| **src/contracts/** | 新增 | 全新模块 | Solidity 合约 + 部署脚本 + 测试 |

### 7.2 数据库 Schema 变更

在 `payments` 表新增以下字段：

```sql
-- Escrow 相关字段 (payments 表扩展)
ALTER TABLE payments ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'DIRECT_TRANSFER';
ALTER TABLE payments ADD COLUMN escrow_contract TEXT;          -- Escrow 合约地址
ALTER TABLE payments ADD COLUMN escrow_payment_id_bytes32 TEXT; -- bytes32 格式的 paymentId
ALTER TABLE payments ADD COLUMN release_deadline TIMESTAMPTZ;   -- 商户释放截止时间
ALTER TABLE payments ADD COLUMN dispute_deadline TIMESTAMPTZ;   -- 争议发起截止时间
ALTER TABLE payments ADD COLUMN release_tx_hash TEXT;           -- release 交易 hash
ALTER TABLE payments ADD COLUMN refund_tx_hash TEXT;            -- refund 交易 hash
ALTER TABLE payments ADD COLUMN dispute_reason TEXT;            -- 争议原因
ALTER TABLE payments ADD COLUMN arbiter_address TEXT;           -- 仲裁人地址
ALTER TABLE payments ADD COLUMN resolution_merchant_bps INTEGER; -- 仲裁比例
ALTER TABLE payments ADD COLUMN relayer_address TEXT;            -- Relayer 地址
ALTER TABLE payments ADD COLUMN eip3009_nonce TEXT;              -- EIP-3009 nonce (bytes32)

-- 更新状态约束
ALTER TABLE payments DROP CONSTRAINT chk_status;
ALTER TABLE payments ADD CONSTRAINT chk_status CHECK (status IN (
  'CREATED', 'AWAITING_TX', 'BROADCASTED',
  'SETTLED', 'COMPLETED', 'EXPIRED',
  'TX_FAILED', 'RISK_REJECTED',
  -- 新增 Escrow 状态
  'ESCROWED', 'DISPUTE_OPEN', 'DISPUTE_RESOLVED', 'REFUNDED'
));

-- 新增支付方式约束
ALTER TABLE payments ADD CONSTRAINT chk_payment_method CHECK (
  payment_method IN ('DIRECT_TRANSFER', 'ESCROW')
);

-- 新增索引
CREATE INDEX idx_payments_escrow_deadline
  ON payments (release_deadline)
  WHERE status = 'ESCROWED' AND payment_method = 'ESCROW';

CREATE INDEX idx_payments_dispute
  ON payments (status)
  WHERE status = 'DISPUTE_OPEN';
```

### 7.3 新增 Payment Event 类型

```typescript
type PaymentEventType =
  // 原有事件 (保留)
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
  // 新增 Escrow 事件
  | "ESCROW_DEPOSITED"      // 资金存入合约
  | "ESCROW_RELEASED"       // 资金释放给商户
  | "ESCROW_REFUNDED"       // 超时退款
  | "DISPUTE_OPENED"        // 用户发起争议
  | "DISPUTE_RESOLVED";     // 仲裁完成
```

### 7.4 新增 Webhook 事件类型

| 事件类型 | 触发时机 | 商户预期行为 |
| --- | --- | --- |
| `payment.escrowed` | 用户资金已存入 Escrow 合约 | 开始履约 (出票/发货) |
| `payment.refunded` | 超时自动退款完成 | 标记订单取消，释放库存 |
| `dispute.opened` | 用户发起争议 | 准备争议材料、联系仲裁人 |
| `dispute.resolved` | 仲裁人裁决完成 | 根据裁决结果更新内部状态 |

### 7.5 Chain Watcher 扩展

```
Chain Watcher 扩展 (Escrow 模式):

监听事件列表 (xNexusEscrow 合约):
1. PaymentDeposited(paymentId, payer, merchant, amount, ...)
   -> Core: BROADCASTED -> ESCROWED
   -> Webhook: payment.escrowed

2. PaymentReleased(paymentId, merchant, merchantAmount, protocolFee)
   -> Core: ESCROWED -> SETTLED
   -> Webhook: payment.settled

3. PaymentRefunded(paymentId, payer, amount, reason)
   -> Core: ESCROWED -> REFUNDED
   -> Webhook: payment.refunded

4. PaymentDisputed(paymentId, payer, reason)
   -> Core: ESCROWED -> DISPUTE_OPEN
   -> Webhook: dispute.opened

5. DisputeResolved(paymentId, arbiter, toMerchant, merchantAmount, payerAmount)
   -> Core: DISPUTE_OPEN -> DISPUTE_RESOLVED
   -> Webhook: dispute.resolved

轮询策略:
- 每 3 秒查询 xNexusEscrow 合约的新事件
- 使用 getLogs 过滤 fromBlock -> latestBlock
- 根据 paymentId 匹配 Core 中的 payment 记录
```

### 7.6 对 RFC-005v2 的兼容性处理

**原则：向后兼容，增量扩展**

RFC-005v2 不做破坏性变更。以下是兼容性策略：

| 场景 | 处理方式 |
| --- | --- |
| 商户不支持 Escrow | 默认走 Direct Transfer，行为不变 |
| Quote 无 payment_method 字段 | 默认 `DIRECT_TRANSFER` |
| 原有 MCP Tool 调用 | 完全兼容，无需修改 |
| 新增 Escrow 字段 | 所有新字段均为可选 (nullable) |
| 状态机扩展 | 原有 8 个状态不受影响，新增 4 个状态仅 Escrow 模式使用 |

---

## 8. 目录结构

### 8.1 合约目录结构

```
src/contracts/
├── src/
│   ├── xNexusEscrow.sol        # 主合约 (含 depositWithAuthorization)
│   └── interfaces/
│       └── IERC3009.sol           # EIP-3009 接口定义
│
├── test/
│   ├── xNexusEscrow.t.sol      # Foundry 单元测试
│   ├── xNexusEscrow.gas.t.sol  # Gas 消耗测试
│   └── mocks/
│       └── MockUSDC.sol          # EIP-3009 mock USDC (测试用)
│
├── script/
│   ├── Deploy.s.sol              # 部署脚本 (含 nexusOperator 设置)
│   └── SetupArbiter.s.sol        # 仲裁人更换脚本
│
├── foundry.toml                  # Foundry 配置
├── remappings.txt                # 依赖映射
└── README.md                     # 合约文档
```

### 8.2 Relayer 模块目录结构

```
src/nexus-core/
├── relayer/
│   ├── relayer-service.ts         # Relayer 服务入口
│   ├── relayer-wallet.ts          # 钱包管理 (签名 + nonce 管理)
│   ├── relayer-tx-queue.ts        # 交易队列 (排队 + 重试 + 去重)
│   ├── relayer-balance-monitor.ts # LAT 余额监控 + 告警
│   └── relayer-config.ts          # Relayer 配置 (阈值、重试策略等)
│
├── eip3009/
│   ├── eip3009-sign-builder.ts    # 生成 EIP-3009 签名参数 (TypedData)
│   └── eip3009-types.ts           # EIP-3009 TypedData 类型定义
│
└── escrow/
    ├── escrow-instruction-builder.ts # 构建 EscrowInstruction
    ├── escrow-watcher.ts             # 监听合约事件
    ├── release-handler.ts            # 通过 Relayer 调用 release
    ├── refund-handler.ts             # 超时退款 (Relayer 自动执行)
    └── dispute-handler.ts            # 争议处理
```

---

## 9. ISO 20022 合规扩展

### 9.1 Escrow 模式的 ISO 映射

Escrow 模式引入了更丰富的支付生命周期，需要扩展 ISO 20022 映射：

| Nexus 字段 | ISO 20022 Element | 说明 |
| --- | --- | --- |
| `payment_method: "ESCROW"` | `PmtMtd` | 支付方式标识 |
| `escrow_contract` | `IntrmyAgt` | 中介机构 (Escrow 合约) |
| `release_deadline` | `ReqdExctnDt` | 要求执行日期 |
| `dispute_reason` | `RtrRsnInf/AddtlInf` | 退款/争议原因 |
| `resolution_merchant_bps` | `SttlmInf/SttlmAmt` | 裁决分配比例 |
| `refund_tx_hash` | `OrgnlTxRef/OrgnlTxId` | 原始交易引用 |

### 9.2 会计科目映射

在 Escrow 模式下，资金的会计科目映射遵循 IFRS 15 (收入确认准则)：

```
用户 deposit 时:
  借: 预付款项 (Prepayments)                    530 USDC
  贷: 银行存款/钱包余额 (Cash/Wallet)            530 USDC
  (ISO 20022: CstmrCdtTrfInitn - 客户贷记转账启动)

商户 release 时:
  借: 应收账款 (Receivables)                     528.41 USDC
  贷: 营业收入 (Revenue)                         528.41 USDC
  借: 手续费 (Service Charges)                   1.59 USDC
  贷: 预付款项 (Prepayments)                     530 USDC
  (ISO 20022: PmtStsRpt - 支付状态报告, Status=ACSC)

超时退款时:
  借: 银行存款/钱包余额 (Cash/Wallet)            530 USDC
  贷: 预付款项 (Prepayments)                     530 USDC
  (ISO 20022: PmtRtr - 支付退回)

仲裁按比例裁决时:
  借: 银行存款/钱包余额 (Cash/Wallet)            265 USDC  (用户份额)
  借: 应收账款 (Receivables)                     265 USDC  (商户份额)
  贷: 预付款项 (Prepayments)                     530 USDC
  (ISO 20022: PmtStsRpt - 部分退回)
```

---

## 10. 安全考量

### 10.1 合约安全清单

- [x] **ReentrancyGuard**: 所有资金操作函数添加 nonReentrant 修饰符
- [x] **SafeERC20**: 使用 OpenZeppelin SafeERC20 防止非标准 ERC-20 问题
- [x] **整数溢出**: Solidity 0.8+ 内置溢出检查
- [x] **零地址检查**: 所有地址参数检查非零
- [x] **状态检查**: 每个函数严格检查当前状态
- [x] **权限控制**: onlyArbiter, onlyCoreOrMerchant, onlyPayer 修饰符
- [x] **防重放**: paymentId 唯一性约束 + EIP-3009 nonce 唯一性 (USDC 合约内部保证)
- [x] **手续费上限**: protocolFeeBps <= 500 (最高 5%)
- [x] **EIP-3009 签名验证**: USDC 合约内部验证 EIP-712 TypedData 签名，合约无需额外验证
- [x] **Relayer 无资金风险**: Relayer 仅承担 Gas，不持有或托管用户 USDC

### 10.2 威胁模型 (Escrow 特有)

| 威胁 | 影响 | 缓解措施 |
| --- | --- | --- |
| **Core 操作员私钥泄露** | 攻击者可调用 release 提取所有 Escrow 资金 | 多签钱包作为 Core operator；限制 release 仅能转到 record.merchant |
| **仲裁人合谋** | 仲裁人与一方合谋做出不公正裁决 | 多仲裁人机制；裁决公开透明可审计 |
| **重入攻击** | 恶意 ERC-20 在 transfer 回调中重入 | ReentrancyGuard + SafeERC20 |
| **时间操纵** | 矿工/验证者操纵 block.timestamp | PlatON 出块时间稳定 (~1s)；超时窗口设置为小时级别 |
| **前端欺骗** | 伪造 deposit calldata 中的 merchant 地址 | Core 从 DID 注册表解析 merchant 地址，不信任前端 |
| **Griefing Attack** | 恶意用户反复 deposit + dispute 占用仲裁资源 | 后续版本引入 dispute 保证金 |
| **Relayer 私钥泄露** | 攻击者可消耗 Relayer LAT 余额 (但无法窃取 USDC) | Relayer 钱包仅持有少量 LAT；KMS 保管私钥；余额监控告警 |
| **Relayer 拒绝服务** | Relayer 宕机导致无法提交交易 | 备用 Relayer 钱包热备；用户仍可通过 deposit() 直接交互 |
| **EIP-3009 签名重放** | 攻击者截获签名重放到其他链 | EIP-712 domain 含 chainId=210425；USDC 合约内部检查 nonce 唯一性 |

### 10.3 合约审计策略

**决策：采用 AI 审计，不使用外部审计机构。**

| 审计方式 | 说明 |
| --- | --- |
| **AI 审计** | 合约完成后使用 AI 工具进行全面安全审计 |
| **Foundry Fuzz Testing** | 使用 Foundry 的 fuzz testing 覆盖边界条件 |
| **Invariant Testing** | 编写不变量测试验证合约状态一致性 |
| **Slither 静态分析** | 使用 Slither 检测常见漏洞模式 |
| **内部 Code Review** | 团队内部代码审查 |

### 10.4 合约升级策略 (v2.0.0 更新)

**v2.0.0 决策变更：已采用 UUPS 代理模式。**

合约使用 OpenZeppelin `UUPSUpgradeable` + `Initializable` 实现可升级代理：
- Proxy 地址: `0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236` (稳定入口)
- Implementation: `0x2EF4dB5E0021d074286c36821Cc897d2605e542E` (v4.0.0)
- 升级权限: `onlyOwner` (通过 `_authorizeUpgrade` 限制)
- 好处: 无需迁移未结算的 Escrow，proxy 地址不变

---

## 11. EIP-3009 + Relayer 代付服务设计

### 11.1 设计决策背景

PlatON 链上的 USDC 支持 EIP-3009 (`transferWithAuthorization`)，而非 EIP-2612 (Permit)。EIP-3009 的核心优势在于：

| 特性 | EIP-2612 (Permit) | EIP-3009 (TransferWithAuthorization) |
| --- | --- | --- |
| **授权方式** | 签名授权 allowance，仍需调用 transferFrom | 签名直接授权转账，一步完成 |
| **用户操作** | 签名 + 发送交易 (或由 spender 在同一交易中调用 permit + transferFrom) | 仅签名，任何人 (Relayer) 可代为提交 |
| **Nonce 管理** | 递增 nonce，与其他 permit 串行 | 随机 bytes32 nonce，完全并行 |
| **Gas 承担** | 调用者支付 | 任何人 (Relayer) 提交即支付 Gas |
| **PlatON USDC 支持** | 不支持 | 支持 |

因此，我们采用 EIP-3009 + Relayer 代付方案，实现用户完全零 Gas 的支付体验。

### 11.2 Relayer 服务架构

Relayer 作为 xNexus Core 的一个子模块，负责代用户提交链上交易并支付 Gas。

```
                                 xNexus Core
                  ┌─────────────────────────────────────────┐
                  │                                         │
                  │  ┌──────────────┐  ┌──────────────────┐ │
                  │  │ Payment      │  │ Chain Watcher    │ │
                  │  │ Orchestrator │  │ (Event Listener) │ │
                  │  └──────┬───────┘  └──────────────────┘ │
                  │         │                               │
                  │  ┌──────▼───────────────────────────┐   │
                  │  │       Relayer Service             │   │
                  │  │                                   │   │
                  │  │  ┌─────────────────────────────┐ │   │
                  │  │  │ Relayer Wallet (持有 LAT)     │ │   │
                  │  │  │ - 签名并提交链上交易           │ │   │
                  │  │  │ - Gas 费用由 LAT 余额支付      │ │   │
                  │  │  └─────────────────────────────┘ │   │
                  │  │                                   │   │
                  │  │  ┌─────────────────────────────┐ │   │
                  │  │  │ Transaction Queue           │ │   │
                  │  │  │ - 排队 + 重试 + nonce 管理    │ │   │
                  │  │  └─────────────────────────────┘ │   │
                  │  │                                   │   │
                  │  │  ┌─────────────────────────────┐ │   │
                  │  │  │ Balance Monitor             │ │   │
                  │  │  │ - LAT 余额监控              │ │   │
                  │  │  │ - 低余额告警                 │ │   │
                  │  │  │ - 自动充值触发               │ │   │
                  │  │  └─────────────────────────────┘ │   │
                  │  └──────────────────────────────────┘   │
                  └─────────────────────────────────────────┘
```

### 11.3 Relayer 职责范围

| 职责 | 说明 | 调用的合约函数 |
| --- | --- | --- |
| **代提交 deposit** | 接收用户 EIP-3009 签名，调用 `depositWithAuthorization()` | `depositWithAuthorization(...)` |
| **代提交 release** | 商户确认履约后，Core 通过 Relayer 释放资金 | `release(paymentId)` |
| **代提交 refund** | 超时退款定时任务，Relayer 自动调用 | `refund(paymentId)` |
| **代提交 dispute** | 用户发起争议时，可通过 Relayer 代为提交 (可选) | `dispute(paymentId, reason)` |
| **代提交 resolve** | 仲裁人裁决时，通过 Relayer 提交 (仲裁人签名) | `resolve(paymentId, merchantBps)` |

### 11.4 Relayer 钱包管理

#### LAT 余额监控与充值

```
Relayer Balance Monitor (定时任务, 每 5 分钟):

1. 查询 Relayer 钱包 LAT 余额
2. 计算余额阈值:
   - WARNING_THRESHOLD: 10 LAT  (约可支付 ~50 笔 Escrow 交易)
   - CRITICAL_THRESHOLD: 2 LAT  (约可支付 ~10 笔 Escrow 交易)
3. 如果余额 < WARNING_THRESHOLD:
   a. 发送告警通知 (邮件/Slack/Webhook)
   b. 记录日志: "Relayer LAT 余额低于警告阈值"
4. 如果余额 < CRITICAL_THRESHOLD:
   a. 发送紧急告警
   b. 触发自动充值流程 (从 Nexus 运营钱包转入 LAT)
   c. 暂停非关键交易 (仅保留 refund)
5. 记录余额到监控数据库 (用于趋势分析)
```

#### Gas 成本核算

```
单笔 Escrow 交易 Relayer Gas 成本估算:

depositWithAuthorization:  ~140,000 gas
release:                    ~80,000 gas
-----------------------------------
总计:                      ~220,000 gas / 笔

PlatON Gas Price (当前): ~1 gwei
单笔成本: 220,000 * 1 gwei = 0.00022 LAT

协议手续费 (0.3%):
- 100 USDC 交易: 手续费 0.3 USDC >> Gas 成本 ~0.00022 LAT
- 即使 Gas Price 涨 10x，手续费仍远大于 Gas 成本

结论: 协议手续费完全可以覆盖 Relayer Gas 成本，且有充足余量
```

### 11.5 Relayer 安全设计

| 安全措施 | 说明 |
| --- | --- |
| **最小权限** | Relayer 钱包仅作为 `coreOperator`，不持有用户资金 |
| **Nonce 管理** | 使用本地 nonce 管理器，防止 nonce 冲突和交易重放 |
| **签名验证** | Relayer 在提交前验证 EIP-3009 签名的有效性 (链下模拟) |
| **金额上限** | 单笔交易金额上限检查，超过阈值需要额外审批 |
| **速率限制** | 限制单个用户地址的提交频率，防止恶意刷 Gas |
| **私钥安全** | Relayer 私钥存储在安全硬件或 KMS 中，不在代码中硬编码 |
| **交易日志** | 所有 Relayer 交易记录到数据库，可审计追溯 |
| **失败重试** | 交易失败时指数退避重试 (最多 3 次)，仍失败则告警 |

### 11.6 用户体验对比

| 模式 | 用户操作 | 用户链上交易数 | 用户 Gas 成本 | 需要持有 LAT |
| --- | --- | --- | --- | --- |
| Direct Transfer | 1. transfer | 1 | ~65,000 gas | 是 |
| Escrow (传统 approve) | 1. approve 2. deposit | 2 | ~186,000 gas | 是 |
| **Escrow (EIP-3009 + Relayer)** | **1. 签名 (链下)** | **0** | **0** | **否** |

> EIP-3009 + Relayer 方案是用户体验最优的选择：用户仅需在钱包中签署一次授权签名，无需持有 LAT，无需发送任何链上交易。

---

## 12. 开发实施计划

### 12.1 分期计划

#### Phase 0: 合约开发与测试 (1-2 周)

- [ ] 初始化 Foundry 项目 (src/contracts/)
- [ ] 实现 IERC3009 接口定义
- [ ] 实现 xNexusEscrow.sol 核心合约 (含 depositWithAuthorization)
- [ ] 编写 Foundry 单元测试 (100% 分支覆盖)
- [ ] EIP-3009 签名验证测试 (mock USDC with EIP-3009)
- [ ] Gas 消耗基准测试 (depositWithAuthorization vs deposit)
- [ ] PlatON Devnet 部署验证
- [ ] AI 安全审计 + Slither 静态分析

#### Phase 1: Core 扩展 - Escrow 路由 + Relayer (1-2 周)

- [ ] 数据库 migration (新增 Escrow 字段)
- [ ] 扩展 types.ts (新增状态、事件类型)
- [ ] 扩展 state-machine.ts (新增状态转换规则)
- [ ] 实现 eip3009-sign-builder.ts (生成 EIP-3009 签名参数)
- [ ] 实现 escrow-instruction-builder.ts (构建 EscrowInstruction)
- [ ] 修改 orchestrate-payment.ts (payment_method 路由)
- [ ] 实现 Relayer 服务核心模块:
  - [ ] relayer-wallet.ts (钱包管理 + 签名)
  - [ ] relayer-tx-queue.ts (交易队列 + nonce 管理 + 重试)
  - [ ] relayer-balance-monitor.ts (LAT 余额监控 + 告警)
- [ ] 新增 MCP Tool: nexus_submit_eip3009_signature

#### Phase 2: Chain Watcher 扩展 (1 周)

- [ ] 新增 escrow-watcher.ts (监听合约事件)
- [ ] 实现 Escrow 事件到 Core 状态的映射
- [ ] 实现 release-handler.ts (通过 Relayer 调用合约 release)
- [ ] 实现 refund-handler.ts (Relayer 自动执行超时退款)
- [ ] 新增 MCP Tool: nexus_release_payment

#### Phase 3: 纠纷处理 (1 周)

- [ ] 实现 dispute-handler.ts (通过 Relayer 代为提交)
- [ ] 新增 MCP Tool: nexus_dispute_payment
- [ ] 扩展 Webhook 事件类型
- [ ] 实现仲裁人管理接口
- [ ] 端到端测试 (EIP-3009 签名 -> Relayer 上链 -> 完整 Escrow 流程)

#### Phase 4: PlatON 主网部署 (1 周)

- [ ] AI 安全审计最终轮 + Foundry fuzz/invariant 测试
- [ ] PlatON 主网部署 (设置 nexusOperator 为初始 arbiter + operator)
- [ ] Relayer 钱包充值 LAT + 余额监控配置
- [ ] Core 配置更新 (合约地址、operator 设置、Relayer 钱包地址)
- [ ] 商户引导 (Escrow 模式接入文档)
- [ ] Relayer 运营监控告警配置

### 12.2 技术栈新增

| 组件 | 技术选型 | 说明 |
| --- | --- | --- |
| 合约开发 | Solidity 0.8.20 | OpenZeppelin v5 + IERC3009 接口 |
| 合约测试 | Foundry (forge) | Fuzz testing + Invariant testing + Gas report |
| 合约部署 | Foundry (forge script) | 确定性部署 |
| ABI 编码 | viem | encodeFunctionData / decodeFunctionResult |
| 事件解析 | viem | decodeEventLog |
| EIP-3009 签名 | viem | signTypedData (EIP-712) |
| Relayer | ethers.js / viem | 交易构建 + 签名 + 提交 |
| 安全审计 | AI + Slither | AI 审计 + 静态分析工具 |

---

## 13. 功能价值分析

### 13.1 Escrow 模式价值评估框架

| 指标 | 定义 | 统计方法 | 数据来源 |
| --- | --- | --- | --- |
| **Escrow 采用率** | Escrow 支付数 / 总支付数 | 比率计算，按日/周/月 | payments 表 payment_method 字段 |
| **Escrow 成功释放率** | RELEASED 数 / DEPOSITED 数 | 比率计算 (目标 > 95%) | payments 表 + 合约事件 |
| **超时退款率** | REFUNDED 数 / DEPOSITED 数 | 比率计算 (目标 < 3%) | payments 表 |
| **争议发生率** | DISPUTE_OPEN 数 / DEPOSITED 数 | 比率计算 (目标 < 1%) | payments 表 |
| **平均 Escrow 时长** | deposit 到 release 的平均时间 | 中位数 + P95 | payment_events 时间差 |
| **仲裁裁决时效** | dispute 到 resolve 的平均时间 | 中位数 (目标 < 72h) | payment_events 时间差 |
| **Gas 成本比较** | Relayer 承担的 Gas 总成本 vs 协议手续费收入 | 均值对比 + 比率 | 链上交易数据 + Relayer 余额变化 |
| **Relayer 可用性** | Relayer 交易成功率 + 平均确认时间 | 成功率 (目标 > 99.5%) + P95 延迟 | Relayer 交易日志 |
| **协议手续费收入** | protocolFee 总额 | 求和，按日/周/月 | 合约事件 PaymentReleased |
| **用户满意度** | 纠纷后重复购买率 | 队列分析 | payments + merchant_registry |
| **商户信任度** | 商户 Escrow 模式启用率 | 比率 (目标 > 50%) | merchant_registry |

### 13.2 输入指标 vs 结果指标

**输入指标 (可直接优化):**
- Relayer Gas 成本 (优化合约 Gas 消耗 + Relayer 交易策略)
- Relayer LAT 余额充足率
- 默认超时时间参数
- 争议窗口时长
- 仲裁响应时效

**结果指标 (反映产品价值):**
- Escrow 成功释放率 (目标 > 95%) -- 商户正常履约的比例
- 超时退款率 (目标 < 3%) -- 异常交易的比例
- 争议发生率 (目标 < 1%) -- 交易纠纷的比例
- 协议手续费收入 -- 直接商业价值

### 13.3 指标关系链

```
零 Gas 体验 (EIP-3009 + Relayer) ──► 用户进入门槛降低 ──► Escrow 采用率
Relayer 可用性 ──► 交易提交及时性 ──► 用户体验 ──► 用户信任度
超时参数设置 ──► 商户履约及时性 ──► Escrow 成功释放率 ──► 用户信任度
争议窗口时长 ──► 用户追索能力 ──► 争议发生率 ──► 平台公正性感知
仲裁响应时效 ──► 纠纷解决效率 ──► 用户满意度 ──► 复购率
协议手续费率 ──► 商户接受度 ──► Escrow 采用率 ──► 协议收入 (需覆盖 Relayer 成本)
```

---

## 14. 后续规划

### 14.1 v1.2 增强

1. **批量 Release**：商户一次性释放多笔 Escrow
2. **Dispute 保证金**：防止恶意 dispute griefing attack
3. **仲裁费机制**：从协议手续费中分配仲裁人激励
4. **独立仲裁人**：将 arbiter 角色从 nexusOperator 分离为独立地址

### 14.2 v2.0 架构升级

1. **可升级合约**：引入 EIP-1967 Transparent Proxy
2. **多币种支持**：支持 USDT、DAI 等其他 ERC-20
3. **跨链 Escrow**：与 RFC-007 Hub-Spoke 架构集成
4. **DAO 仲裁**：去中心化仲裁人选举与投票机制
5. **分账 (Split Payment)**：合约原生支持多方分账
6. **链上 DID 注册表**：NexusMerchantRegistry 合约集成
7. **多 Relayer 支持**：Relayer 竞争机制，提高可用性和去中心化程度

### 14.3 已决策事项 (v1.1 更新)

| 编号 | 议题 | 决策 | 影响 |
| --- | --- | --- | --- |
| 1 | PlatON USDC 是否支持 EIP-2612 Permit | **不支持 Permit，支持 EIP-3009 (transferWithAuthorization)** | 合约改用 depositWithAuthorization，取消 depositWithPermit |
| 2 | Gas 费由谁承担 | **Relayer 代付，Gas 成本从协议手续费 (0.3%) 中覆盖** | 新增 Relayer 服务模块；用户无需持有 LAT |
| 3 | 仲裁人选拔标准 | **初始阶段 arbiter = nexusOperator (Nexus 管理钱包)，后续可通过 setArbiter() 更换** | 合约 constructor 自动设置；简化部署 |
| 4 | 合约安全审计 | **不使用外部审计，合约完成后用 AI 审计 + Slither + Foundry fuzz/invariant 测试** | 降低成本和时间；Phase 0 和 Phase 4 各做一轮 |

### 14.4 仍待讨论事项

1. **争议保证金金额**：设置多少比较合理？建议 Escrow 金额的 1-5%
2. **跨链 Escrow 架构**：是在源链 deposit、目标链 release，还是统一在 PlatON Hub？
3. **合约保险**：是否需要引入 DeFi 保险协议覆盖合约风险？
4. **隐私保护**：链上事件是否暴露了过多的商业信息？是否需要零知识证明？
5. **Relayer 多钱包策略**：是否需要多个 Relayer 钱包轮换以提高吞吐量？
6. **dispute 的 Gas 承担**：用户发起 dispute 时，Relayer 是否也代付？(存在恶意 dispute 风险)

---

## 15. 版权声明

Copyright (c) 2026 Nexus Protocol. All Rights Reserved.

---

*文档版本 1.1.0 - 2026-02-24*
*本 RFC 与 RFC-005v2 (Direct Transfer) 并行有效，两种支付模式共存。*

### 变更记录

| 版本 | 日期 | 变更内容 |
| --- | --- | --- |
| 1.0.0 | 2026-02-24 | 初版：Escrow 合约设计，EIP-2612 Permit 可选增强 |
| 1.1.0 | 2026-02-24 | **重大更新**：EIP-2612 -> EIP-3009；新增 Relayer 代付服务；arbiter = nexusOperator；AI 审计策略 |
| 2.0.0 | 2026-02-26 | **v4.0.0 合约实现同步**：详见下方 v2.0.0 变更清单 |

---

## Appendix A: v2.0.0 变更清单 (2026-02-26)

以下记录 RFC-010 v2.0.0 与实际部署的 xNexusEscrow v4.0.0 合约的对齐变更。

### A.1 UUPS 代理模式

合约从非升级模式改为 UUPS 可升级代理：
- 继承 `Initializable` + `UUPSUpgradeable` (OpenZeppelin v5)
- 使用 `initialize()` 替代 `constructor()`
- `_authorizeUpgrade()` 限制为 `onlyOwner`
- Proxy 地址固定，升级仅更换 implementation

```
Proxy: 0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236
Implementation (v4.0.0): 0x2EF4dB5E0021d074286c36821Cc897d2605e542E
```

### A.2 批量存款 (Batch Deposits)

新增 `batchDepositWithAuthorization()` 函数，支持多笔支付在一次交易中完成：

```solidity
function batchDepositWithAuthorization(
    BatchEntry[] calldata entries,
    address from,
    uint256 totalAmount,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v, bytes32 r, bytes32 s
) external nonReentrant
```

- `BatchEntry` 包含: `paymentId`, `merchant`, `amount`, `orderRef`, `merchantDid`, `contextHash`
- `MAX_BATCH_SIZE = 20` (防 Gas griefing 攻击, M-02 审计修复)
- `totalAmount` 必须等于所有 entries 的 amount 之和

### A.3 Group 签名验证 (Anti-MITM)

新增 `batchDepositWithGroupApproval()` 函数，在批量存款基础上增加 EIP-712 Group 签名验证：

```solidity
function batchDepositWithGroupApproval(
    BatchEntry[] calldata entries,
    address from,
    uint256 totalAmount,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v, bytes32 r, bytes32 s,
    bytes32 groupId,
    uint8 groupV, bytes32 groupR, bytes32 groupS
) external nonReentrant
```

EIP-712 TypeHash:
```
NexusGroupApproval(bytes32 groupId, bytes32 entriesHash, uint256 totalAmount)
```

- `entriesHash = keccak256(abi.encode(entries))`
- 签名者必须是 `coreOperator`
- `groupId` 防重放 (`usedGroupIds` mapping)
- `requireGroupSig` 管理员开关，设为 true 时强制所有批量存款使用此函数

### A.4 RESOLVED_SPLIT 状态

新增 `EscrowStatus.RESOLVED_SPLIT` (value = 7)：
- 仲裁时 `merchantBps` 在 1-9999 之间时使用此状态
- `merchantBps = 0` → `RESOLVED_TO_PAYER`
- `merchantBps = 10000` → `RESOLVED_TO_MERCHANT`
- 其他值 → `RESOLVED_SPLIT` (M-03 审计修复)

### A.5 feeBps 快照

Escrow 结构体新增 `feeBps` 字段，在 deposit 时快照当前 `protocolFeeBps`：
- 防止 admin 修改费率后影响已存入的 Escrow (L-04 审计修复)
- `release()` 使用 `e.feeBps` 而非全局 `protocolFeeBps`

### A.6 refundUnresolvedDispute()

新增公开函数，用于仲裁超时后自动退款：

```solidity
function refundUnresolvedDispute(bytes32 paymentId) external nonReentrant
```

- 状态必须为 `DISPUTED`
- 必须超过 `arbitrationTimeout` (7 天, 默认 604800000 ms)
- 全额退款给 payer (H-01 审计修复)

### A.7 PlatON 毫秒时间戳

**关键发现**: PlatON Devnet EVM 的 `block.timestamp` 使用**毫秒**而非秒。

所有时间参数（超时、窗口）必须以毫秒为单位：
- `defaultReleaseTimeout`: 86400000 (24h in ms)
- `defaultDisputeWindow`: 259200000 (72h in ms)
- `arbitrationTimeout`: 604800000 (7d in ms)
- EIP-3009 `validBefore` / `validAfter`: 毫秒

### A.8 部署参数 (实际值)

| 参数 | 值 | 说明 |
| --- | --- | --- |
| USDC | `0xFF8dEe9983768D0399673014cf77826896F97e4d` | PlatON Devnet USDC (FiatToken) |
| chain_id | 20250407 | PlatON Devnet |
| defaultReleaseTimeout | 86400000 (24h ms) | 商户履约超时 |
| defaultDisputeWindow | 259200000 (72h ms) | 争议窗口 |
| arbitrationTimeout | 604800000 (7d ms) | 仲裁超时 |
| protocolFeeBps | 30 (0.3%) | 协议手续费 |
| protocolFeeRecipient | Relayer/Owner 地址 | 手续费收款 |
| coreOperator | `0xf7EA5d3f0Bf8185c4f3C2F405D9a71009CF4D920` | 也作为 Relayer |
| arbiter | 同 coreOperator | 初始仲裁人 |
| requireGroupSig | true | 强制 Group 签名验证 |

### A.9 PlatON 部署注意事项

- 必须使用 `--legacy` flag (EIP-1559 交易在 PlatON 上 gas price 为 1 wei，太低)
- 使用 `--with-gas-price 20000000000` (20 gwei，网络最低 ~10 gwei)
- PlatON 不支持交易替换，使用 `--legacy` 以避免 pending 交易问题
