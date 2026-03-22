// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IERC3009
 * @notice Minimal interface for EIP-3009 "Transfer With Authorization".
 *         Used by USDC and other compliant tokens.
 */
interface IERC3009 is IERC20 {
    /**
     * @notice Execute a transfer with a signed authorization (EIP-3009).
     * @param from        Payer's address (must match signer)
     * @param to          Payee's address
     * @param value       Amount to transfer
     * @param validAfter  Unix timestamp after which the authorization is valid
     * @param validBefore Unix timestamp before which the authorization is valid
     * @param nonce       Unique nonce to prevent replay
     * @param v           ECDSA signature v
     * @param r           ECDSA signature r
     * @param s           ECDSA signature s
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
     * @notice Returns true if the nonce has already been used by the authorizer.
     */
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
