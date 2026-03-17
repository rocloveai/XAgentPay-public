/**
 * NexusPayEscrow contract ABI — events and functions used by Relayer and Chain Watcher.
 */
import { parseAbi } from "viem";

/** Events only — used by ChainWatcher getLogs() */
export const XAGENT_PAY_ESCROW_EVENTS = parseAbi([
  "event Deposited(bytes32 indexed paymentId, address indexed payer, address indexed merchant, uint256 amount, bytes32 orderRef)",
  "event BatchDeposited(address indexed payer, uint256 paymentCount, uint256 totalAmount)",
  "event Released(bytes32 indexed paymentId, address indexed merchant, uint256 merchantAmount, uint256 feeAmount)",
  "event Refunded(bytes32 indexed paymentId, address indexed payer, uint256 amount)",
  "event Disputed(bytes32 indexed paymentId, address indexed payer, bytes32 reason)",
  "event Resolved(bytes32 indexed paymentId, uint16 merchantBps, uint256 merchantAmount, uint256 payerAmount)",
]);

/** Full ABI (events + functions + errors) — used by Relayer, Instruction Builder, and Chain Watcher */
export const XAGENT_PAY_ESCROW_ABI = parseAbi([
  // Events
  "event Deposited(bytes32 indexed paymentId, address indexed payer, address indexed merchant, uint256 amount, bytes32 orderRef)",
  "event BatchDeposited(address indexed payer, uint256 paymentCount, uint256 totalAmount)",
  "event Released(bytes32 indexed paymentId, address indexed merchant, uint256 merchantAmount, uint256 feeAmount)",
  "event Refunded(bytes32 indexed paymentId, address indexed payer, uint256 amount)",
  "event Disputed(bytes32 indexed paymentId, address indexed payer, bytes32 reason)",
  "event Resolved(bytes32 indexed paymentId, uint16 merchantBps, uint256 merchantAmount, uint256 payerAmount)",

  // Functions
  "function depositWithAuthorization(bytes32 paymentId, address from, address merchant, uint256 amount, bytes32 orderRef, bytes32 merchantDid, bytes32 contextHash, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function batchDepositWithAuthorization((bytes32 paymentId, address merchant, uint256 amount, bytes32 orderRef, bytes32 merchantDid, bytes32 contextHash)[] entries, uint256 totalAmount, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function batchDepositWithGroupApproval((bytes32 paymentId, address merchant, uint256 amount, bytes32 orderRef, bytes32 merchantDid, bytes32 contextHash)[] entries, uint256 totalAmount, bytes32 groupIdBytes32, uint8 groupV, bytes32 groupR, bytes32 groupS, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function batchDepositApprove((bytes32 paymentId, address merchant, uint256 amount, bytes32 orderRef, bytes32 merchantDid, bytes32 contextHash)[] entries, uint256 totalAmount, bytes32 groupIdBytes32, uint8 groupV, bytes32 groupR, bytes32 groupS)",
  "function release(bytes32 paymentId)",
  "function refund(bytes32 paymentId)",
  "function dispute(bytes32 paymentId, bytes32 reason)",
  "function resolve(bytes32 paymentId, uint16 merchantBps)",
  "function getEscrow(bytes32 paymentId) view returns ((address,address,uint256,bytes32,bytes32,bytes32,uint256,uint256,uint8))",

  // Custom errors
  "error ZeroAddress()",
  "error FeeTooHigh(uint16 feeBps)",
  "error ZeroAmount()",
  "error SelfPayment()",
  "error EscrowAlreadyExists(bytes32 paymentId)",
  "error EscrowNotFound(bytes32 paymentId)",
  "error InvalidStatus(uint8 current, uint8 expected)",
  "error NotPayer(address caller)",
  "error NotCoreOrMerchant(address caller)",
  "error NotArbiter(address caller)",
  "error ReleaseDeadlineNotReached(uint256 deadline, uint256 current)",
  "error DisputeWindowExpired(uint256 deadline, uint256 current)",
  "error InvalidBps(uint16 bps)",
  "error ZeroTimeout()",
  "error EmptyBatch()",
  "error BatchAmountMismatch(uint256 expected, uint256 actual)",
  "error BatchTooLarge(uint256 size)",
  "error ArbitrationTimeoutNotReached(uint256 deadline, uint256 current)",
  "error InvalidGroupSignature()",
  "error GroupIdAlreadyUsed(bytes32 groupId)",
  "error GroupSignatureRequired()",
]);
