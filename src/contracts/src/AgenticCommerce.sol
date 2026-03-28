// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgenticCommerce
 * @author XAgentPay Team
 * @notice ERC-8183 Agentic Commerce Protocol - Job-based escrow with evaluator verification.
 *
 *   Flow:
 *     1. Client calls createAndFund() → USDC locked, Job = Funded
 *     2. Provider calls submit(deliverable) → Job = Submitted
 *     3. Evaluator calls complete() → funds released to provider (minus fee)
 *     OR  Evaluator calls reject() → funds returned to client
 *     OR  Anyone calls claimRefund() after expiry → funds returned to client
 *
 *   Roles:
 *     - Client: creates and funds jobs (end user wallet)
 *     - Provider: merchant that delivers the service
 *     - Evaluator: verifies deliverable quality (AutoEvaluator contract)
 *     - Operator: privileged address that can submit on behalf of provider
 */
contract AgenticCommerce is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    string public constant VERSION = "1.1.0";
    uint16 public constant MAX_FEE_BPS = 500; // 5% hard cap
    uint256 public constant MAX_BATCH_SIZE = 20; // 5c: batch size limit

    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    enum JobStatus {
        None,       // 0 - slot unused
        Funded,     // 1 - client funded, awaiting provider delivery
        Submitted,  // 2 - provider submitted deliverable, awaiting evaluation
        Completed,  // 3 - evaluator approved, funds released to provider
        Rejected,   // 4 - evaluator rejected, funds returned to client
        Expired     // 5 - expired, funds returned to client
    }

    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;         // JSON metadata: {merchant_did, order_ref, summary}
        uint256 budget;             // USDC amount (6 decimals)
        uint256 expiredAt;          // Unix timestamp
        JobStatus status;
        bytes32 deliverable;        // Provider-submitted deliverable hash
        bytes32 completionReason;   // Evaluator's completion/rejection reason
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    IERC20 public immutable paymentToken;  // USDC on XLayer
    uint16 public protocolFeeBps;          // Protocol fee in basis points
    address public protocolFeeRecipient;
    address public operator;               // Relayer address, can submit on behalf of provider

    uint256 public nextJobId = 1;
    mapping(uint256 => Job) internal _jobs;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 budget,
        uint256 expiredAt,
        string description
    );

    event JobSubmitted(
        uint256 indexed jobId,
        address indexed provider,
        bytes32 deliverable
    );

    event JobCompleted(
        uint256 indexed jobId,
        address indexed provider,
        uint256 providerAmount,
        uint256 feeAmount,
        bytes32 reason
    );

    event JobRejected(
        uint256 indexed jobId,
        address indexed client,
        uint256 refundAmount,
        bytes32 reason
    );

    event JobExpired(
        uint256 indexed jobId,
        address indexed client,
        uint256 refundAmount
    );

    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event ProtocolFeeUpdated(uint16 oldBps, uint16 newBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error FeeTooHigh(uint16 feeBps);
    error SelfPayment();
    error InvalidExpiry(uint256 expiredAt);
    error JobNotFound(uint256 jobId);
    error InvalidStatus(JobStatus current, JobStatus expected);
    error NotProviderOrOperator(address caller);
    error NotEvaluator(address caller, address expected);
    error NotExpired(uint256 expiredAt, uint256 current);
    error BatchTooLarge(uint256 size);

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    modifier onlyProviderOrOperator(uint256 jobId) {
        Job storage j = _jobs[jobId];
        if (msg.sender != j.provider && msg.sender != operator) {
            revert NotProviderOrOperator(msg.sender);
        }
        _;
    }

    modifier onlyEvaluator(uint256 jobId) {
        Job storage j = _jobs[jobId];
        if (msg.sender != j.evaluator) {
            revert NotEvaluator(msg.sender, j.evaluator);
        }
        _;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _paymentToken       USDC address on XLayer
     * @param _protocolFeeBps     Protocol fee in basis points (e.g. 30 = 0.3%)
     * @param _feeRecipient       Address receiving protocol fees
     * @param _operator           Relayer/operator address
     */
    constructor(
        address _paymentToken,
        uint16 _protocolFeeBps,
        address _feeRecipient,
        address _operator
    ) Ownable(msg.sender) {
        if (_paymentToken == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_operator == address(0)) revert ZeroAddress();
        if (_protocolFeeBps > MAX_FEE_BPS) revert FeeTooHigh(_protocolFeeBps);

        paymentToken = IERC20(_paymentToken);
        protocolFeeBps = _protocolFeeBps;
        protocolFeeRecipient = _feeRecipient;
        operator = _operator;
    }

    // -----------------------------------------------------------------------
    // Core: Create & Fund
    // -----------------------------------------------------------------------

    /**
     * @notice Create a job and fund it in one step. Client must have approved
     *         this contract for `budget` amount of paymentToken.
     *
     * @param provider    Merchant wallet receiving funds on completion
     * @param evaluator   Contract/address that will verify the deliverable
     * @param expiredAt   Unix timestamp after which the job can be refunded
     * @param description JSON metadata about the job
     * @param budget      USDC amount to escrow
     * @return jobId      The newly created job ID
     */
    function createAndFund(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        uint256 budget
    ) external nonReentrant returns (uint256 jobId) {
        if (provider == address(0)) revert ZeroAddress();
        if (evaluator == address(0)) revert ZeroAddress();
        if (budget == 0) revert ZeroAmount();
        if (msg.sender == provider) revert SelfPayment();
        if (expiredAt <= block.timestamp) revert InvalidExpiry(expiredAt);

        jobId = nextJobId++;

        _jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: budget,
            expiredAt: expiredAt,
            status: JobStatus.Funded,
            deliverable: bytes32(0),
            completionReason: bytes32(0)
        });

        // Transfer USDC from client to this contract
        paymentToken.safeTransferFrom(msg.sender, address(this), budget);

        emit JobCreated(jobId, msg.sender, provider, evaluator, budget, expiredAt, description);
    }

    // -----------------------------------------------------------------------
    // Core: Batch Create & Fund
    // -----------------------------------------------------------------------

    /**
     * @notice Create multiple jobs and fund them in one transaction.
     *         Client must have approved this contract for the total budget.
     *         Single approve + single batchCreateAndFund = 2 signatures total.
     *
     * @param providers    Merchant wallets for each job
     * @param evaluators   Evaluator addresses for each job
     * @param expiredAts   Expiry timestamps for each job
     * @param descriptions JSON metadata for each job
     * @param budgets      USDC amounts for each job
     * @return jobIds      Array of newly created job IDs
     */
    function batchCreateAndFund(
        address[] calldata providers,
        address[] calldata evaluators,
        uint256[] calldata expiredAts,
        string[] calldata descriptions,
        uint256[] calldata budgets
    ) external nonReentrant returns (uint256[] memory jobIds) {
        uint256 len = providers.length;
        require(
            len == evaluators.length &&
            len == expiredAts.length &&
            len == descriptions.length &&
            len == budgets.length,
            "Array length mismatch"
        );
        require(len > 0, "Empty batch");
        if (len > MAX_BATCH_SIZE) revert BatchTooLarge(len);

        jobIds = new uint256[](len);
        uint256 totalBudget = 0;

        for (uint256 i = 0; i < len; i++) {
            if (providers[i] == address(0)) revert ZeroAddress();
            if (evaluators[i] == address(0)) revert ZeroAddress();
            if (budgets[i] == 0) revert ZeroAmount();
            if (msg.sender == providers[i]) revert SelfPayment();
            if (expiredAts[i] <= block.timestamp) revert InvalidExpiry(expiredAts[i]);

            uint256 jobId = nextJobId++;
            jobIds[i] = jobId;

            _jobs[jobId] = Job({
                id: jobId,
                client: msg.sender,
                provider: providers[i],
                evaluator: evaluators[i],
                description: descriptions[i],
                budget: budgets[i],
                expiredAt: expiredAts[i],
                status: JobStatus.Funded,
                deliverable: bytes32(0),
                completionReason: bytes32(0)
            });

            totalBudget += budgets[i];

            emit JobCreated(jobId, msg.sender, providers[i], evaluators[i], budgets[i], expiredAts[i], descriptions[i]);
        }

        // Single USDC transfer for total amount
        paymentToken.safeTransferFrom(msg.sender, address(this), totalBudget);
    }

    // -----------------------------------------------------------------------
    // Core: Submit Deliverable
    // -----------------------------------------------------------------------

    /**
     * @notice Provider (or operator on behalf of provider) submits a deliverable hash.
     *
     * @param jobId       The job to submit for
     * @param deliverable Hash of the deliverable (e.g. keccak256 of confirmation JSON)
     */
    function submit(uint256 jobId, bytes32 deliverable)
        external
        nonReentrant
        onlyProviderOrOperator(jobId)
    {
        Job storage j = _jobs[jobId];
        if (j.status == JobStatus.None) revert JobNotFound(jobId);
        if (j.status != JobStatus.Funded) {
            revert InvalidStatus(j.status, JobStatus.Funded);
        }
        if (block.timestamp >= j.expiredAt) revert NotExpired(j.expiredAt, block.timestamp);

        j.status = JobStatus.Submitted;
        j.deliverable = deliverable;

        emit JobSubmitted(jobId, j.provider, deliverable);
    }

    // -----------------------------------------------------------------------
    // Core: Complete (Evaluator approves)
    // -----------------------------------------------------------------------

    /**
     * @notice Evaluator verifies the deliverable and releases funds to provider.
     *         Protocol fee is deducted, remainder goes to provider.
     *
     * @param jobId  The job to complete
     * @param reason Evaluator's reason/proof hash
     */
    function complete(uint256 jobId, bytes32 reason)
        external
        nonReentrant
        onlyEvaluator(jobId)
    {
        Job storage j = _jobs[jobId];
        if (j.status == JobStatus.None) revert JobNotFound(jobId);
        if (j.status != JobStatus.Submitted) {
            revert InvalidStatus(j.status, JobStatus.Submitted);
        }

        j.status = JobStatus.Completed;
        j.completionReason = reason;

        uint256 fee = (j.budget * protocolFeeBps) / 10_000;
        uint256 providerAmount = j.budget - fee;

        if (fee > 0) {
            paymentToken.safeTransfer(protocolFeeRecipient, fee);
        }
        paymentToken.safeTransfer(j.provider, providerAmount);

        emit JobCompleted(jobId, j.provider, providerAmount, fee, reason);
    }

    // -----------------------------------------------------------------------
    // Core: Reject (Evaluator rejects)
    // -----------------------------------------------------------------------

    /**
     * @notice Evaluator rejects the deliverable and refunds the client.
     *
     * @param jobId  The job to reject
     * @param reason Evaluator's reason hash
     */
    function reject(uint256 jobId, bytes32 reason)
        external
        nonReentrant
        onlyEvaluator(jobId)
    {
        Job storage j = _jobs[jobId];
        if (j.status == JobStatus.None) revert JobNotFound(jobId);
        if (j.status != JobStatus.Submitted) {
            revert InvalidStatus(j.status, JobStatus.Submitted);
        }

        j.status = JobStatus.Rejected;
        j.completionReason = reason;

        paymentToken.safeTransfer(j.client, j.budget);

        emit JobRejected(jobId, j.client, j.budget, reason);
    }

    // -----------------------------------------------------------------------
    // Core: Claim Refund (Expired)
    // -----------------------------------------------------------------------

    /**
     * @notice Anyone can trigger a refund after the job has expired.
     *         Only works if job is still Funded or Submitted (not yet completed/rejected).
     *
     * @param jobId The job to refund
     */
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status == JobStatus.None) revert JobNotFound(jobId);
        if (j.status != JobStatus.Funded && j.status != JobStatus.Submitted) {
            revert InvalidStatus(j.status, JobStatus.Funded);
        }
        if (block.timestamp < j.expiredAt) {
            revert NotExpired(j.expiredAt, block.timestamp);
        }

        j.status = JobStatus.Expired;

        paymentToken.safeTransfer(j.client, j.budget);

        emit JobExpired(jobId, j.client, j.budget);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /**
     * @notice Get full job details.
     */
    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    /**
     * @notice Check if a job can be refunded (expired and still active).
     */
    function isRefundable(uint256 jobId) external view returns (bool) {
        Job storage j = _jobs[jobId];
        return (j.status == JobStatus.Funded || j.status == JobStatus.Submitted)
            && block.timestamp >= j.expiredAt;
    }

    // -----------------------------------------------------------------------
    // Admin functions (onlyOwner)
    // -----------------------------------------------------------------------

    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
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
}
