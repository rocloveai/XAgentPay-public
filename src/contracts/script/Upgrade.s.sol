// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {XAgentPayEscrow} from "../src/XAgentPayEscrow.sol";

/**
 * @title Upgrade
 * @notice Upgrades XAgentPayEscrow proxy to v4.0.0 and configures new storage.
 *
 * v4.0.0 adds:
 *   - arbitrationTimeout (H-01 fix)
 *   - requireGroupSig + group signature verification
 *   - feeBps snapshot (L-04 fix)
 *   - MAX_BATCH_SIZE (M-02 fix)
 *   - RESOLVED_SPLIT status (M-03 fix)
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   PROXY_ADDRESS=0x...
 *   forge script script/Upgrade.s.sol:Upgrade \
 *     --rpc-url platon_devnet \
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

        vm.startBroadcast(deployerPk);

        // 1. Deploy new implementation
        XAgentPayEscrow newImpl = new XAgentPayEscrow();

        // 2. Upgrade proxy to new implementation
        XAgentPayEscrow proxy = XAgentPayEscrow(proxyAddr);
        proxy.upgradeToAndCall(address(newImpl), "");

        // 3. Configure new v4 storage (not in initialize, set via admin calls)
        proxy.setArbitrationTimeout(ARBITRATION_TIMEOUT);

        // 4. Fix M-01: correct timeout values for PlatON ms timestamps
        proxy.setDefaultReleaseTimeout(RELEASE_TIMEOUT_MS);
        proxy.setDefaultDisputeWindow(DISPUTE_WINDOW_MS);

        console.log("=== XAgentPayEscrow v4.0.0 Upgrade Complete ===");
        console.log("Proxy:", proxyAddr);
        console.log("New implementation:", address(newImpl));
        console.log("Version:", proxy.VERSION());
        console.log("arbitrationTimeout:", proxy.arbitrationTimeout());
        console.log("defaultReleaseTimeout:", proxy.defaultReleaseTimeout());
        console.log("defaultDisputeWindow:", proxy.defaultDisputeWindow());
        console.log("requireGroupSig:", proxy.requireGroupSig());

        vm.stopBroadcast();
    }
}
