/**
 * NexusPayEscrow contract ABI — events and functions used by Relayer and Chain Watcher.
 */
import { parseAbi } from "viem";

export const NEXUS_PAY_ESCROW_ABI = parseAbi([
  // Events
  "event Deposited(bytes32 indexed paymentId, address indexed payer, address indexed merchant, uint256 amount, bytes32 orderRef)",
  "event Released(bytes32 indexed paymentId, address indexed merchant, uint256 merchantAmount, uint256 feeAmount)",
  "event Refunded(bytes32 indexed paymentId, address indexed payer, uint256 amount)",
  "event Disputed(bytes32 indexed paymentId, address indexed payer, bytes32 reason)",
  "event Resolved(bytes32 indexed paymentId, uint16 merchantBps, uint256 merchantAmount, uint256 payerAmount)",

  // Functions
  "function depositWithAuthorization(bytes32 paymentId, address from, address merchant, uint256 amount, bytes32 orderRef, bytes32 merchantDid, bytes32 contextHash, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function release(bytes32 paymentId)",
  "function refund(bytes32 paymentId)",
  "function getEscrow(bytes32 paymentId) view returns ((address,address,uint256,bytes32,bytes32,bytes32,uint256,uint256,uint8))",
]);
