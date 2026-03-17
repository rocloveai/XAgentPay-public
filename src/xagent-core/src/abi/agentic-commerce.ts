/**
 * AgenticCommerce + AutoEvaluator contract ABIs — events and functions
 * used by Relayer and Chain Watcher for ERC-8183 Agentic Commerce flow.
 */
import { parseAbi } from "viem";

/** Events only — used by ChainWatcher getLogs() */
export const AGENTIC_COMMERCE_EVENTS = parseAbi([
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 budget, uint256 expiredAt, string description)",
  "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
  "event JobCompleted(uint256 indexed jobId, address indexed provider, uint256 providerAmount, uint256 feeAmount, bytes32 reason)",
  "event JobRejected(uint256 indexed jobId, address indexed client, uint256 refundAmount, bytes32 reason)",
  "event JobExpired(uint256 indexed jobId, address indexed client, uint256 refundAmount)",
]);

/** Full ABI — used by Relayer for write operations + Chain Watcher for reads */
export const AGENTIC_COMMERCE_ABI = parseAbi([
  // Events
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 budget, uint256 expiredAt, string description)",
  "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
  "event JobCompleted(uint256 indexed jobId, address indexed provider, uint256 providerAmount, uint256 feeAmount, bytes32 reason)",
  "event JobRejected(uint256 indexed jobId, address indexed client, uint256 refundAmount, bytes32 reason)",
  "event JobExpired(uint256 indexed jobId, address indexed client, uint256 refundAmount)",

  // Core functions
  "function createAndFund(address provider, address evaluator, uint256 expiredAt, string description, uint256 budget) returns (uint256 jobId)",
  "function batchCreateAndFund(address[] providers, address[] evaluators, uint256[] expiredAts, string[] descriptions, uint256[] budgets) returns (uint256[] jobIds)",
  "function submit(uint256 jobId, bytes32 deliverable)",
  "function complete(uint256 jobId, bytes32 reason)",
  "function reject(uint256 jobId, bytes32 reason)",
  "function claimRefund(uint256 jobId)",

  // View functions
  "function getJob(uint256 jobId) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, bytes32 deliverable, bytes32 completionReason))",
  "function isRefundable(uint256 jobId) view returns (bool)",
  "function nextJobId() view returns (uint256)",
  "function operator() view returns (address)",
  "function paymentToken() view returns (address)",
  "function protocolFeeBps() view returns (uint16)",
  "function protocolFeeRecipient() view returns (address)",
]);

/** AutoEvaluator ABI — used by Relayer */
export const AUTO_EVALUATOR_ABI = parseAbi([
  "event Evaluated(uint256 indexed jobId, bool approved, bytes32 reason)",
  "function evaluate(uint256 jobId)",
  "function rejectJob(uint256 jobId, bytes32 reason)",
  "function evaluatorOperator() view returns (address)",
]);
