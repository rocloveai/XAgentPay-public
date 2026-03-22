// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {AutoEvaluator} from "../src/AutoEvaluator.sol";

/**
 * @title DeployACP
 * @notice Deploys AgenticCommerce + AutoEvaluator to XLayer Mainnet.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   FEE_RECIPIENT=0x...
 *   OPERATOR=0x...
 *   forge script script/DeployACP.s.sol:DeployACP \
 *     --rpc-url xlayer_mainnet \
 *     --broadcast
 */
contract DeployACP is Script {
    // XLayer Mainnet USDC (native bridged USDC)
    address constant USDC = 0x74b7F16337b8972027F6196A17a631aC6dE26d22;

    // Protocol fee: 0.3%
    uint16 constant FEE_BPS = 30;

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address operatorAddr = vm.envAddress("OPERATOR");

        vm.startBroadcast(deployerPk);

        // 1. Deploy AgenticCommerce
        AgenticCommerce acp = new AgenticCommerce(
            USDC,
            FEE_BPS,
            feeRecipient,
            operatorAddr
        );

        // 2. Deploy AutoEvaluator (pointing to ACP, same operator)
        AutoEvaluator evaluator = new AutoEvaluator(
            address(acp),
            operatorAddr
        );

        console.log("=== ERC-8183 Agentic Commerce Deployed on XLayer ===");
        console.log("AgenticCommerce:  ", address(acp));
        console.log("AutoEvaluator:    ", address(evaluator));
        console.log("  USDC:           ", USDC);
        console.log("  feeRecipient:   ", feeRecipient);
        console.log("  operator:       ", operatorAddr);
        console.log("  feeBps:         ", FEE_BPS);

        vm.stopBroadcast();
    }
}
