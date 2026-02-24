// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/**
 * @title NexusPayEscrow
 * @author NexusPay Team
 * @notice Escrow contract for NexusPay payments.
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
contract NexusPayEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    string public constant VERSION = "2.0.0";
    uint16 public constant MAX_FEE_BPS = 500; // 5% hard cap

    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    enum EscrowStatus {
        NONE,
        DEPOSITED,
        RELEASED,
        REFUNDED,
        DISPUTED,
        RESOLVED_TO_MERCHANT,
        RESOLVED_TO_PAYER
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
    }

    // -----------------------------------------------------------------------
    // Immutables
    // -----------------------------------------------------------------------

    IERC3009 public immutable usdc;

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    uint256 public defaultReleaseTimeout;
    uint256 public defaultDisputeWindow;
    uint16 public protocolFeeBps;
    address public protocolFeeRecipient;
    address public arbiter;
    address public coreOperator;

    /// @notice paymentId → Escrow
    mapping(bytes32 => Escrow) internal _escrows;

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
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _usdc                  ERC-3009 compatible USDC address
     * @param _defaultReleaseTimeout Default seconds before refund becomes available
     * @param _defaultDisputeWindow  Default seconds (from deposit) within which payer can dispute
     * @param _protocolFeeBps        Protocol fee in basis points (max 500 = 5%)
     * @param _protocolFeeRecipient  Address receiving protocol fees
     * @param _nexusOperator         Address acting as both arbiter and coreOperator initially
     */
    constructor(
        address _usdc,
        uint256 _defaultReleaseTimeout,
        uint256 _defaultDisputeWindow,
        uint16 _protocolFeeBps,
        address _protocolFeeRecipient,
        address _nexusOperator
    ) Ownable(msg.sender) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_protocolFeeRecipient == address(0)) revert ZeroAddress();
        if (_nexusOperator == address(0)) revert ZeroAddress();
        if (_protocolFeeBps > MAX_FEE_BPS) revert FeeTooHigh(_protocolFeeBps);
        if (_defaultReleaseTimeout == 0) revert ZeroTimeout();
        if (_defaultDisputeWindow == 0) revert ZeroTimeout();

        usdc = IERC3009(_usdc);
        defaultReleaseTimeout = _defaultReleaseTimeout;
        defaultDisputeWindow = _defaultDisputeWindow;
        protocolFeeBps = _protocolFeeBps;
        protocolFeeRecipient = _protocolFeeRecipient;
        arbiter = _nexusOperator;
        coreOperator = _nexusOperator;
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

        e.status = EscrowStatus.RELEASED;

        uint256 fee = (e.amount * protocolFeeBps) / 10_000;
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
            // Partial split — use RESOLVED_TO_MERCHANT as the "resolved with split" status
            e.status = EscrowStatus.RESOLVED_TO_MERCHANT;
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

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

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
            status: EscrowStatus.DEPOSITED
        });

        emit Deposited(paymentId, payer, merchant, amount, orderRef);
    }
}
