// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC3009} from "../../src/interfaces/IERC3009.sol";

/**
 * @title MockUSDC
 * @notice ERC20 + EIP-3009 mock for testing. Mimics Circle USDC behaviour.
 */
contract MockUSDC is ERC20, EIP712, IERC3009 {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    /// @notice Tracks used nonces: authorizer → nonce → used
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    error AuthorizationAlreadyUsed(address authorizer, bytes32 nonce);
    error AuthorizationNotYetValid(uint256 validAfter, uint256 current);
    error AuthorizationExpired(uint256 validBefore, uint256 current);
    error InvalidSignature(address expected, address recovered);

    constructor() ERC20("USD Coin", "USDC") EIP712("USD Coin", "2") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // -----------------------------------------------------------------------
    // EIP-3009 implementation
    // -----------------------------------------------------------------------

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
    ) external override {
        if (block.timestamp <= validAfter) {
            revert AuthorizationNotYetValid(validAfter, block.timestamp);
        }
        if (block.timestamp >= validBefore) {
            revert AuthorizationExpired(validBefore, block.timestamp);
        }
        if (_authorizationStates[from][nonce]) {
            revert AuthorizationAlreadyUsed(from, nonce);
        }

        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, v, r, s);

        if (signer != from) {
            revert InvalidSignature(from, signer);
        }

        _authorizationStates[from][nonce] = true;
        _transfer(from, to, value);
    }

    function authorizationState(address authorizer, bytes32 nonce)
        external
        view
        override
        returns (bool)
    {
        return _authorizationStates[authorizer][nonce];
    }

    // -----------------------------------------------------------------------
    // Test helpers
    // -----------------------------------------------------------------------

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Expose the EIP-712 domain separator for tests to build signatures.
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // -----------------------------------------------------------------------
    // IERC20 overrides required by diamond inheritance (ERC20 + IERC3009→IERC20)
    // -----------------------------------------------------------------------

    function totalSupply() public view override(ERC20, IERC20) returns (uint256) {
        return super.totalSupply();
    }

    function balanceOf(address account) public view override(ERC20, IERC20) returns (uint256) {
        return super.balanceOf(account);
    }

    function transfer(address to, uint256 value) public override(ERC20, IERC20) returns (bool) {
        return super.transfer(to, value);
    }

    function allowance(address owner, address spender)
        public
        view
        override(ERC20, IERC20)
        returns (uint256)
    {
        return super.allowance(owner, spender);
    }

    function approve(address spender, uint256 value) public override(ERC20, IERC20) returns (bool) {
        return super.approve(spender, value);
    }

    function transferFrom(address from, address to, uint256 value)
        public
        override(ERC20, IERC20)
        returns (bool)
    {
        return super.transferFrom(from, to, value);
    }
}
