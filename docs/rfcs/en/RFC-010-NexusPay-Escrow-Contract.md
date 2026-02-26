# RFC-010: NexusPay Escrow Smart Contract Specification

| Metadata | Value |
| --- | --- |
| **Title** | NexusPay Escrow Smart Contract Specification |
| **Version** | 2.0.0 |
| **Status** | Standards Track (Draft) |
| **Authors** | Cipher & Nexus Architect Team |
| **Created** | 2026-02-24 |
| **Updated** | 2026-02-26 |
| **Dependencies** | RFC-005v3 (Payment Core MVP), RFC-009 (Webhook Standard), RFC-001 (DID) |
| **Target Chain** | PlatON Devnet (chain_id: 20250407) |
| **Payment Currency** | USDC (ERC-20, 6 decimals) |
| **Contract Standards** | ERC-20 (IERC20), EIP-3009 (transferWithAuthorization), OpenZeppelin v5 |
| **Gas Model** | Relayer-sponsored (zero Gas for users) |

---

## 1. Abstract

This RFC defines the complete specification for the NexusPay Escrow smart contract. The contract acts as a payment guarantor, implementing a guaranteed transaction flow of "user payment -> fund locking -> merchant fulfillment -> fund release". Complementing the Direct Transfer mode from RFC-005v2, it provides on-chain security guarantees for high-value transactions, cross-chain payments, and dispute arbitration.

**v1.1 Core Changes**: Adopts EIP-3009 (`transferWithAuthorization`) to replace EIP-2612 Permit, combined with a Relayer-sponsored service, achieving a completely gas-free payment experience for users. Users only need to sign an EIP-3009 authorization signature, and the Relayer submits the on-chain transaction on their behalf, with Gas fees covered by the Relayer from protocol fees.

Core upgrade value:

1. **Zero Gas Payment Experience**: Through EIP-3009 + Relayer sponsorship, users can complete Escrow payments without holding LAT
2. **On-chain Parameter Carrying**: Custom events carry complete business data including order_ref, merchant_did, payment_id, etc.
3. **Fund Guarantee**: After user payment, funds are locked in the contract; merchants can only withdraw after confirming fulfillment
4. **Automatic Refund**: Funds are automatically returned to users if fulfillment times out
5. **Dispute Arbitration**: Introduces an arbiter role with on-chain enforcement of dispute resolutions
6. **Cross-chain Ready**: Contract address can serve as a settlement endpoint for cross-chain bridges

---

## 2. Motivation

### 2.1 Limitations of the Current Approach

The Direct Transfer mode defined in RFC-005v2 has the following fundamental limitations:

| Problem | Description | Impact |
| --- | --- | --- |
| **No on-chain context** | ERC-20 `transfer(to, amount)` has only 2 parameters | Cannot associate order numbers, merchant identity, or other business data on-chain |
| **No recourse** | Fund transfers are irreversible | Users have no on-chain recourse when merchants fail to fulfill |
| **No guarantee capability** | Funds go directly to merchants | Cannot implement "pay first, deliver later, then release funds" secure transactions |
| **Cross-chain incompatible** | Regular transfer cannot carry calldata | Cross-chain bridge relayers cannot pass business parameters to the target chain |
| **Audit difficulties** | Only Transfer events on-chain | Auditors cannot reconstruct complete payment context from on-chain data |

### 2.2 Value of the Escrow Contract

```
Direct Transfer (current)              Escrow Contract (proposed)
---------------------              ----------------------
User --transfer--> Merchant        User --deposit--> Contract --release--> Merchant
                                                        |
                                                   timeout? --refund--> User
                                                   dispute? --arbitrate--> arbitration ruling
```

---

## 3. Comparative Analysis: Direct Transfer vs Smart Contract Escrow

### 3.1 Multi-dimensional Comparison Matrix

| Dimension | Direct Transfer (RFC-005v2) | Smart Contract Escrow (this RFC) | Assessment |
| --- | --- | --- | --- |
| **Security** | Funds go directly to merchant, irreversible; users have no on-chain recourse if merchant fails to fulfill | Funds locked in contract, supports timeout refund and arbitration enforcement | Escrow significantly better |
| **On-chain Data Completeness** | Only `Transfer(from, to, value)` three fields | Custom events carry `paymentId`, `orderRef`, `merchantDid`, etc. | Escrow significantly better |
| **Extensibility** | Adding split payments, refunds, etc. requires entirely new design | Contract supports upgradeable proxy pattern, can extend with new features | Escrow better |
| **Cross-chain Compatibility** | Cannot serve as cross-chain settlement endpoint | Contract address + calldata can interface with cross-chain bridges | Escrow significantly better |
| **Gas Cost** | transfer ~65,000 gas | deposit ~120,000 gas + release ~80,000 gas | Direct better |
| **User Experience (Steps)** | One step (transfer) | User only signs (EIP-3009), Relayer submits on-chain, zero Gas | Escrow better (zero on-chain operations for user) |
| **Dispute Handling** | Entirely relies on off-chain negotiation, no enforcement power | On-chain automatic refund + arbiter mechanism, enforceable | Escrow significantly better |
| **Accounting Audit Compliance** | Off-chain event tracing, only regular transfers on-chain | On-chain events fully record lifecycle, meets ISO 20022 audit requirements | Escrow better |
| **Deployment Complexity** | No contract deployment needed | Requires contract deployment and security audit | Direct better |
| **Applicable Scenarios** | Small instant payments, high-trust transactions | High-value transactions, cross-border payments, service transactions requiring guarantees | Complementary |

### 3.2 Detailed Gas Cost Estimates (PlatON Mainnet)

| Operation | Gas Consumption | User Bears | Relayer Bears | Description |
| --- | --- | --- | --- | --- |
| ERC-20 `transfer` | ~65,000 | 65,000 | 0 | Direct Transfer mode |
| EIP-3009 signature | 0 | 0 | 0 | User signs off-chain, no on-chain transaction |
| Escrow `depositWithAuthorization` | ~140,000 | 0 | 140,000 | Relayer calls, includes transferWithAuthorization + state write + event emission |
| Escrow `release` | ~80,000 | 0 | 80,000 | Core operator calls |
| Escrow `refund` | ~75,000 | 0 | 75,000 | Timeout refund, anyone can trigger (Relayer auto-executes) |
| **Direct Transfer User Cost** | **~65,000** | **65,000** | **0** | User sends on-chain transaction themselves |
| **Escrow User Cost** | **0** | **0** | **~220,000** | User only signs, Relayer bears all Gas |

> Note: In Escrow mode, users do not need to hold any LAT (PlatON native token). All on-chain transaction fees are borne by the Relayer, with costs covered from the protocol fee (0.3%).

### 3.3 Strategic Decision: Progressive Dual-mode Architecture

**Conclusion**: Do not replace Direct Transfer; instead run Escrow as a second payment mode in parallel.

```
NexusPay Core (RFC-005v2 upgrade)
├── PaymentMethod: DIRECT_TRANSFER  (existing mode, unchanged)
│   └── Suitable for: small instant payments, high-trust merchants
│
└── PaymentMethod: ESCROW_CONTRACT  (new mode, this RFC)
    └── Suitable for: high-value transactions, guaranteed transactions, cross-chain payments, service transactions
```

Merchants select supported payment modes during registration, and Core routes to the corresponding payment channel based on the `payment_method` field in the Quote.

---

## 4. NexusPayEscrow Contract Design

### 4.1 Contract State Machine

```
                    ┌──────────────────┐
                    │     DEPOSITED    │ <-- User calls deposit()
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐  ┌──▼──────────┐  ┌▼───────────────┐
     │   RELEASED     │  │  REFUNDED   │  │   DISPUTED     │
     │  (merchant     │  │ (timeout    │  │  (in dispute)   │
     │   withdrawal)  │  │  refund)    │  │                 │
     └────────────────┘  └─────────────┘  └───────┬────────┘
                                                   │
                                         ┌─────────┼────────────────┐
                                         │         │                │
                                  ┌──────▼──────┐ ┌▼────────────┐ ┌▼───────────────┐
                                  │ RESOLVED_    │ │ RESOLVED_   │ │ RESOLVED_      │
                                  │ TO_MERCHANT  │ │ SPLIT       │ │ TO_PAYER       │
                                  │ (ruled to    │ │ (split      │ │ (ruled to      │
                                  │  merchant)   │ │  pro rata)  │ │  payer)        │
                                  └─────────────┘ └─────────────┘ └────────────────┘
```

### 4.2 Status Enum and Transition Rules

| Status | Value | Meaning | Can Transition To |
| --- | --- | --- | --- |
| `DEPOSITED` | 1 | User has deposited funds, awaiting merchant fulfillment | RELEASED, REFUNDED, DISPUTED |
| `RELEASED` | 2 | Merchant has withdrawn funds (fulfillment complete) | Terminal state |
| `REFUNDED` | 3 | Funds returned to user (timeout or active refund) | Terminal state |
| `DISPUTED` | 4 | User initiated dispute, awaiting arbitration | RESOLVED_TO_MERCHANT, RESOLVED_TO_PAYER, RESOLVED_SPLIT |
| `RESOLVED_TO_MERCHANT` | 5 | Arbitration result: funds go to merchant | Terminal state |
| `RESOLVED_TO_PAYER` | 6 | Arbitration result: funds go to user | Terminal state |
| `RESOLVED_SPLIT` | 7 | Arbitration result: funds split proportionally between both parties (new in v2.0.0) | Terminal state |

### 4.3 Detailed Transition Rules Table

| Current Status | Target Status | Trigger Condition | Caller |
| --- | --- | --- | --- |
| (none) | DEPOSITED | User calls `deposit()` and transfers USDC | payer (user) |
| DEPOSITED | RELEASED | Merchant calls `release()` to withdraw funds | Core or merchant |
| DEPOSITED | REFUNDED | Anyone calls `refund()` after `releaseDeadline` has passed | Anyone (public) |
| DEPOSITED | DISPUTED | User calls `dispute()` within `disputeWindow` | payer (user) |
| DISPUTED | RESOLVED_TO_MERCHANT | Arbiter calls `resolve()` ruling in favor of merchant | arbiter |
| DISPUTED | RESOLVED_TO_PAYER | Arbiter calls `resolve()` ruling in favor of user | arbiter |

### 4.4 EIP-3009 Interface Definition

USDC on the PlatON chain supports EIP-3009 (`transferWithAuthorization`), with the following interface:

```solidity
/**
 * @title IERC3009 - Transfer With Authorization
 * @notice EIP-3009 standard interface, allows off-chain signature-authorized transfers
 * @dev User signs EIP-712 TypedData, authorizing anyone (Relayer) to call this function to execute the transfer
 *      Signature parameters: from, to, value, validAfter, validBefore, nonce
 */
interface IERC3009 is IERC20 {
    /**
     * @notice Execute transfer using off-chain signature
     * @param from        Payer address (signer)
     * @param to          Recipient address
     * @param value       Transfer amount
     * @param validAfter  Signature effective time (unix timestamp)
     * @param validBefore Signature expiration time (unix timestamp)
     * @param nonce       Unique nonce (anti-replay, bytes32)
     * @param v           Signature v
     * @param r           Signature r
     * @param s           Signature s
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
     * @notice Check if an authorization nonce has been used
     */
    function authorizationState(
        address authorizer,
        bytes32 nonce
    ) external view returns (bool);
}
```

### 4.5 Solidity Contract Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IERC3009
 * @notice EIP-3009 transferWithAuthorization interface
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
 * @title NexusPayEscrow
 * @notice USDC-based guaranteed payment contract, supporting the NexusPay payment protocol
 * @dev The contract acts as a guarantor: Relayer deposits on behalf of user -> merchant fulfills -> Core releases
 *      Uses EIP-3009 (transferWithAuthorization) to achieve zero Gas payments for users
 *      Users only need to sign an off-chain EIP-3009 authorization, Relayer submits the on-chain transaction on their behalf
 *
 * Key design decisions:
 * - EIP-3009 replaces approve/permit: users don't need to hold LAT, zero on-chain transactions
 * - Relayer-sponsored mode: all on-chain Gas is borne by the Relayer
 * - Initial arbiter = Nexus operator: automatically set at deployment, can be changed later
 * - Each payment is independently managed, indexed by paymentId
 * - Timeout refund is a public function, anyone can trigger it (Relayer auto-executes)
 */
contract NexusPayEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Type Definitions
    // =========================================================================

    enum EscrowStatus {
        NONE,                  // 0: Does not exist
        DEPOSITED,             // 1: User deposited, awaiting fulfillment
        RELEASED,              // 2: Merchant has withdrawn
        REFUNDED,              // 3: Refunded
        DISPUTED,              // 4: In dispute
        RESOLVED_TO_MERCHANT,  // 5: Arbitration ruled to merchant
        RESOLVED_TO_PAYER      // 6: Arbitration ruled to user
    }

    struct EscrowRecord {
        bytes32 paymentId;           // NexusPay payment ID (keccak256)
        address payer;               // Payer address (EIP-3009 signer)
        address merchant;            // Merchant receiving address
        uint256 amount;              // USDC amount (6 decimals)
        EscrowStatus status;         // Current status
        uint64 depositedAt;          // Deposit timestamp
        uint64 releaseDeadline;      // Merchant must call release before this time
        uint64 disputeDeadline;      // User must initiate dispute before this time
        bytes32 orderRef;            // Merchant order number hash
        bytes32 merchantDid;         // Merchant DID hash
        bytes32 contextHash;         // Order context hash (flight/hotel etc.)
    }

    // =========================================================================
    // State Variables
    // =========================================================================

    /// @notice USDC token contract address (supports EIP-3009)
    IERC3009 public immutable usdc;

    /// @notice Default fulfillment timeout (merchant must call release within this time)
    uint64 public defaultReleaseTimeout;

    /// @notice Default dispute window (user can initiate dispute within this time after deposit)
    uint64 public defaultDisputeWindow;

    /// @notice Arbiter address -> whether valid
    mapping(address => bool) public arbiters;

    /// @notice paymentId -> EscrowRecord
    mapping(bytes32 => EscrowRecord) public escrows;

    /// @notice Protocol fee rate (basis points, 1 = 0.01%)
    uint16 public protocolFeeBps;

    /// @notice Protocol fee recipient address
    address public protocolFeeRecipient;

    /// @notice Core service address (can call release on behalf of merchant / can act as Relayer)
    mapping(address => bool) public coreOperators;

    // =========================================================================
    // Event Definitions
    // =========================================================================

    /// @notice User deposits funds (via EIP-3009 authorization)
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

    /// @notice Merchant withdraws funds (fulfillment complete)
    event PaymentReleased(
        bytes32 indexed paymentId,
        address indexed merchant,
        uint256 merchantAmount,
        uint256 protocolFee
    );

    /// @notice Funds returned to user
    event PaymentRefunded(
        bytes32 indexed paymentId,
        address indexed payer,
        uint256 amount,
        string reason
    );

    /// @notice User initiates dispute
    event PaymentDisputed(
        bytes32 indexed paymentId,
        address indexed payer,
        string reason
    );

    /// @notice Arbiter ruling
    event DisputeResolved(
        bytes32 indexed paymentId,
        address indexed arbiter,
        bool toMerchant,
        uint256 merchantAmount,
        uint256 payerAmount
    );

    /// @notice Arbiter change
    event ArbiterUpdated(address indexed arbiter, bool active);

    /// @notice Core operator change
    event CoreOperatorUpdated(address indexed operator, bool active);

    // =========================================================================
    // Modifiers
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
    // Constructor
    // =========================================================================

    /**
     * @notice Deploy the NexusPayEscrow contract
     * @dev Constructor automatically sets _nexusOperator as the initial arbiter and Core operator
     *      Can be changed later via setArbiter() and setCoreOperator()
     * @param _usdc                  USDC contract address (must support EIP-3009)
     * @param _defaultReleaseTimeout Default fulfillment timeout (seconds)
     * @param _defaultDisputeWindow  Default dispute window (seconds)
     * @param _protocolFeeBps        Protocol fee (basis points, max 500 = 5%)
     * @param _protocolFeeRecipient  Fee recipient address
     * @param _nexusOperator         Nexus admin wallet (initial arbiter + operator)
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

        // Initial setup: Nexus operator serves as both arbiter and Core operator
        arbiters[_nexusOperator] = true;
        coreOperators[_nexusOperator] = true;

        emit ArbiterUpdated(_nexusOperator, true);
        emit CoreOperatorUpdated(_nexusOperator, true);
    }

    // =========================================================================
    // Core Functions
    // =========================================================================

    /**
     * @notice Deposit USDC into Escrow using EIP-3009 authorization (primary entry point)
     * @dev Relayer calls this function, using the user's EIP-3009 signature to transfer USDC from user wallet into the contract
     *      User does not need any on-chain transaction, only needs to sign EIP-3009 authorization off-chain
     *      Contract internally calls USDC.transferWithAuthorization() to complete the transfer
     *
     *      Flow: User signs EIP-3009 -> Relayer calls this function -> Contract calls USDC.transferWithAuthorization
     *
     * @param _paymentId     NexusPay payment ID (bytes32, generated by Core)
     * @param _from          Payer address (EIP-3009 signer, i.e. user wallet)
     * @param _merchant      Merchant receiving address (resolved from DID registry)
     * @param _amount        USDC amount (6 decimals)
     * @param _orderRef      Merchant order number hash
     * @param _merchantDid   Merchant DID hash
     * @param _contextHash   Order context hash
     * @param _validAfter    EIP-3009 signature effective time
     * @param _validBefore   EIP-3009 signature expiration time
     * @param _nonce         EIP-3009 unique nonce (anti-replay)
     * @param _v             Signature v
     * @param _r             Signature r
     * @param _s             Signature s
     */
    function depositWithAuthorization(
        bytes32 _paymentId,
        address _from,
        address _merchant,
        uint256 _amount,
        bytes32 _orderRef,
        bytes32 _merchantDid,
        bytes32 _contextHash,
        // EIP-3009 authorization parameters
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

        // Use EIP-3009 to transfer directly from user wallet into the contract
        // User has signed the authorization off-chain, Relayer (msg.sender) submits on their behalf
        usdc.transferWithAuthorization(
            _from,           // Payer (signer)
            address(this),   // Recipient (this contract)
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
     * @notice User directly deposits USDC into Escrow (backup entry point)
     * @dev Requires USDC approval to this contract before calling
     *      Suitable for scenarios where the user has LAT and is willing to send on-chain transactions themselves
     *      paymentId must be unique (anti-replay)
     * @param _paymentId     NexusPay payment ID (bytes32, generated by Core)
     * @param _merchant      Merchant receiving address (resolved from DID registry)
     * @param _amount        USDC amount (6 decimals)
     * @param _orderRef      Merchant order number hash
     * @param _merchantDid   Merchant DID hash
     * @param _contextHash   Order context hash
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

        // Traditional approve + transferFrom pattern
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
     * @notice Release funds to merchant (called after merchant fulfillment)
     * @dev Only the merchant themselves or Core operators can call
     *      Deducts protocol fee before transferring to merchant
     * @param _paymentId Payment ID
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

        // Calculate fee
        uint256 fee = (record.amount * protocolFeeBps) / 10000;
        uint256 merchantAmount = record.amount - fee;

        // Transfer to merchant
        IERC20(address(usdc)).safeTransfer(record.merchant, merchantAmount);

        // Transfer fee to protocol
        if (fee > 0) {
            IERC20(address(usdc)).safeTransfer(protocolFeeRecipient, fee);
        }

        emit PaymentReleased(_paymentId, record.merchant, merchantAmount, fee);
    }

    /**
     * @notice Timeout refund (anyone can trigger)
     * @dev Must be past releaseDeadline and status must be DEPOSITED
     *      Designed as a public function; Relayer will automatically call this to process timeout refunds
     * @param _paymentId Payment ID
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
     * @notice User initiates a dispute
     * @dev Only the payer can call, and must be within the dispute window
     *      Note: dispute requires the user to sign and send a transaction themselves (or relay via Relayer)
     *      After dispute, funds are frozen in the contract, awaiting arbiter ruling
     * @param _paymentId Payment ID
     * @param _reason    Dispute reason (recorded on-chain)
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
     * @notice Arbiter resolves a dispute
     * @dev Only arbiters can call (initially the Nexus admin wallet)
     *      Supports proportional allocation: merchantBps represents the merchant's share (basis points)
     *      Example: merchantBps = 10000 all to merchant, 0 all to user, 5000 split evenly
     * @param _paymentId   Payment ID
     * @param _merchantBps Merchant's share (basis points, 0-10000)
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
    // Query Functions
    // =========================================================================

    /**
     * @notice Query an Escrow record
     * @param _paymentId Payment ID
     * @return EscrowRecord Complete record
     */
    function getEscrow(
        bytes32 _paymentId
    ) external view returns (EscrowRecord memory) {
        return escrows[_paymentId];
    }

    /**
     * @notice Check if a payment is refundable (timed out)
     * @param _paymentId Payment ID
     * @return Whether refundable
     */
    function isRefundable(bytes32 _paymentId) external view returns (bool) {
        EscrowRecord storage record = escrows[_paymentId];
        return record.status == EscrowStatus.DEPOSITED
            && block.timestamp > record.releaseDeadline;
    }

    /**
     * @notice Check if a payment can be disputed
     * @param _paymentId Payment ID
     * @return Whether disputable
     */
    function isDisputable(bytes32 _paymentId) external view returns (bool) {
        EscrowRecord storage record = escrows[_paymentId];
        return record.status == EscrowStatus.DEPOSITED
            && block.timestamp <= record.disputeDeadline;
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    /**
     * @notice Set arbiter
     * @dev Only contract owner can call. Initial arbiter is set to nexusOperator in constructor
     *      Can subsequently be changed or new arbiters added via this function
     * @param _arbiter Arbiter address
     * @param _active  Whether to enable
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

### 4.6 Contract Deployment Parameters (PlatON Mainnet)

| Parameter | Suggested Value | Description |
| --- | --- | --- |
| `_usdc` | PlatON USDC contract address | Must support EIP-3009 (transferWithAuthorization) |
| `_defaultReleaseTimeout` | 86400 (24 hours) | Merchant must confirm fulfillment within 24 hours |
| `_defaultDisputeWindow` | 259200 (72 hours) | User can initiate dispute within 72 hours |
| `_protocolFeeBps` | 30 (0.3%) | Protocol fee (must cover Relayer Gas costs) |
| `_protocolFeeRecipient` | Nexus multisig wallet | Fee recipient address |
| `_nexusOperator` | Nexus admin wallet | Initial arbiter + Core operator + Relayer address |

---

## 5. Payment Flow Redesign

### 5.1 Escrow Mode Complete Payment Flow Sequence Diagram (EIP-3009 + Relayer)

```
User Agent (UA)       NexusPay Core          Relayer            NexusPayEscrow       Merchant Agent (MA)     PlatON Chain
     |                     |               (Core submodule)    (Smart Contract)            |                     |
     |  1. Search products  |                    |                    |                    |                     |
     | ──────────────────────────────────────────────────────────────────────────────────►  |                     |
     |  search_flights      |                    |                    |                    |                     |
     | ◄────────────────────|                    |                    |                    |                     |
     |  Return flight list   |                    |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |  2. Generate quote    |                    |                    |                    |                     |
     | ──────────────────────────────────────────────────────────────────────────────────►  |                     |
     |  nexus_generate_quote |                    |                    |                    |                     |
     | ◄────────────────────|  Quote (EIP-712, payment_method: "ESCROW")                  |                     |
     |                     |                    |                    |                    |                     |
     |  3. Orchestrate payment |                    |                    |                    |                     |
     | ────────────────────►|                    |                    |                    |                     |
     |  nexus_orchestrate_payment(quote, payer_wallet)                |                    |                     |
     |                     | ─ Verify sig ──    |                    |                    |                     |
     |                     | ─ DID resolve ──   |                    |                    |                     |
     |                     | ─ Create payment ──|                    |                    |                     |
     |                     | ─ Generate EIP-3009 sign params ──     |                    |                     |
     | ◄────────────────────|                    |                    |                    |                     |
     |  EscrowInstruction   |                    |                    |                    |                     |
     |  (eip3009_sign_data) |                    |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |  4. User signs EIP-3009 |                    |                    |                    |                     |
     |  (off-chain signing,    |                    |                    |                    |                     |
     |   no on-chain tx)       |                    |                    |                    |                     |
     |  Wallet prompts signing |                    |                    |                    |                     |
     |  Sign transferWithAuthorization TypedData                      |                    |                     |
     |                     |                    |                    |                    |                     |
     |  5. Submit signature  |                    |                    |                    |                     |
     | ────────────────────►|                    |                    |                    |                     |
     |  nexus_submit_eip3009_signature(id, v, r, s)                  |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |  6. Forward to Relayer |                    |                    |                     |
     |                     | ──────────────────►|                    |                    |                     |
     |                     |  depositWithAuth    |                    |                    |                     |
     |                     |  request            |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |                    |  7. Relayer builds tx and submits on-chain |                     |
     |                     |                    | ──────────────────►|                    |                     |
     |                     |                    |  NexusPayEscrow.depositWithAuthorization(...)                  |
     |                     |                    |  (Relayer pays Gas)  |                    |                     |
     |                     |                    | ◄──────────────────| deposit tx_hash    |                     |
     |                     |                    |                    |                    |                     |
     | ◄────────────────────|                    |                    |                    |                     |
     |  status: DEPOSITED   |                    |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |  8. On-chain confirmation |                    |                    |                     |
     |                     | ◄───────────────────────────────────────| PaymentDeposited   |                     |
     |                     |  Verify paymentId/amount                |  event             |                     |
     |                     |  status: ESCROWED    |                    |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |  9. Webhook notification |                    |                    |                     |
     |                     | ─────────────────────────────────────────────────────────────►|                     |
     |                     |  payment.escrowed    |                    |                    |                     |
     |                     | ◄────────────────────────────────────────────────────────────| HTTP 200            |
     |                     |                    |                    |                    |                     |
     |                     |                    |                    |                    |  10. Merchant fulfills |
     |                     |                    |                    |                    |  (issues ticket)      |
     |                     |                    |                    |                    | (internal business    |
     |                     |                    |                    |                    |  logic)               |
     |                     |                    |                    |                    |                     |
     |                     |  11. Merchant confirms fulfillment |                    |                     |
     |                     | ◄────────────────────────────────────────────────────────────|                     |
     |                     |  nexus_confirm_fulfillment(id, proof)   |                    |                     |
     |                     |                    |                    |                    |                     |
     |                     |  12. Relayer calls contract to release funds |                    |                     |
     |                     | ──────────────────►|                    |                    |                     |
     |                     |                    | ──────────────────►|                    |                     |
     |                     |                    |  NexusPayEscrow.release(paymentId)      |                     |
     |                     |                    | ◄──────────────────| PaymentReleased    |                     |
     |                     |  status: SETTLED    |                    |  event             |                     |
     |                     |                    |                    |                    |                     |
     |                     |  13. Webhook: settled |                    |                    |                     |
     |                     | ─────────────────────────────────────────────────────────────►|                     |
     |                     |  payment.settled     |                    |                    |                     |
     |                     | ◄────────────────────────────────────────────────────────────| HTTP 200            |
     |                     |                    |                    |                    |                     |
     |  14. Query status    |                    |                    |                    |                     |
     | ────────────────────►|                    |                    |                    |                     |
     |  nexus_get_payment_status                 |                    |                    |                     |
     | ◄────────────────────|                    |                    |                    |                     |
     |  status: SETTLED     |                    |                    |                    |                     |
     |  "Payment successful,|                    |                    |                    |                     |
     |   merchant has       |                    |                    |                    |                     |
     |   issued ticket"     |                    |                    |                    |                     |
```

> Key change: In step 4, the user only performs an off-chain signature (EIP-3009 TypedData), does not send any on-chain transaction, and does not need to hold LAT. The Relayer submits the transaction on their behalf in step 7 and pays the Gas.

### 5.2 State Machine Extension (New States for Escrow Mode)

Building on the original 8 states from RFC-005v2, Escrow mode-specific states are added:

```
Existing states (retained):
  CREATED, AWAITING_TX, BROADCASTED, SETTLED, COMPLETED, EXPIRED, TX_FAILED, RISK_REJECTED

New states (Escrow mode):
  ESCROWED          -- Funds deposited in contract (corresponds to contract DEPOSITED status)
  DISPUTE_OPEN      -- User initiated dispute
  DISPUTE_RESOLVED  -- Arbitration complete
  REFUNDED          -- Refunded
```

Complete Escrow mode state flow:

```
(none) ─ orchestrate_payment ──► CREATED
CREATED ──► AWAITING_TX ──► BROADCASTED ──► ESCROWED
                                              │
                           ┌──────────────────┼──────────────────┐
                           │                  │                  │
                      SETTLED            REFUNDED          DISPUTE_OPEN
                      (release)          (timeout refund)  (user dispute)
                           │                                     │
                      COMPLETED                          DISPUTE_RESOLVED
                      (fulfillment                       (arbitration
                       confirmed)                         ruling)
```

### 5.3 EscrowInstruction Interface (Replaces PaymentInstruction)

When `payment_method === "ESCROW"`, Core returns an `EscrowInstruction`.

v1.1 changes: Removed `approve_tx` + `deposit_tx`, replaced with EIP-3009 signing parameters. Users only need to sign EIP-712 TypedData, no on-chain transactions needed.

```typescript
interface EscrowInstruction {
  // Chain info
  readonly chain_id: 210425;
  readonly chain_name: "PlatON";
  readonly payment_method: "ESCROW";

  // Escrow contract info
  readonly escrow_contract: Address;   // NexusPayEscrow contract address
  readonly token_address: Address;     // USDC contract address (supports EIP-3009)
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;

  // Amount
  readonly amount_uint256: string;     // e.g. "530000000" (530 USDC)
  readonly amount_display: string;     // e.g. "530.00"

  // EIP-3009 signing parameters (user needs to sign this TypedData)
  readonly eip3009_sign_data: {
    readonly domain: {
      readonly name: string;           // USDC contract's EIP-712 domain name
      readonly version: string;        // USDC contract's EIP-712 domain version
      readonly chainId: 210425;
      readonly verifyingContract: Address;  // USDC contract address
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
      readonly from: Address;          // User wallet address
      readonly to: Address;            // Escrow contract address
      readonly value: string;          // USDC amount (uint256)
      readonly validAfter: string;     // Signature effective time (unix timestamp)
      readonly validBefore: string;    // Signature expiration time (unix timestamp)
      readonly nonce: Hex;             // Unique nonce (bytes32, generated by Core)
    };
  };

  // References
  readonly nexus_payment_id: string;
  readonly payment_id_bytes32: Hex;    // keccak256(nexus_payment_id)
  readonly merchant_address: Address;
  readonly order_ref_hash: Hex;        // keccak256(merchant_order_ref)
  readonly merchant_did_hash: Hex;     // keccak256(merchant_did)
  readonly context_hash: Hex;          // Order context hash

  // Timeout info
  readonly release_deadline: string;   // ISO 8601
  readonly dispute_deadline: string;   // ISO 8601
  readonly expires_at: string;         // ISO 8601

  // User action guidance (UA can display to user)
  readonly user_action: "SIGN_EIP3009"; // User only needs to sign, no on-chain transaction
  readonly gas_paid_by: "RELAYER";      // Gas is borne by Relayer
}
```

#### EscrowInstruction Usage Flow

```
1. Core returns EscrowInstruction (containing eip3009_sign_data)
2. UA calls user wallet's eth_signTypedData_v4(eip3009_sign_data)
3. User confirms signature in wallet (sign only, no transaction sent, no Gas consumed)
4. UA obtains signature (v, r, s)
5. UA calls nexus_submit_eip3009_signature(payment_id, v, r, s)
6. Core forwards signature to Relayer
7. Relayer calls NexusPayEscrow.depositWithAuthorization(...) on-chain
8. After on-chain confirmation, Core updates status to ESCROWED
```

### 5.4 MCP Tool Changes

#### New / Modified MCP Tools

| Tool | Change Type | Description |
| --- | --- | --- |
| `nexus_orchestrate_payment` | **Modified** | Added `payment_method` routing logic; Escrow mode returns `EscrowInstruction` (with EIP-3009 signing parameters) |
| `nexus_submit_eip3009_signature` | **New** | UA submits user's EIP-3009 signature; Core forwards to Relayer for on-chain submission |
| `nexus_submit_tx` | **Modified** | Still supports traditional tx_hash submission (Direct Transfer mode); Escrow mode uses `nexus_submit_eip3009_signature` instead |
| `nexus_release_payment` | **New** | Core calls contract `release()` via Relayer to release Escrow funds |
| `nexus_dispute_payment` | **New** | UA initiates dispute (submitted on-chain via Relayer on behalf of user) |
| `nexus_get_payment_status` | **Modified** | Added Escrow status display, contract address, timeout information |
| `nexus_confirm_fulfillment` | **Modified** | Triggers Core to call contract `release()` via Relayer, transitioning Escrow to SETTLED |

#### New Tool: `nexus_submit_eip3009_signature`

```json
{
  "name": "nexus_submit_eip3009_signature",
  "description": "UA submits user's EIP-3009 signature; Core forwards the signature to Relayer for on-chain submission",
  "input": {
    "nexus_payment_id": { "type": "string", "required": true },
    "v": { "type": "number", "required": true, "description": "Signature v (27 or 28)" },
    "r": { "type": "string", "required": true, "description": "Signature r (bytes32 hex)" },
    "s": { "type": "string", "required": true, "description": "Signature s (bytes32 hex)" }
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

#### New Tool: `nexus_release_payment`

```json
{
  "name": "nexus_release_payment",
  "description": "Core calls Escrow contract via Relayer to release funds to merchant",
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

## 6. Dispute Handling Mechanism

### 6.1 Dispute Type Classification

| Dispute Type | Example Scenario | Handling Method |
| --- | --- | --- |
| **Timeout without fulfillment** | Merchant received payment but didn't issue ticket/ship goods | Automatic contract refund (refund) |
| **Service quality dispute** | Flight cancelled, hotel conditions not as described | User initiates dispute, arbiter rules |
| **Partial fulfillment** | Some goods shipped, some not delivered | Arbiter rules proportionally (merchantBps) |
| **Fraudulent behavior** | Merchant intentionally doesn't deliver | Arbiter rules 100% to user |

### 6.2 Dispute Handling Flow

```
           User discovers issue
                │
                ▼
     ┌─────────────────────┐
     │ Within dispute       │
     │ window?              │
     │ (disputeDeadline)    │
     └───────┬───────┬──────┘
             │Yes    │No
             ▼       ▼
     ┌───────────┐  ┌────────────────────┐
     │ dispute() │  │ Off-chain          │
     │ Initiate  │  │ negotiation        │
     │ dispute   │  │ (contact support/  │
     │           │  │  arbitration court) │
     └─────┬─────┘  └────────────────────┘
           │
           ▼
     ┌───────────────────┐
     │  DISPUTED status   │
     │  Funds frozen in   │
     │  contract          │
     └─────────┬─────────┘
               │
               ▼
     ┌───────────────────┐
     │  Arbiter           │
     │  investigates      │
     │  - On-chain tx     │
     │    records         │
     │  - Webhook logs    │
     │  - Fulfillment     │
     │    evidence        │
     │  - Both parties'   │
     │    statements      │
     └─────────┬─────────┘
               │
               ▼
     ┌───────────────────────────┐
     │  resolve(paymentId, bps)  │
     │  Arbiter ruling           │
     └─────┬──────────────┬─────┘
           │              │
           ▼              ▼
  ┌──────────────┐ ┌──────────────┐
  │ To merchant  │ │ To user      │
  │ (>=50%)      │ │ (<50%)       │
  │ RESOLVED_TO_ │ │ RESOLVED_TO_ │
  │ MERCHANT     │ │ PAYER        │
  └──────────────┘ └──────────────┘
```

### 6.3 Timeout Automatic Refund Mechanism

```
Core Timeout Handler (scheduled task, executed via Relayer):

1. Every 60 seconds, scan orders with status = 'ESCROWED' where release_deadline has passed
2. For each expired order:
   a. Call NexusPayEscrow.refund(paymentId) via Relayer (Relayer bears Gas)
   b. If transaction succeeds:
      - Update Core status: ESCROWED -> REFUNDED
      - Send Webhook: payment.refunded
   c. If transaction fails (already released by merchant or disputed by user):
      - Query latest status from on-chain
      - Sync Core status
3. Record refund event to payment_events table
```

### 6.4 Arbiter Mechanism

**v1.1 Decision: Initial arbiter = Nexus admin wallet (nexusOperator)**

In the initial phase, the Nexus admin wallet serves both the operator role (release permission) and the arbiter role (dispute resolve permission). This simplifies deployment and operations; the arbiter can later be changed to an independent address via `setArbiter()`.

| Rule | Description |
| --- | --- |
| **Initial arbiter** | Contract constructor automatically sets `arbiter = nexusOperator` (Nexus admin wallet) |
| **Appointment method** | Contract owner appoints or revokes via `setArbiter(address, bool)` |
| **Subsequent changes** | Can be changed to an independent arbiter or multisig wallet at any time after deployment via `setArbiter()` |
| **Number of arbiters** | MVP phase: 1 (= nexusOperator), can later be expanded to DAO voting |
| **Ruling permission** | Can only rule on payments in DISPUTED status |
| **Ruling flexibility** | Supports proportional allocation from 0-10000 basis points |
| **Ruling time limit** | Recommended to complete ruling within 7 days (off-chain constraint) |
| **Arbiter incentives** | Future versions will introduce arbitration fees (allocated from protocolFee) |

```
Initial deployment state:
  nexusOperator wallet
  ├── coreOperator: true   (can call release)
  ├── arbiter: true        (can call resolve)
  └── Relayer: same wallet (sponsors Gas)

Can later be separated into:
  nexusOperator  -> coreOperator (release)
  arbiterWallet  -> arbiter (resolve)
  relayerWallet  -> Relayer (sponsors Gas)
```

### 6.5 Relationship Between Dispute Window and Release Window

```
Timeline:
|──── depositedAt ────|──── disputeDeadline (72h) ────|
|──── depositedAt ────|────────── releaseDeadline (24h) ────|

Key constraints:
- disputeDeadline > releaseDeadline (dispute window is longer than release window)
- Before releaseDeadline: merchant can release, user can dispute
- Between releaseDeadline ~ disputeDeadline: user can still dispute, but merchant can no longer release (automatic refund takes effect)
- After disputeDeadline: can neither dispute nor release, only refund

Suggested parameters:
- defaultReleaseTimeout: 24 hours (86400 seconds)
- defaultDisputeWindow: 72 hours (259200 seconds)
```

---

## 7. Impact Assessment on Existing Architecture

### 7.1 Affected Components Matrix

| Component | Impact Level | Change Scope | Description |
| --- | --- | --- | --- |
| **RFC-005v2 (Payment Core)** | Medium | Add Escrow routing branch | No changes to Direct Transfer logic, add Escrow path |
| **PRD-001 (Product Requirements)** | Medium | Add module B2, extend module C | Add Escrow contract module, extend state machine |
| **State Machine (Module C)** | High | Add 4 states + transition rules | ESCROWED, DISPUTE_OPEN, DISPUTE_RESOLVED, REFUNDED |
| **Chain Watcher (Module B)** | High | Add contract event listeners | Listen for PaymentDeposited / PaymentReleased / PaymentRefunded / DisputeResolved |
| **Relayer Service** | New | Entirely new submodule | Wallet management, transaction queue, balance monitoring, EIP-3009 signature forwarding |
| **MCP Tools** | Medium | Modify 2, add 3 | orchestrate_payment routing, add submit_eip3009_signature/release/dispute |
| **Webhook (RFC-009)** | Low | Add 3 event types | payment.escrowed, payment.refunded, dispute.opened |
| **Database Schema** | Medium | Add fields + indexes | payments table adds escrow-related fields |
| **Merchant Agent** | Low | Adjust Webhook handling | Handle new Webhook event types |
| **src/contracts/** | New | Entirely new module | Solidity contracts + deployment scripts + tests |

### 7.2 Database Schema Changes

Add the following fields to the `payments` table:

```sql
-- Escrow-related fields (payments table extension)
ALTER TABLE payments ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'DIRECT_TRANSFER';
ALTER TABLE payments ADD COLUMN escrow_contract TEXT;          -- Escrow contract address
ALTER TABLE payments ADD COLUMN escrow_payment_id_bytes32 TEXT; -- bytes32 format paymentId
ALTER TABLE payments ADD COLUMN release_deadline TIMESTAMPTZ;   -- Merchant release deadline
ALTER TABLE payments ADD COLUMN dispute_deadline TIMESTAMPTZ;   -- Dispute initiation deadline
ALTER TABLE payments ADD COLUMN release_tx_hash TEXT;           -- release transaction hash
ALTER TABLE payments ADD COLUMN refund_tx_hash TEXT;            -- refund transaction hash
ALTER TABLE payments ADD COLUMN dispute_reason TEXT;            -- Dispute reason
ALTER TABLE payments ADD COLUMN arbiter_address TEXT;           -- Arbiter address
ALTER TABLE payments ADD COLUMN resolution_merchant_bps INTEGER; -- Arbitration ratio
ALTER TABLE payments ADD COLUMN relayer_address TEXT;            -- Relayer address
ALTER TABLE payments ADD COLUMN eip3009_nonce TEXT;              -- EIP-3009 nonce (bytes32)

-- Update status constraint
ALTER TABLE payments DROP CONSTRAINT chk_status;
ALTER TABLE payments ADD CONSTRAINT chk_status CHECK (status IN (
  'CREATED', 'AWAITING_TX', 'BROADCASTED',
  'SETTLED', 'COMPLETED', 'EXPIRED',
  'TX_FAILED', 'RISK_REJECTED',
  -- New Escrow statuses
  'ESCROWED', 'DISPUTE_OPEN', 'DISPUTE_RESOLVED', 'REFUNDED'
));

-- New payment method constraint
ALTER TABLE payments ADD CONSTRAINT chk_payment_method CHECK (
  payment_method IN ('DIRECT_TRANSFER', 'ESCROW')
);

-- New indexes
CREATE INDEX idx_payments_escrow_deadline
  ON payments (release_deadline)
  WHERE status = 'ESCROWED' AND payment_method = 'ESCROW';

CREATE INDEX idx_payments_dispute
  ON payments (status)
  WHERE status = 'DISPUTE_OPEN';
```

### 7.3 New Payment Event Types

```typescript
type PaymentEventType =
  // Existing events (retained)
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
  // New Escrow events
  | "ESCROW_DEPOSITED"      // Funds deposited into contract
  | "ESCROW_RELEASED"       // Funds released to merchant
  | "ESCROW_REFUNDED"       // Timeout refund
  | "DISPUTE_OPENED"        // User initiated dispute
  | "DISPUTE_RESOLVED";     // Arbitration complete
```

### 7.4 New Webhook Event Types

| Event Type | Trigger Timing | Expected Merchant Behavior |
| --- | --- | --- |
| `payment.escrowed` | User funds deposited into Escrow contract | Begin fulfillment (issue ticket/ship goods) |
| `payment.refunded` | Timeout automatic refund complete | Mark order as cancelled, release inventory |
| `dispute.opened` | User initiated dispute | Prepare dispute materials, contact arbiter |
| `dispute.resolved` | Arbiter ruling complete | Update internal status based on ruling result |

### 7.5 Chain Watcher Extension

```
Chain Watcher Extension (Escrow mode):

Event listener list (NexusPayEscrow contract):
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

Polling strategy:
- Query NexusPayEscrow contract for new events every 3 seconds
- Use getLogs to filter from fromBlock -> latestBlock
- Match Core payment records by paymentId
```

### 7.6 Compatibility Handling for RFC-005v2

**Principle: Backward compatible, incremental extension**

No breaking changes to RFC-005v2. The following is the compatibility strategy:

| Scenario | Handling Method |
| --- | --- |
| Merchant doesn't support Escrow | Defaults to Direct Transfer, behavior unchanged |
| Quote has no payment_method field | Defaults to `DIRECT_TRANSFER` |
| Existing MCP Tool calls | Fully compatible, no modifications needed |
| New Escrow fields | All new fields are optional (nullable) |
| State machine extension | Original 8 states unaffected, 4 new states used only in Escrow mode |

---

## 8. Directory Structure

### 8.1 Contract Directory Structure

```
src/contracts/
├── src/
│   ├── NexusPayEscrow.sol        # Main contract (includes depositWithAuthorization)
│   └── interfaces/
│       └── IERC3009.sol           # EIP-3009 interface definition
│
├── test/
│   ├── NexusPayEscrow.t.sol      # Foundry unit tests
│   ├── NexusPayEscrow.gas.t.sol  # Gas consumption tests
│   └── mocks/
│       └── MockUSDC.sol          # EIP-3009 mock USDC (for testing)
│
├── script/
│   ├── Deploy.s.sol              # Deployment script (includes nexusOperator setup)
│   └── SetupArbiter.s.sol        # Arbiter replacement script
│
├── foundry.toml                  # Foundry configuration
├── remappings.txt                # Dependency mappings
└── README.md                     # Contract documentation
```

### 8.2 Relayer Module Directory Structure

```
src/nexus-core/
├── relayer/
│   ├── relayer-service.ts         # Relayer service entry point
│   ├── relayer-wallet.ts          # Wallet management (signing + nonce management)
│   ├── relayer-tx-queue.ts        # Transaction queue (queuing + retry + deduplication)
│   ├── relayer-balance-monitor.ts # LAT balance monitoring + alerts
│   └── relayer-config.ts          # Relayer configuration (thresholds, retry strategies, etc.)
│
├── eip3009/
│   ├── eip3009-sign-builder.ts    # Generate EIP-3009 signing parameters (TypedData)
│   └── eip3009-types.ts           # EIP-3009 TypedData type definitions
│
└── escrow/
    ├── escrow-instruction-builder.ts # Build EscrowInstruction
    ├── escrow-watcher.ts             # Listen for contract events
    ├── release-handler.ts            # Call release via Relayer
    ├── refund-handler.ts             # Timeout refund (Relayer auto-executes)
    └── dispute-handler.ts            # Dispute handling
```

---

## 9. ISO 20022 Compliance Extension

### 9.1 Escrow Mode ISO Mapping

Escrow mode introduces a richer payment lifecycle, requiring expanded ISO 20022 mapping:

| Nexus Field | ISO 20022 Element | Description |
| --- | --- | --- |
| `payment_method: "ESCROW"` | `PmtMtd` | Payment method identifier |
| `escrow_contract` | `IntrmyAgt` | Intermediary agent (Escrow contract) |
| `release_deadline` | `ReqdExctnDt` | Requested execution date |
| `dispute_reason` | `RtrRsnInf/AddtlInf` | Refund/dispute reason |
| `resolution_merchant_bps` | `SttlmInf/SttlmAmt` | Ruling allocation ratio |
| `refund_tx_hash` | `OrgnlTxRef/OrgnlTxId` | Original transaction reference |

### 9.2 Accounting Entry Mapping

Under Escrow mode, the accounting entry mapping for funds follows IFRS 15 (Revenue Recognition Standard):

```
When user deposits:
  Debit: Prepayments                              530 USDC
  Credit: Cash/Wallet Balance                     530 USDC
  (ISO 20022: CstmrCdtTrfInitn - Customer Credit Transfer Initiation)

When merchant releases:
  Debit: Receivables                              528.41 USDC
  Credit: Revenue                                 528.41 USDC
  Debit: Service Charges                          1.59 USDC
  Credit: Prepayments                             530 USDC
  (ISO 20022: PmtStsRpt - Payment Status Report, Status=ACSC)

When timeout refund:
  Debit: Cash/Wallet Balance                      530 USDC
  Credit: Prepayments                             530 USDC
  (ISO 20022: PmtRtr - Payment Return)

When arbitration proportional ruling:
  Debit: Cash/Wallet Balance                      265 USDC  (user's share)
  Debit: Receivables                              265 USDC  (merchant's share)
  Credit: Prepayments                             530 USDC
  (ISO 20022: PmtStsRpt - Partial Return)
```

---

## 10. Security Considerations

### 10.1 Contract Security Checklist

- [x] **ReentrancyGuard**: All fund operation functions have nonReentrant modifier
- [x] **SafeERC20**: Uses OpenZeppelin SafeERC20 to prevent non-standard ERC-20 issues
- [x] **Integer Overflow**: Solidity 0.8+ built-in overflow checking
- [x] **Zero Address Checks**: All address parameters checked for non-zero
- [x] **Status Checks**: Each function strictly checks current status
- [x] **Access Control**: onlyArbiter, onlyCoreOrMerchant, onlyPayer modifiers
- [x] **Anti-replay**: paymentId uniqueness constraint + EIP-3009 nonce uniqueness (guaranteed internally by USDC contract)
- [x] **Fee Cap**: protocolFeeBps <= 500 (max 5%)
- [x] **EIP-3009 Signature Verification**: USDC contract internally verifies EIP-712 TypedData signature; contract does not need additional verification
- [x] **Relayer Has No Fund Risk**: Relayer only bears Gas, does not hold or custody user USDC

### 10.2 Threat Model (Escrow-specific)

| Threat | Impact | Mitigation |
| --- | --- | --- |
| **Core operator private key leak** | Attacker can call release to extract all Escrow funds | Use multisig wallet as Core operator; restrict release to only transfer to record.merchant |
| **Arbiter collusion** | Arbiter colludes with one party to make unfair ruling | Multi-arbiter mechanism; rulings are publicly transparent and auditable |
| **Reentrancy attack** | Malicious ERC-20 reenters during transfer callback | ReentrancyGuard + SafeERC20 |
| **Time manipulation** | Miner/validator manipulates block.timestamp | PlatON has stable block time (~1s); timeout windows set at hour-level |
| **Frontend spoofing** | Forge merchant address in deposit calldata | Core resolves merchant address from DID registry, does not trust frontend |
| **Griefing Attack** | Malicious user repeatedly deposits + disputes to consume arbitration resources | Future versions will introduce dispute deposit |
| **Relayer private key leak** | Attacker can drain Relayer's LAT balance (but cannot steal USDC) | Relayer wallet holds only a small amount of LAT; KMS for private key storage; balance monitoring alerts |
| **Relayer denial of service** | Relayer downtime prevents transaction submission | Backup Relayer wallet on standby; users can still interact directly via deposit() |
| **EIP-3009 signature replay** | Attacker intercepts and replays signature on another chain | EIP-712 domain includes chainId=210425; USDC contract internally checks nonce uniqueness |

### 10.3 Contract Audit Strategy

**Decision: Use AI auditing, no external audit firms.**

| Audit Method | Description |
| --- | --- |
| **AI Audit** | Use AI tools for comprehensive security audit after contract completion |
| **Foundry Fuzz Testing** | Use Foundry's fuzz testing to cover boundary conditions |
| **Invariant Testing** | Write invariant tests to verify contract state consistency |
| **Slither Static Analysis** | Use Slither to detect common vulnerability patterns |
| **Internal Code Review** | Team internal code review |

### 10.4 Contract Upgrade Strategy (v2.0.0 Update)

**v2.0.0 Decision Change: UUPS proxy pattern has been adopted.**

The contract uses OpenZeppelin `UUPSUpgradeable` + `Initializable` for upgradeable proxy:
- Proxy address: `0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236` (stable entry point)
- Implementation: `0x2EF4dB5E0021d074286c36821Cc897d2605e542E` (v4.0.0)
- Upgrade permission: `onlyOwner` (restricted via `_authorizeUpgrade`)
- Benefit: No need to migrate unsettled Escrows; proxy address remains unchanged

---

## 11. EIP-3009 + Relayer-Sponsored Service Design

### 11.1 Design Decision Background

USDC on the PlatON chain supports EIP-3009 (`transferWithAuthorization`), not EIP-2612 (Permit). The core advantages of EIP-3009 are:

| Feature | EIP-2612 (Permit) | EIP-3009 (TransferWithAuthorization) |
| --- | --- | --- |
| **Authorization method** | Signature authorizes allowance, still requires calling transferFrom | Signature directly authorizes transfer, completed in one step |
| **User operations** | Sign + send transaction (or spender calls permit + transferFrom in same transaction) | Sign only, anyone (Relayer) can submit on their behalf |
| **Nonce management** | Incrementing nonce, serialized with other permits | Random bytes32 nonce, fully parallel |
| **Gas responsibility** | Caller pays | Anyone (Relayer) who submits pays Gas |
| **PlatON USDC support** | Not supported | Supported |

Therefore, we adopt the EIP-3009 + Relayer-sponsored approach to achieve a completely zero Gas payment experience for users.

### 11.2 Relayer Service Architecture

The Relayer operates as a submodule of NexusPay Core, responsible for submitting on-chain transactions on behalf of users and paying Gas.

```
                                 NexusPay Core
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
                  │  │  │ Relayer Wallet (holds LAT)   │ │   │
                  │  │  │ - Signs and submits on-chain │ │   │
                  │  │  │   transactions               │ │   │
                  │  │  │ - Gas fees paid from LAT     │ │   │
                  │  │  │   balance                    │ │   │
                  │  │  └─────────────────────────────┘ │   │
                  │  │                                   │   │
                  │  │  ┌─────────────────────────────┐ │   │
                  │  │  │ Transaction Queue           │ │   │
                  │  │  │ - Queuing + retry + nonce   │ │   │
                  │  │  │   management                │ │   │
                  │  │  └─────────────────────────────┘ │   │
                  │  │                                   │   │
                  │  │  ┌─────────────────────────────┐ │   │
                  │  │  │ Balance Monitor             │ │   │
                  │  │  │ - LAT balance monitoring    │ │   │
                  │  │  │ - Low balance alerts        │ │   │
                  │  │  │ - Auto top-up trigger       │ │   │
                  │  │  └─────────────────────────────┘ │   │
                  │  └──────────────────────────────────┘   │
                  └─────────────────────────────────────────┘
```

### 11.3 Relayer Responsibilities

| Responsibility | Description | Contract Function Called |
| --- | --- | --- |
| **Submit deposit on behalf** | Receives user's EIP-3009 signature, calls `depositWithAuthorization()` | `depositWithAuthorization(...)` |
| **Submit release on behalf** | After merchant confirms fulfillment, Core releases funds via Relayer | `release(paymentId)` |
| **Submit refund on behalf** | Timeout refund scheduled task, Relayer auto-calls | `refund(paymentId)` |
| **Submit dispute on behalf** | When user initiates dispute, can be submitted via Relayer on their behalf (optional) | `dispute(paymentId, reason)` |
| **Submit resolve on behalf** | When arbiter rules, submitted via Relayer (arbiter signature) | `resolve(paymentId, merchantBps)` |

### 11.4 Relayer Wallet Management

#### LAT Balance Monitoring and Top-up

```
Relayer Balance Monitor (scheduled task, every 5 minutes):

1. Query Relayer wallet LAT balance
2. Calculate balance thresholds:
   - WARNING_THRESHOLD: 10 LAT  (can pay for ~50 Escrow transactions)
   - CRITICAL_THRESHOLD: 2 LAT  (can pay for ~10 Escrow transactions)
3. If balance < WARNING_THRESHOLD:
   a. Send alert notification (email/Slack/Webhook)
   b. Log: "Relayer LAT balance below warning threshold"
4. If balance < CRITICAL_THRESHOLD:
   a. Send urgent alert
   b. Trigger auto top-up process (transfer LAT from Nexus operations wallet)
   c. Pause non-critical transactions (only keep refund)
5. Record balance to monitoring database (for trend analysis)
```

#### Gas Cost Accounting

```
Single Escrow transaction Relayer Gas cost estimate:

depositWithAuthorization:  ~140,000 gas
release:                    ~80,000 gas
-----------------------------------
Total:                      ~220,000 gas / transaction

PlatON Gas Price (current): ~1 gwei
Cost per transaction: 220,000 * 1 gwei = 0.00022 LAT

Protocol fee (0.3%):
- 100 USDC transaction: fee 0.3 USDC >> Gas cost ~0.00022 LAT
- Even if Gas Price increases 10x, fee still far exceeds Gas cost

Conclusion: Protocol fee can fully cover Relayer Gas costs with ample margin
```

### 11.5 Relayer Security Design

| Security Measure | Description |
| --- | --- |
| **Least privilege** | Relayer wallet only serves as `coreOperator`, does not hold user funds |
| **Nonce management** | Uses local nonce manager to prevent nonce conflicts and transaction replay |
| **Signature verification** | Relayer verifies EIP-3009 signature validity before submission (off-chain simulation) |
| **Amount cap** | Single transaction amount cap check; exceeding threshold requires additional approval |
| **Rate limiting** | Limits submission frequency per user address to prevent malicious Gas draining |
| **Private key security** | Relayer private key stored in secure hardware or KMS, not hardcoded in source code |
| **Transaction logging** | All Relayer transactions recorded to database, auditable and traceable |
| **Failure retry** | Exponential backoff retry on transaction failure (max 3 times), alert if still failing |

### 11.6 User Experience Comparison

| Mode | User Operations | User On-chain Tx Count | User Gas Cost | Need to Hold LAT |
| --- | --- | --- | --- | --- |
| Direct Transfer | 1. transfer | 1 | ~65,000 gas | Yes |
| Escrow (traditional approve) | 1. approve 2. deposit | 2 | ~186,000 gas | Yes |
| **Escrow (EIP-3009 + Relayer)** | **1. Sign (off-chain)** | **0** | **0** | **No** |

> EIP-3009 + Relayer is the optimal choice for user experience: users only need to sign one authorization signature in their wallet, without holding LAT or sending any on-chain transactions.

---

## 12. Development Implementation Plan

### 12.1 Phased Plan

#### Phase 0: Contract Development and Testing (1-2 weeks)

- [ ] Initialize Foundry project (src/contracts/)
- [ ] Implement IERC3009 interface definition
- [ ] Implement NexusPayEscrow.sol core contract (includes depositWithAuthorization)
- [ ] Write Foundry unit tests (100% branch coverage)
- [ ] EIP-3009 signature verification tests (mock USDC with EIP-3009)
- [ ] Gas consumption benchmark tests (depositWithAuthorization vs deposit)
- [ ] PlatON Devnet deployment verification
- [ ] AI security audit + Slither static analysis

#### Phase 1: Core Extension - Escrow Routing + Relayer (1-2 weeks)

- [ ] Database migration (add Escrow fields)
- [ ] Extend types.ts (add statuses, event types)
- [ ] Extend state-machine.ts (add state transition rules)
- [ ] Implement eip3009-sign-builder.ts (generate EIP-3009 signing parameters)
- [ ] Implement escrow-instruction-builder.ts (build EscrowInstruction)
- [ ] Modify orchestrate-payment.ts (payment_method routing)
- [ ] Implement Relayer service core modules:
  - [ ] relayer-wallet.ts (wallet management + signing)
  - [ ] relayer-tx-queue.ts (transaction queue + nonce management + retry)
  - [ ] relayer-balance-monitor.ts (LAT balance monitoring + alerts)
- [ ] Add MCP Tool: nexus_submit_eip3009_signature

#### Phase 2: Chain Watcher Extension (1 week)

- [ ] Add escrow-watcher.ts (listen for contract events)
- [ ] Implement Escrow event to Core status mapping
- [ ] Implement release-handler.ts (call contract release via Relayer)
- [ ] Implement refund-handler.ts (Relayer auto-executes timeout refund)
- [ ] Add MCP Tool: nexus_release_payment

#### Phase 3: Dispute Handling (1 week)

- [ ] Implement dispute-handler.ts (submitted via Relayer on behalf)
- [ ] Add MCP Tool: nexus_dispute_payment
- [ ] Extend Webhook event types
- [ ] Implement arbiter management interface
- [ ] End-to-end testing (EIP-3009 signing -> Relayer on-chain submission -> complete Escrow flow)

#### Phase 4: PlatON Mainnet Deployment (1 week)

- [ ] AI security audit final round + Foundry fuzz/invariant testing
- [ ] PlatON mainnet deployment (set nexusOperator as initial arbiter + operator)
- [ ] Relayer wallet LAT top-up + balance monitoring configuration
- [ ] Core configuration update (contract address, operator settings, Relayer wallet address)
- [ ] Merchant onboarding (Escrow mode integration documentation)
- [ ] Relayer operations monitoring and alert configuration

### 12.2 New Technology Stack Additions

| Component | Technology Choice | Description |
| --- | --- | --- |
| Contract development | Solidity 0.8.20 | OpenZeppelin v5 + IERC3009 interface |
| Contract testing | Foundry (forge) | Fuzz testing + Invariant testing + Gas report |
| Contract deployment | Foundry (forge script) | Deterministic deployment |
| ABI encoding | viem | encodeFunctionData / decodeFunctionResult |
| Event parsing | viem | decodeEventLog |
| EIP-3009 signing | viem | signTypedData (EIP-712) |
| Relayer | ethers.js / viem | Transaction building + signing + submission |
| Security audit | AI + Slither | AI audit + static analysis tools |

---

## 13. Feature Value Analysis

### 13.1 Escrow Mode Value Assessment Framework

| Metric | Definition | Measurement Method | Data Source |
| --- | --- | --- | --- |
| **Escrow Adoption Rate** | Escrow payment count / total payment count | Ratio calculation, by day/week/month | payments table payment_method field |
| **Escrow Successful Release Rate** | RELEASED count / DEPOSITED count | Ratio calculation (target > 95%) | payments table + contract events |
| **Timeout Refund Rate** | REFUNDED count / DEPOSITED count | Ratio calculation (target < 3%) | payments table |
| **Dispute Rate** | DISPUTE_OPEN count / DEPOSITED count | Ratio calculation (target < 1%) | payments table |
| **Average Escrow Duration** | Average time from deposit to release | Median + P95 | payment_events time difference |
| **Arbitration Ruling Timeliness** | Average time from dispute to resolve | Median (target < 72h) | payment_events time difference |
| **Gas Cost Comparison** | Total Gas cost borne by Relayer vs protocol fee revenue | Mean comparison + ratio | On-chain transaction data + Relayer balance changes |
| **Relayer Availability** | Relayer transaction success rate + average confirmation time | Success rate (target > 99.5%) + P95 latency | Relayer transaction logs |
| **Protocol Fee Revenue** | Total protocolFee | Sum, by day/week/month | Contract events PaymentReleased |
| **User Satisfaction** | Repeat purchase rate after disputes | Cohort analysis | payments + merchant_registry |
| **Merchant Trust** | Merchant Escrow mode enablement rate | Ratio (target > 50%) | merchant_registry |

### 13.2 Input Metrics vs Outcome Metrics

**Input Metrics (directly optimizable):**
- Relayer Gas cost (optimize contract Gas consumption + Relayer transaction strategy)
- Relayer LAT balance sufficiency rate
- Default timeout parameters
- Dispute window duration
- Arbitration response timeliness

**Outcome Metrics (reflect product value):**
- Escrow successful release rate (target > 95%) -- proportion of normal merchant fulfillment
- Timeout refund rate (target < 3%) -- proportion of abnormal transactions
- Dispute rate (target < 1%) -- proportion of transaction disputes
- Protocol fee revenue -- direct business value

### 13.3 Metric Relationship Chain

```
Zero Gas experience (EIP-3009 + Relayer) ──► Lower user entry barrier ──► Escrow adoption rate
Relayer availability ──► Transaction submission timeliness ──► User experience ──► User trust
Timeout parameter settings ──► Merchant fulfillment timeliness ──► Escrow successful release rate ──► User trust
Dispute window duration ──► User recourse ability ──► Dispute rate ──► Platform fairness perception
Arbitration response timeliness ──► Dispute resolution efficiency ──► User satisfaction ──► Repeat purchase rate
Protocol fee rate ──► Merchant acceptance ──► Escrow adoption rate ──► Protocol revenue (must cover Relayer costs)
```

---

## 14. Future Roadmap

### 14.1 v1.2 Enhancements

1. **Batch Release**: Merchants release multiple Escrows at once
2. **Dispute Deposit**: Prevent malicious dispute griefing attacks
3. **Arbitration Fee Mechanism**: Allocate arbiter incentives from protocol fees
4. **Independent Arbiter**: Separate the arbiter role from nexusOperator to an independent address

### 14.2 v2.0 Architecture Upgrade

1. **Upgradeable Contract**: Introduce EIP-1967 Transparent Proxy
2. **Multi-currency Support**: Support USDT, DAI, and other ERC-20 tokens
3. **Cross-chain Escrow**: Integrate with RFC-007 Hub-Spoke architecture
4. **DAO Arbitration**: Decentralized arbiter election and voting mechanism
5. **Split Payment**: Native contract support for multi-party payment splitting
6. **On-chain DID Registry**: NexusMerchantRegistry contract integration
7. **Multi-Relayer Support**: Relayer competition mechanism for improved availability and decentralization

### 14.3 Decided Items (v1.1 Update)

| # | Topic | Decision | Impact |
| --- | --- | --- | --- |
| 1 | Does PlatON USDC support EIP-2612 Permit | **Does not support Permit, supports EIP-3009 (transferWithAuthorization)** | Contract switched to depositWithAuthorization, removed depositWithPermit |
| 2 | Who bears Gas fees | **Relayer-sponsored, Gas costs covered from protocol fee (0.3%)** | Added Relayer service module; users don't need to hold LAT |
| 3 | Arbiter selection criteria | **Initial phase: arbiter = nexusOperator (Nexus admin wallet), can later be changed via setArbiter()** | Contract constructor auto-sets; simplified deployment |
| 4 | Contract security audit | **No external audit; use AI audit + Slither + Foundry fuzz/invariant testing after contract completion** | Reduced cost and time; one round each in Phase 0 and Phase 4 |

### 14.4 Items Still Under Discussion

1. **Dispute deposit amount**: What amount is appropriate? Suggested 1-5% of Escrow amount
2. **Cross-chain Escrow architecture**: Deposit on source chain and release on target chain, or unified on PlatON Hub?
3. **Contract insurance**: Is it necessary to introduce a DeFi insurance protocol to cover contract risk?
4. **Privacy protection**: Do on-chain events expose too much business information? Is zero-knowledge proof needed?
5. **Relayer multi-wallet strategy**: Are multiple Relayer wallets needed for rotation to improve throughput?
6. **Gas responsibility for disputes**: Should the Relayer also sponsor Gas when users initiate disputes? (risk of malicious disputes)

---

## 15. Copyright Notice

Copyright (c) 2026 Nexus Protocol. All Rights Reserved.

---

*Document version 1.1.0 - 2026-02-24*
*This RFC is effective in parallel with RFC-005v2 (Direct Transfer); both payment modes coexist.*

### Changelog

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | 2026-02-24 | Initial version: Escrow contract design, EIP-2612 Permit optional enhancement |
| 1.1.0 | 2026-02-24 | **Major update**: EIP-2612 -> EIP-3009; added Relayer-sponsored service; arbiter = nexusOperator; AI audit strategy |
| 2.0.0 | 2026-02-26 | **v4.0.0 contract implementation sync**: see v2.0.0 changelog below |

---

## Appendix A: v2.0.0 Changelog (2026-02-26)

The following documents the alignment changes between RFC-010 v2.0.0 and the deployed NexusPayEscrow v4.0.0 contract.

### A.1 UUPS Proxy Pattern

Contract changed from non-upgradeable to UUPS upgradeable proxy:
- Inherits `Initializable` + `UUPSUpgradeable` (OpenZeppelin v5)
- Uses `initialize()` instead of `constructor()`
- `_authorizeUpgrade()` restricted to `onlyOwner`
- Proxy address is fixed; upgrades only replace the implementation

```
Proxy: 0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236
Implementation (v4.0.0): 0x2EF4dB5E0021d074286c36821Cc897d2605e542E
```

### A.2 Batch Deposits

Added `batchDepositWithAuthorization()` function, supporting multiple payments in a single transaction:

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

- `BatchEntry` contains: `paymentId`, `merchant`, `amount`, `orderRef`, `merchantDid`, `contextHash`
- `MAX_BATCH_SIZE = 20` (prevents Gas griefing attacks, M-02 audit fix)
- `totalAmount` must equal the sum of all entries' amounts

### A.3 Group Signature Verification (Anti-MITM)

Added `batchDepositWithGroupApproval()` function, adding EIP-712 Group signature verification on top of batch deposits:

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
- Signer must be a `coreOperator`
- `groupId` prevents replay (`usedGroupIds` mapping)
- `requireGroupSig` admin toggle; when set to true, forces all batch deposits to use this function

### A.4 RESOLVED_SPLIT Status

Added `EscrowStatus.RESOLVED_SPLIT` (value = 7):
- Used when `merchantBps` is between 1-9999 during arbitration
- `merchantBps = 0` -> `RESOLVED_TO_PAYER`
- `merchantBps = 10000` -> `RESOLVED_TO_MERCHANT`
- Other values -> `RESOLVED_SPLIT` (M-03 audit fix)

### A.5 feeBps Snapshot

Escrow struct adds `feeBps` field, snapshotting the current `protocolFeeBps` at deposit time:
- Prevents admin fee rate changes from affecting already-deposited Escrows (L-04 audit fix)
- `release()` uses `e.feeBps` instead of the global `protocolFeeBps`

### A.6 refundUnresolvedDispute()

Added public function for automatic refund after arbitration timeout:

```solidity
function refundUnresolvedDispute(bytes32 paymentId) external nonReentrant
```

- Status must be `DISPUTED`
- Must be past `arbitrationTimeout` (7 days, default 604800000 ms)
- Full refund to payer (H-01 audit fix)

### A.7 PlatON Millisecond Timestamps

**Key discovery**: PlatON Devnet EVM's `block.timestamp` uses **milliseconds** instead of seconds.

All time parameters (timeouts, windows) must be in milliseconds:
- `defaultReleaseTimeout`: 86400000 (24h in ms)
- `defaultDisputeWindow`: 259200000 (72h in ms)
- `arbitrationTimeout`: 604800000 (7d in ms)
- EIP-3009 `validBefore` / `validAfter`: milliseconds

### A.8 Deployment Parameters (Actual Values)

| Parameter | Value | Description |
| --- | --- | --- |
| USDC | `0xFF8dEe9983768D0399673014cf77826896F97e4d` | PlatON Devnet USDC (FiatToken) |
| chain_id | 20250407 | PlatON Devnet |
| defaultReleaseTimeout | 86400000 (24h ms) | Merchant fulfillment timeout |
| defaultDisputeWindow | 259200000 (72h ms) | Dispute window |
| arbitrationTimeout | 604800000 (7d ms) | Arbitration timeout |
| protocolFeeBps | 30 (0.3%) | Protocol fee |
| protocolFeeRecipient | Relayer/Owner address | Fee recipient |
| coreOperator | `0xf7EA5d3f0Bf8185c4f3C2F405D9a71009CF4D920` | Also serves as Relayer |
| arbiter | Same as coreOperator | Initial arbiter |
| requireGroupSig | true | Enforces Group signature verification |

### A.9 PlatON Deployment Notes

- Must use `--legacy` flag (EIP-1559 transactions on PlatON get gas price of 1 wei, too low)
- Use `--with-gas-price 20000000000` (20 gwei, network minimum ~10 gwei)
- PlatON does not support transaction replacement; use `--legacy` to avoid pending transaction issues
