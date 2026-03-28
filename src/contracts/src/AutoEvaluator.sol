// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgenticCommerce} from "./AgenticCommerce.sol";

/**
 * @title AutoEvaluator
 * @author XAgentPay Team
 * @notice Automated evaluator for ERC-8183 Agentic Commerce jobs.
 *
 *   This evaluator is operated by the relayer. It performs basic validation
 *   (deliverable is non-empty) and auto-approves jobs. For the hackathon demo,
 *   this provides the "third-party verification" step in the ERC-8183 flow.
 *
 *   In production, this would be replaced with:
 *   - AI-powered verification
 *   - Oracle-based validation
 *   - Multi-sig committee evaluation
 *   - Dispute resolution DAO
 */
contract AutoEvaluator is Ownable {
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    AgenticCommerce public immutable acp;
    address public evaluatorOperator;  // relayer address

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event Evaluated(uint256 indexed jobId, bool approved, bytes32 reason);
    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error NotOperator(address caller);
    error EmptyDeliverable(uint256 jobId);

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    modifier onlyOperator() {
        if (msg.sender != evaluatorOperator) revert NotOperator(msg.sender);
        _;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _acp      AgenticCommerce contract address
     * @param _operator Relayer address that can trigger evaluations
     */
    constructor(address _acp, address _operator) Ownable(msg.sender) {
        acp = AgenticCommerce(_acp);
        evaluatorOperator = _operator;
    }

    // -----------------------------------------------------------------------
    // Core: Evaluate (auto-approve)
    // -----------------------------------------------------------------------

    /**
     * @notice Auto-evaluate a submitted job. Verifies the deliverable is
     *         non-empty, then calls acp.complete() to release funds.
     *
     * @param jobId The job ID to evaluate
     */
    function evaluate(uint256 jobId) external onlyOperator {
        // Fetch job to verify deliverable was submitted
        AgenticCommerce.Job memory job = acp.getJob(jobId);

        // Basic validation: deliverable must be non-empty
        if (job.deliverable == bytes32(0)) revert EmptyDeliverable(jobId);

        bytes32 reason = bytes32("auto-verified");

        // Call complete on ACP contract (this contract is the evaluator)
        acp.complete(jobId, reason);

        emit Evaluated(jobId, true, reason);
    }

    // -----------------------------------------------------------------------
    // Core: Reject
    // -----------------------------------------------------------------------

    /**
     * @notice Reject a submitted job and refund the client.
     *
     * @param jobId  The job ID to reject
     * @param reason The reason for rejection
     */
    function rejectJob(uint256 jobId, bytes32 reason) external onlyOperator {
        acp.reject(jobId, reason);

        emit Evaluated(jobId, false, reason);
    }

    // -----------------------------------------------------------------------
    // Admin functions (onlyOwner)
    // -----------------------------------------------------------------------

    error ZeroAddress();

    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        emit OperatorUpdated(evaluatorOperator, newOperator);
        evaluatorOperator = newOperator;
    }
}
