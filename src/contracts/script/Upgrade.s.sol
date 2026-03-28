// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {XAgentPayEscrow} from "../src/XAgentPayEscrow.sol";

/**
 * @title Upgrade
 * @notice Upgrades XAgentPayEscrow proxy to v4.1.0 with security fixes.
 *
 * v4.1.0 adds:
 *   - H8: arbitrationTimeout in initialize()
 *   - M7: __gap storage slots
 *   - M8: 48-hour timelock on upgrades
 *   - 4b: release() blocked during dispute window
 *   - 4c: requireGroupSig defaults to true
 *
 * IMPORTANT: v4.1.0 introduces upgrade timelock. This script is a
 * two-step process:
 *   Step 1: Run with MODE=schedule to deploy new impl and schedule upgrade
 *   Step 2: Wait 48 hours, then run with MODE=execute to finalize
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   PROXY_ADDRESS=0x...
 *   MODE=schedule  # or "execute"
 *   forge script script/Upgrade.s.sol:Upgrade \
 *     --rpc-url xlayer_mainnet \
 *     --broadcast
 */
contract Upgrade is Script {
    // PlatON uses ms timestamps — 7 days in ms
    uint256 constant ARBITRATION_TIMEOUT = 604_800_000;
    // PlatON ms-corrected timeout values (M-01 fix)
    uint256 constant RELEASE_TIMEOUT_MS = 86_400_000;   // 24h in ms
    uint256 constant DISPUTE_WINDOW_MS  = 259_200_000;  // 72h in ms

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAddr = vm.envAddress("PROXY_ADDRESS");
        string memory mode = vm.envOr("MODE", string("schedule"));

        vm.startBroadcast(deployerPk);

        XAgentPayEscrow proxy = XAgentPayEscrow(proxyAddr);

        if (keccak256(bytes(mode)) == keccak256("schedule")) {
            // Step 1: Deploy new implementation and schedule upgrade
            XAgentPayEscrow newImpl = new XAgentPayEscrow();

            // Set arbitrationTimeout if not already set (H8 fix for existing deployment)
            if (proxy.arbitrationTimeout() == 0) {
                proxy.setArbitrationTimeout(ARBITRATION_TIMEOUT);
                console.log("Set arbitrationTimeout:", ARBITRATION_TIMEOUT);
            }

            // Schedule upgrade with 48-hour timelock
            proxy.scheduleUpgrade(address(newImpl));

            console.log("=== Upgrade Scheduled (48h timelock) ===");
            console.log("Proxy:", proxyAddr);
            console.log("New implementation:", address(newImpl));
            console.log("Ready at:", proxy.pendingUpgradeReadyAt());
        } else {
            // Step 2: Execute the upgrade after timelock
            address pendingImpl = proxy.pendingUpgradeImplementation();
            require(pendingImpl != address(0), "No upgrade scheduled");

            proxy.upgradeToAndCall(pendingImpl, "");

            console.log("=== XAgentPayEscrow v4.1.0 Upgrade Complete ===");
            console.log("Proxy:", proxyAddr);
            console.log("Version:", proxy.VERSION());
            console.log("arbitrationTimeout:", proxy.arbitrationTimeout());
            console.log("requireGroupSig:", proxy.requireGroupSig());
        }

        vm.stopBroadcast();
    }
}
