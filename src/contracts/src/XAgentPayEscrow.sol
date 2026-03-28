// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/**
 * @title XAgentPayEscrow
 * @author XAgentPay Team
 * @notice Escrow contract for XAgentPay payments.
 *
 *   Flow: User signs EIP-3009 authorization off-chain →
 *         Relayer calls depositWithAuthorization →
 *         Funds held in escrow →
 *         Merchant fulfils order → release() →
 *         Protocol fee deducted, remainder sent to merchant.
 *
 *   Safety valves:
 *     - refund() after releaseDeadline if merchant never releases
 *     - dispute() by payer within disputeDeadline
 *     - resolve() by arbiter to split funds
 */
contract XAgentPayEscrow is Initializable, Ownable, ReentrancyGuard, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    string public constant VERSION = "4.1.0";
    uint16 public constant MAX_FEE_BPS = 500; // 5% hard cap
    uint256 public constant MAX_BATCH_SIZE = 20;
    uint256 public constant UPGRADE_DELAY = 48 hours; // M8: timelock for upgrades

    // EIP-712 constants for group signature verification
    bytes32 public constant XAGENT_GROUP_APPROVAL_TYPEHASH =
        keccak256("XAgentGroupApproval(bytes32 groupId,bytes32 entriesHash,uint256 totalAmount)");
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant DOMAIN_NAME_HASH = keccak256("XAgentPay");
    bytes32 public constant DOMAIN_VERSION_HASH = keccak256("1");

    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    struct BatchEntry {
        bytes32 paymentId;
        address merchant;
        uint256 amount;
        bytes32 orderRef;
        bytes32 merchantDid;
        bytes32 contextHash;
    }

    enum EscrowStatus {
        NONE,
        DEPOSITED,
        RELEASED,
        REFUNDED,
        DISPUTED,
        RESOLVED_TO_MERCHANT,
        RESOLVED_TO_PAYER,
        RESOLVED_SPLIT
    }

    struct Escrow {
        address payer;
        address merchant;
        uint256 amount;
        bytes32 orderRef;
        bytes32 merchantDid;
        bytes32 contextHash;
        uint256 releaseDeadline;
        uint256 disputeDeadline;
        EscrowStatus status;
        uint16 feeBps;
    }

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    IERC3009 public usdc;

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    uint256 public defaultReleaseTimeout;
    uint256 public defaultDisputeWindow;
    uint16 public protocolFeeBps;
    address public protocolFeeRecipient;
    address public arbiter;
    address public coreOperator;

    uint256 public arbitrationTimeout;

    /// @notice paymentId → Escrow
    mapping(bytes32 => Escrow) internal _escrows;

    /// @notice Group signature replay protection
    mapping(bytes32 => bool) public usedGroupIds;

    /// @notice When true, all batch deposits must use batchDepositWithGroupApproval
    bool public requireGroupSig;

    /// @notice M8: Pending upgrade for timelock
    address public pendingUpgradeImplementation;
    uint256 public pendingUpgradeReadyAt;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event Deposited(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        bytes32 orderRef
    );

    event BatchDeposited(
        address indexed payer,
        uint256 paymentCount,
        uint256 totalAmount
    );

    event Released(
        bytes32 indexed paymentId,
        address indexed merchant,
        uint256 merchantAmount,
        uint256 feeAmount
    );

    event Refunded(
        bytes32 indexed paymentId,
        address indexed payer,
        uint256 amount
    );

    event Disputed(
        bytes32 indexed paymentId,
        address indexed payer,
        bytes32 reason
    );

    event Resolved(
        bytes32 indexed paymentId,
        uint16 merchantBps,
        uint256 merchantAmount,
        uint256 payerAmount
    );

    event ArbiterUpdated(address indexed oldArbiter, address indexed newArbiter);
    event CoreOperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event ReleaseTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event DisputeWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event ProtocolFeeUpdated(uint16 oldBps, uint16 newBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event ArbitrationTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event DisputeAutoResolved(bytes32 indexed paymentId, address indexed payer, uint256 amount);
    event GroupSigVerified(bytes32 indexed groupId, address indexed coreOperator);
    event RequireGroupSigUpdated(bool oldValue, bool newValue);
    event UpgradeScheduled(address indexed implementation, uint256 readyAt);
    event UpgradeCancelled(address indexed implementation);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error ZeroAddress();
    error FeeTooHigh(uint16 feeBps);
    error ZeroAmount();
    error SelfPayment();
    error EscrowAlreadyExists(bytes32 paymentId);
    error EscrowNotFound(bytes32 paymentId);
    error InvalidStatus(EscrowStatus current, EscrowStatus expected);
    error NotPayer(address caller);
    error NotCoreOrMerchant(address caller);
    error NotArbiter(address caller);
    error ReleaseDeadlineNotReached(uint256 deadline, uint256 current);
    error DisputeWindowExpired(uint256 deadline, uint256 current);
    error InvalidBps(uint16 bps);
    error ZeroTimeout();
    error EmptyBatch();
    error BatchAmountMismatch(uint256 expected, uint256 actual);
    error BatchTooLarge(uint256 size);
    error ArbitrationTimeoutNotReached(uint256 deadline, uint256 current);
    error InvalidGroupSignature();
    error GroupIdAlreadyUsed(bytes32 groupId);
    error GroupSignatureRequired();
    error DisputeWindowStillActive(uint256 deadline, uint256 current);
    error UpgradeNotScheduled();
    error UpgradeTimelockNotExpired(uint256 readyAt, uint256 current);
    error UpgradeImplementationMismatch(address expected, address provided);

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert NotArbiter(msg.sender);
        _;
    }

    modifier onlyCoreOrMerchant(bytes32 paymentId) {
        Escrow storage e = _escrows[paymentId];
        if (msg.sender != coreOperator && msg.sender != e.merchant) {
            revert NotCoreOrMerchant(msg.sender);
        }
        _;
    }

    modifier onlyPayer(bytes32 paymentId) {
        if (msg.sender != _escrows[paymentId].payer) revert NotPayer(msg.sender);
        _;
    }

    // -----------------------------------------------------------------------
    // Constructor (disables initializers on implementation)
    // -----------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() Ownable(msg.sender) {
        _disableInitializers();
    }

    // -----------------------------------------------------------------------
    // Initializer (called once via proxy)
    // -----------------------------------------------------------------------

    /**
     * @param _usdc                  ERC-3009 compatible USDC address
     * @param _defaultReleaseTimeout Default seconds before refund becomes available
     * @param _defaultDisputeWindow  Default seconds (from deposit) within which payer can dispute
     * @param _protocolFeeBps        Protocol fee in basis points (max 500 = 5%)
     * @param _protocolFeeRecipient  Address receiving protocol fees
     * @param _xagentOperator        Address acting as both arbiter and coreOperator initially
     * @param _arbitrationTimeout    Seconds arbiter has to resolve disputes (H8 fix)
     */
    function initialize(
        address _usdc,
        uint256 _defaultReleaseTimeout,
        uint256 _defaultDisputeWindow,
        uint16 _protocolFeeBps,
        address _protocolFeeRecipient,
        address _xagentOperator,
        uint256 _arbitrationTimeout
    ) external initializer {
        _transferOwnership(msg.sender);

        if (_usdc == address(0)) revert ZeroAddress();
        if (_protocolFeeRecipient == address(0)) revert ZeroAddress();
        if (_xagentOperator == address(0)) revert ZeroAddress();
        if (_protocolFeeBps > MAX_FEE_BPS) revert FeeTooHigh(_protocolFeeBps);
        if (_defaultReleaseTimeout == 0) revert ZeroTimeout();
        if (_defaultDisputeWindow == 0) revert ZeroTimeout();
        if (_arbitrationTimeout == 0) revert ZeroTimeout();

        usdc = IERC3009(_usdc);
        defaultReleaseTimeout = _defaultReleaseTimeout;
        defaultDisputeWindow = _defaultDisputeWindow;
        protocolFeeBps = _protocolFeeBps;
        protocolFeeRecipient = _protocolFeeRecipient;
        arbiter = _xagentOperator;
        coreOperator = _xagentOperator;
        arbitrationTimeout = _arbitrationTimeout;
        requireGroupSig = true; // 4c: require group signatures by default
    }

    // -----------------------------------------------------------------------
    // Deposit — EIP-3009
    // -----------------------------------------------------------------------

    /**
     * @notice Deposit funds into escrow using EIP-3009 transferWithAuthorization.
     *         The payer signs off-chain; a relayer submits this tx.
     */
    function depositWithAuthorization(
        bytes32 paymentId,
        address from,
        address merchant,
        uint256 amount,
        bytes32 orderRef,
        bytes32 merchantDid,
        bytes32 contextHash,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _validateDeposit(paymentId, from, merchant, amount);

        // EIP-3009: token transfers from `from` to this contract
        usdc.transferWithAuthorization(
            from,
            address(this),
            amount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );

        _createEscrow(paymentId, from, merchant, amount, orderRef, merchantDid, contextHash);
    }

    // -----------------------------------------------------------------------
    // Deposit — Traditional approve/transferFrom
    // -----------------------------------------------------------------------

    /**
     * @notice Deposit funds using traditional approve + transferFrom pattern.
     *         Caller must have approved this contract for `amount`.
     */
    function deposit(
        bytes32 paymentId,
        address merchant,
        uint256 amount,
        bytes32 orderRef,
        bytes32 merchantDid,
        bytes32 contextHash
    ) external nonReentrant {
        _validateDeposit(paymentId, msg.sender, merchant, amount);

        IERC20(address(usdc)).safeTransferFrom(msg.sender, address(this), amount);

        _createEscrow(paymentId, msg.sender, merchant, amount, orderRef, merchantDid, contextHash);
    }

    // -----------------------------------------------------------------------
    // Batch Deposit — EIP-3009 (user submits directly, no relayer)
    // -----------------------------------------------------------------------

    /**
     * @notice Batch deposit using a single EIP-3009 transferWithAuthorization.
     *         The caller signs one authorization for the total amount, then
     *         calls this function directly (user pays gas, no relayer needed).
     *         Creates N escrow entries from a single token transfer.
     *
     * @param entries       Array of BatchEntry structs (paymentId, merchant, amount, etc.)
     * @param totalAmount   Total amount to transfer (must equal sum of entry amounts)
     * @param validAfter    EIP-3009 validAfter timestamp
     * @param validBefore   EIP-3009 validBefore timestamp
     * @param nonce         EIP-3009 nonce
     * @param v             Signature v
     * @param r             Signature r
     * @param s             Signature s
     */
    function batchDepositWithAuthorization(
        BatchEntry[] calldata entries,
        uint256 totalAmount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (requireGroupSig) revert GroupSignatureRequired();
        if (entries.length == 0) revert EmptyBatch();
        if (entries.length > MAX_BATCH_SIZE) revert BatchTooLarge(entries.length);

        // Verify total matches sum of entries
        uint256 sum = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            sum += entries[i].amount;
        }
        if (sum != totalAmount) revert BatchAmountMismatch(totalAmount, sum);

        // EIP-3009: transfer total from msg.sender to this contract
        usdc.transferWithAuthorization(
            msg.sender,
            address(this),
            totalAmount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );

        // Create N escrow entries
        for (uint256 i = 0; i < entries.length; i++) {
            BatchEntry calldata e = entries[i];
            _validateDeposit(e.paymentId, msg.sender, e.merchant, e.amount);
            _createEscrow(
                e.paymentId,
                msg.sender,
                e.merchant,
                e.amount,
                e.orderRef,
                e.merchantDid,
                e.contextHash
            );
        }

        emit BatchDeposited(msg.sender, entries.length, totalAmount);
    }

    // -----------------------------------------------------------------------
    // Batch Deposit — approve + transferFrom (works with bridged USDC on XLayer)
    // -----------------------------------------------------------------------

    /**
     * @notice Batch deposit using approve+transferFrom with on-chain XAgentCore
     *         group-signature verification. Use this on chains where USDC does
     *         NOT implement EIP-3009 transferWithAuthorization (e.g. XLayer).
     *
     *         Two-step UX:
     *           1. User calls USDC.approve(escrow, totalAmount)
     *           2. User calls this function
     *
     * @param entries        Array of BatchEntry structs
     * @param totalAmount    Must equal sum of entry amounts
     * @param groupIdBytes32 Unique group ID (replay protection)
     * @param groupV         Group-sig v
     * @param groupR         Group-sig r
     * @param groupS         Group-sig s
     */
    function batchDepositApprove(
        BatchEntry[] calldata entries,
        uint256 totalAmount,
        bytes32 groupIdBytes32,
        uint8 groupV,
        bytes32 groupR,
        bytes32 groupS
    ) external nonReentrant {
        if (entries.length == 0) revert EmptyBatch();
        if (entries.length > MAX_BATCH_SIZE) revert BatchTooLarge(entries.length);
        if (usedGroupIds[groupIdBytes32]) revert GroupIdAlreadyUsed(groupIdBytes32);
        usedGroupIds[groupIdBytes32] = true;

        _verifyGroupSignature(groupIdBytes32, entries, totalAmount, groupV, groupR, groupS);

        uint256 sum = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            sum += entries[i].amount;
        }
        if (sum != totalAmount) revert BatchAmountMismatch(totalAmount, sum);

        // Use standard approve+transferFrom (compatible with bridged USDC)
        IERC20(address(usdc)).safeTransferFrom(msg.sender, address(this), totalAmount);

        for (uint256 i = 0; i < entries.length; i++) {
            BatchEntry calldata e = entries[i];
            _validateDeposit(e.paymentId, msg.sender, e.merchant, e.amount);
            _createEscrow(
                e.paymentId,
                msg.sender,
                e.merchant,
                e.amount,
                e.orderRef,
                e.merchantDid,
                e.contextHash
            );
        }

        emit BatchDeposited(msg.sender, entries.length, totalAmount);
        emit GroupSigVerified(groupIdBytes32, coreOperator);
    }

    // -----------------------------------------------------------------------
    // Release
    // -----------------------------------------------------------------------

    /**
     * @notice Release escrowed funds to the merchant (minus protocol fee).
     *         Can be called by the merchant or the coreOperator.
     */
    function release(bytes32 paymentId)
        external
        nonReentrant
        onlyCoreOrMerchant(paymentId)
    {
        Escrow storage e = _escrows[paymentId];
        if (e.status != EscrowStatus.DEPOSITED) {
            revert InvalidStatus(e.status, EscrowStatus.DEPOSITED);
        }
        // 4b: block release while dispute window is still open to prevent front-running
        if (block.timestamp <= e.disputeDeadline) {
            revert DisputeWindowStillActive(e.disputeDeadline, block.timestamp);
        }

        e.status = EscrowStatus.RELEASED;

        uint256 fee = (e.amount * e.feeBps) / 10_000;
        uint256 merchantAmount = e.amount - fee;

        if (fee > 0) {
            IERC20(address(usdc)).safeTransfer(protocolFeeRecipient, fee);
        }
        IERC20(address(usdc)).safeTransfer(e.merchant, merchantAmount);

        emit Released(paymentId, e.merchant, merchantAmount, fee);
    }

    // -----------------------------------------------------------------------
    // Refund
    // -----------------------------------------------------------------------

    /**
     * @notice Refund escrowed funds to the payer after release deadline has passed.
     *         Anyone can trigger this (permissionless after timeout).
     */
    function refund(bytes32 paymentId) external nonReentrant {
        Escrow storage e = _escrows[paymentId];
        if (e.status != EscrowStatus.DEPOSITED) {
            revert InvalidStatus(e.status, EscrowStatus.DEPOSITED);
        }
        if (block.timestamp < e.releaseDeadline) {
            revert ReleaseDeadlineNotReached(e.releaseDeadline, block.timestamp);
        }

        e.status = EscrowStatus.REFUNDED;

        IERC20(address(usdc)).safeTransfer(e.payer, e.amount);

        emit Refunded(paymentId, e.payer, e.amount);
    }

    // -----------------------------------------------------------------------
    // Dispute
    // -----------------------------------------------------------------------

    /**
     * @notice Payer disputes the escrow within the dispute window.
     *         Freezes the escrow until the arbiter resolves it.
     */
    function dispute(bytes32 paymentId, bytes32 reason)
        external
        nonReentrant
        onlyPayer(paymentId)
    {
        Escrow storage e = _escrows[paymentId];
        if (e.status != EscrowStatus.DEPOSITED) {
            revert InvalidStatus(e.status, EscrowStatus.DEPOSITED);
        }
        if (block.timestamp > e.disputeDeadline) {
            revert DisputeWindowExpired(e.disputeDeadline, block.timestamp);
        }

        e.status = EscrowStatus.DISPUTED;

        emit Disputed(paymentId, e.payer, reason);
    }

    // -----------------------------------------------------------------------
    // Resolve
    // -----------------------------------------------------------------------

    /**
     * @notice Arbiter resolves a disputed escrow by splitting funds.
     * @param paymentId   The escrow to resolve
     * @param merchantBps Basis points (0–10000) of escrowed amount going to merchant
     */
    function resolve(bytes32 paymentId, uint16 merchantBps)
        external
        nonReentrant
        onlyArbiter
    {
        if (merchantBps > 10_000) revert InvalidBps(merchantBps);

        Escrow storage e = _escrows[paymentId];
        if (e.status != EscrowStatus.DISPUTED) {
            revert InvalidStatus(e.status, EscrowStatus.DISPUTED);
        }

        uint256 merchantAmount = (e.amount * merchantBps) / 10_000;
        uint256 payerAmount = e.amount - merchantAmount;

        if (merchantBps == 10_000) {
            e.status = EscrowStatus.RESOLVED_TO_MERCHANT;
        } else if (merchantBps == 0) {
            e.status = EscrowStatus.RESOLVED_TO_PAYER;
        } else {
            e.status = EscrowStatus.RESOLVED_SPLIT;
        }

        if (merchantAmount > 0) {
            IERC20(address(usdc)).safeTransfer(e.merchant, merchantAmount);
        }
        if (payerAmount > 0) {
            IERC20(address(usdc)).safeTransfer(e.payer, payerAmount);
        }

        emit Resolved(paymentId, merchantBps, merchantAmount, payerAmount);
    }

    // -----------------------------------------------------------------------
    // Dispute auto-resolution (H-01 fix)
    // -----------------------------------------------------------------------

    /**
     * @notice Refund escrowed funds to the payer if a disputed escrow remains
     *         unresolved past the arbitration timeout. Permissionless.
     */
    function refundUnresolvedDispute(bytes32 paymentId) external nonReentrant {
        Escrow storage e = _escrows[paymentId];
        if (e.status != EscrowStatus.DISPUTED) {
            revert InvalidStatus(e.status, EscrowStatus.DISPUTED);
        }
        if (block.timestamp < e.disputeDeadline + arbitrationTimeout) {
            revert ArbitrationTimeoutNotReached(
                e.disputeDeadline + arbitrationTimeout,
                block.timestamp
            );
        }

        e.status = EscrowStatus.RESOLVED_TO_PAYER;

        IERC20(address(usdc)).safeTransfer(e.payer, e.amount);

        emit DisputeAutoResolved(paymentId, e.payer, e.amount);
    }

    // -----------------------------------------------------------------------
    // Batch Deposit with Group Approval (EIP-712 verified)
    // -----------------------------------------------------------------------

    /**
     * @notice Batch deposit with on-chain verification of the XAgent Core
     *         group signature. Prevents MITM tampering of entries.
     */
    function batchDepositWithGroupApproval(
        BatchEntry[] calldata entries,
        uint256 totalAmount,
        bytes32 groupIdBytes32,
        uint8 groupV,
        bytes32 groupR,
        bytes32 groupS,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (entries.length == 0) revert EmptyBatch();
        if (entries.length > MAX_BATCH_SIZE) revert BatchTooLarge(entries.length);
        if (usedGroupIds[groupIdBytes32]) revert GroupIdAlreadyUsed(groupIdBytes32);
        usedGroupIds[groupIdBytes32] = true;

        _verifyGroupSignature(groupIdBytes32, entries, totalAmount, groupV, groupR, groupS);

        uint256 sum = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            sum += entries[i].amount;
        }
        if (sum != totalAmount) revert BatchAmountMismatch(totalAmount, sum);

        usdc.transferWithAuthorization(
            msg.sender,
            address(this),
            totalAmount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );

        for (uint256 i = 0; i < entries.length; i++) {
            BatchEntry calldata e = entries[i];
            _validateDeposit(e.paymentId, msg.sender, e.merchant, e.amount);
            _createEscrow(
                e.paymentId,
                msg.sender,
                e.merchant,
                e.amount,
                e.orderRef,
                e.merchantDid,
                e.contextHash
            );
        }

        emit BatchDeposited(msg.sender, entries.length, totalAmount);
        emit GroupSigVerified(groupIdBytes32, coreOperator);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /**
     * @notice Get full escrow details.
     */
    function getEscrow(bytes32 paymentId) external view returns (Escrow memory) {
        return _escrows[paymentId];
    }

    /**
     * @notice Returns true if the escrow is past its release deadline and still DEPOSITED.
     */
    function isRefundable(bytes32 paymentId) external view returns (bool) {
        Escrow storage e = _escrows[paymentId];
        return e.status == EscrowStatus.DEPOSITED && block.timestamp >= e.releaseDeadline;
    }

    /**
     * @notice Returns true if the escrow is DEPOSITED and within its dispute window.
     */
    function isDisputable(bytes32 paymentId) external view returns (bool) {
        Escrow storage e = _escrows[paymentId];
        return e.status == EscrowStatus.DEPOSITED && block.timestamp <= e.disputeDeadline;
    }

    function isGroupIdUsed(bytes32 groupIdBytes32) external view returns (bool) {
        return usedGroupIds[groupIdBytes32];
    }

    function computeDomainSeparator() external view returns (bytes32) {
        return _computeDomainSeparator();
    }

    // -----------------------------------------------------------------------
    // Admin functions (onlyOwner)
    // -----------------------------------------------------------------------

    function setArbiter(address newArbiter) external onlyOwner {
        if (newArbiter == address(0)) revert ZeroAddress();
        emit ArbiterUpdated(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    function setCoreOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        emit CoreOperatorUpdated(coreOperator, newOperator);
        coreOperator = newOperator;
    }

    function setDefaultReleaseTimeout(uint256 newTimeout) external onlyOwner {
        if (newTimeout == 0) revert ZeroTimeout();
        emit ReleaseTimeoutUpdated(defaultReleaseTimeout, newTimeout);
        defaultReleaseTimeout = newTimeout;
    }

    function setDefaultDisputeWindow(uint256 newWindow) external onlyOwner {
        if (newWindow == 0) revert ZeroTimeout();
        emit DisputeWindowUpdated(defaultDisputeWindow, newWindow);
        defaultDisputeWindow = newWindow;
    }

    function setProtocolFeeBps(uint16 newBps) external onlyOwner {
        if (newBps > MAX_FEE_BPS) revert FeeTooHigh(newBps);
        emit ProtocolFeeUpdated(protocolFeeBps, newBps);
        protocolFeeBps = newBps;
    }

    function setProtocolFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(protocolFeeRecipient, newRecipient);
        protocolFeeRecipient = newRecipient;
    }

    function setArbitrationTimeout(uint256 newTimeout) external onlyOwner {
        if (newTimeout == 0) revert ZeroTimeout();
        emit ArbitrationTimeoutUpdated(arbitrationTimeout, newTimeout);
        arbitrationTimeout = newTimeout;
    }

    function setRequireGroupSig(bool _require) external onlyOwner {
        emit RequireGroupSigUpdated(requireGroupSig, _require);
        requireGroupSig = _require;
    }

    // -----------------------------------------------------------------------
    // UUPS upgrade authorization (M8: timelock)
    // -----------------------------------------------------------------------

    /**
     * @notice Schedule an upgrade with a 48-hour timelock.
     */
    function scheduleUpgrade(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        pendingUpgradeImplementation = newImplementation;
        pendingUpgradeReadyAt = block.timestamp + UPGRADE_DELAY;
        emit UpgradeScheduled(newImplementation, pendingUpgradeReadyAt);
    }

    /**
     * @notice Cancel a pending upgrade.
     */
    function cancelUpgrade() external onlyOwner {
        address impl = pendingUpgradeImplementation;
        if (impl == address(0)) revert UpgradeNotScheduled();
        delete pendingUpgradeImplementation;
        delete pendingUpgradeReadyAt;
        emit UpgradeCancelled(impl);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        if (pendingUpgradeImplementation == address(0)) revert UpgradeNotScheduled();
        if (pendingUpgradeImplementation != newImplementation) {
            revert UpgradeImplementationMismatch(pendingUpgradeImplementation, newImplementation);
        }
        if (block.timestamp < pendingUpgradeReadyAt) {
            revert UpgradeTimelockNotExpired(pendingUpgradeReadyAt, block.timestamp);
        }
        delete pendingUpgradeImplementation;
        delete pendingUpgradeReadyAt;
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            DOMAIN_NAME_HASH,
            DOMAIN_VERSION_HASH,
            block.chainid,
            address(this)
        ));
    }

    function _computeEntriesHash(BatchEntry[] calldata entries) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < entries.length; i++) {
            packed = bytes.concat(packed, abi.encode(
                entries[i].paymentId,
                entries[i].merchant,
                entries[i].amount,
                entries[i].orderRef,
                entries[i].merchantDid,
                entries[i].contextHash
            ));
        }
        return keccak256(packed);
    }

    function _verifyGroupSignature(
        bytes32 groupIdBytes32,
        BatchEntry[] calldata entries,
        uint256 totalAmount,
        uint8 groupV,
        bytes32 groupR,
        bytes32 groupS
    ) internal view {
        bytes32 entriesHash = _computeEntriesHash(entries);
        bytes32 structHash = keccak256(abi.encode(
            XAGENT_GROUP_APPROVAL_TYPEHASH,
            groupIdBytes32,
            entriesHash,
            totalAmount
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            _computeDomainSeparator(),
            structHash
        ));
        address signer = ecrecover(digest, groupV, groupR, groupS);
        if (signer == address(0) || signer != coreOperator) {
            revert InvalidGroupSignature();
        }
    }

    function _validateDeposit(
        bytes32 paymentId,
        address payer,
        address merchant,
        uint256 amount
    ) internal view {
        if (payer == address(0)) revert ZeroAddress();
        if (merchant == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (payer == merchant) revert SelfPayment();
        if (_escrows[paymentId].status != EscrowStatus.NONE) {
            revert EscrowAlreadyExists(paymentId);
        }
    }

    function _createEscrow(
        bytes32 paymentId,
        address payer,
        address merchant,
        uint256 amount,
        bytes32 orderRef,
        bytes32 merchantDid,
        bytes32 contextHash
    ) internal {
        _escrows[paymentId] = Escrow({
            payer: payer,
            merchant: merchant,
            amount: amount,
            orderRef: orderRef,
            merchantDid: merchantDid,
            contextHash: contextHash,
            releaseDeadline: block.timestamp + defaultReleaseTimeout,
            disputeDeadline: block.timestamp + defaultDisputeWindow,
            status: EscrowStatus.DEPOSITED,
            feeBps: protocolFeeBps
        });

        emit Deposited(paymentId, payer, merchant, amount, orderRef);
    }

    // -----------------------------------------------------------------------
    // M7: Storage gap for future upgrades
    // -----------------------------------------------------------------------

    uint256[50] private __gap;
}
