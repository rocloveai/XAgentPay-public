// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {NexusPayEscrow} from "../src/NexusPayEscrow.sol";

/**
 * @title Deploy
 * @notice Deploys NexusPayEscrow to PlatON devnet.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   FEE_RECIPIENT=0x...
 *   NEXUS_OPERATOR=0x...
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url platon_devnet \
 *     --broadcast \
 *     --verify
 */
contract Deploy is Script {
    // PlatON devnet USDC
    address constant USDC = 0xFF8dEe9983768D0399673014cf77826896F97e4d;

    // Defaults
    uint256 constant RELEASE_TIMEOUT = 86_400;   // 24 hours
    uint256 constant DISPUTE_WINDOW  = 259_200;  // 72 hours
    uint16  constant FEE_BPS         = 30;       // 0.3%

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address nexusOperator = vm.envAddress("NEXUS_OPERATOR");

        vm.startBroadcast(deployerPk);

        NexusPayEscrow escrow = new NexusPayEscrow(
            USDC,
            RELEASE_TIMEOUT,
            DISPUTE_WINDOW,
            FEE_BPS,
            feeRecipient,
            nexusOperator
        );

        console.log("NexusPayEscrow deployed at:", address(escrow));
        console.log("  USDC:", USDC);
        console.log("  feeRecipient:", feeRecipient);
        console.log("  nexusOperator:", nexusOperator);
        console.log("  feeBps:", FEE_BPS);

        vm.stopBroadcast();
    }
}
