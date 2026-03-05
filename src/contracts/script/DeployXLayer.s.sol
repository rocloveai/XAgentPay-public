// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {NexusPayEscrow} from "../src/NexusPayEscrow.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployXLayer
 * @notice Deploys NexusPayEscrow behind a UUPS proxy to XLayer Mainnet.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   FEE_RECIPIENT=0x...
 *   NEXUS_OPERATOR=0x...
 *   forge script script/DeployXLayer.s.sol:DeployXLayer \
 *     --rpc-url xlayer_mainnet \
 *     --broadcast \
 *     --verify
 */
contract DeployXLayer is Script {
    // XLayer Mainnet USDC (native bridged USDC)
    address constant USDC = 0x74b7F16337b8972027F6196A17a631aC6dE26d22;

    // Defaults (same as original PlatON deployment)
    uint256 constant RELEASE_TIMEOUT = 86_400;   // 24 hours
    uint256 constant DISPUTE_WINDOW  = 259_200;  // 72 hours
    uint16  constant FEE_BPS         = 30;       // 0.3%

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address nexusOperator = vm.envAddress("NEXUS_OPERATOR");

        vm.startBroadcast(deployerPk);

        // 1. Deploy implementation
        NexusPayEscrow impl = new NexusPayEscrow();

        // 2. Encode initialize() calldata
        bytes memory initData = abi.encodeCall(
            NexusPayEscrow.initialize,
            (USDC, RELEASE_TIMEOUT, DISPUTE_WINDOW, FEE_BPS, feeRecipient, nexusOperator)
        );

        // 3. Deploy ERC1967Proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        console.log("=== NexusPayEscrow Deployed on XLayer Mainnet ===");
        console.log("Proxy (stable address):", address(proxy));
        console.log("Implementation:        ", address(impl));
        console.log("  USDC:                ", USDC);
        console.log("  feeRecipient:        ", feeRecipient);
        console.log("  nexusOperator:       ", nexusOperator);
        console.log("  feeBps:              ", FEE_BPS);
        console.log("  releaseTimeout:      ", RELEASE_TIMEOUT);
        console.log("  disputeWindow:       ", DISPUTE_WINDOW);

        vm.stopBroadcast();
    }
}
